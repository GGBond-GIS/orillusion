import { ColorUtil } from "../utils/ColorUtil";
/**
 * @internal
 */
let BloomCfg =  /*wgsl*/ `
struct BloomCfg{
  downSampleStep: f32,
  downSampleBlurSize: f32,
  downSampleBlurSigma: f32,
  upSampleBlurSize: f32,
  upSampleBlurSigma: f32,
  luminanceThreshole: f32,
  bloomIntensity: f32,
  slot: f32,
}
@group(0) @binding(0) var<uniform> bloomCfg: BloomCfg;
`

let CalcUV_01 = /*wgsl*/ `
  fn CalcUV_01(coord:vec2<i32>, texSize:vec2<u32>) -> vec2<f32>
  {
    let u = (f32(coord.x) + 0.5) / f32(texSize.x);
    let v = (f32(coord.y) + 0.5) / f32(texSize.y);
    return vec2<f32>(u, v);
  }

`

//_______________calc weight
/**
 * @internal
 */
let GaussWeight2D: string =  /*wgsl*/ `
fn GaussWeight2D(x:f32, y:f32, sigma:f32) -> f32
  {
      let PI = 3.14159265358;
      let E  = 2.71828182846;
      let sigma_2 = pow(sigma, 2);
  
      let a = -(x*x + y*y) / (2.0 * sigma_2);
      return pow(E, a) / (2.0 * PI * sigma_2);
  }
`
/**
 * @internal
 */
let GaussBlur = function (GaussNxN: string, inTex: string, inTexSampler: string) {
  var code: string = /*wgsl*/ `

  fn ${GaussNxN}(uv:vec2<f32>, n:i32, stride:vec2<f32>, sigma:f32) -> vec3<f32>
  {
      var color = vec3<f32>(0.0);
      let r:i32 = n / 2;
      var weight:f32 = 0.0;
  
      for(var i:i32=-r; i<=r; i+=1)
      {
          for(var j=-r; j<=r; j+=1)
          {
              let w = GaussWeight2D(f32(i), f32(j), sigma);
              var coord:vec2<f32> = uv + vec2<f32>(f32(i), f32(j)) * stride ;
              color += textureSampleLevel(${inTex}, ${inTexSampler}, coord, 0.0).xyz * w;
              weight += w;
          }
      }
  
      color /= weight;
      return color;
  }`;
  return code;

}



//________________________pixel filter
/**
 * @internal
 */
export let threshold: string = /*wgsl*/ `
${ColorUtil}
${BloomCfg}

@group(0) @binding(1) var inTex : texture_2d<f32>;
@group(0) @binding(2) var outTex : texture_storage_2d<rgba16float, write>;

var<private> texSize: vec2<u32>;
var<private> fragCoord: vec2<i32>;

@compute @workgroup_size( 8 , 8 , 1 )
fn CsMain( @builtin(workgroup_id) workgroup_id : vec3<u32> , @builtin(global_invocation_id) globalInvocation_id : vec3<u32>)
{
  fragCoord = vec2<i32>( globalInvocation_id.xy );
  texSize = textureDimensions(inTex).xy;
  if(fragCoord.x >= i32(texSize.x) || fragCoord.y >= i32(texSize.y)){
      return;
  }
  var color = textureLoad(inTex, fragCoord, 0);
  // Sanitize NaN / +Inf from upstream PBR / SSR before the bloom pyramid
  // can blow up. Without this, a single bad pixel feeds (lum - threshold) /
  // max(lum, eps) which turns +Inf into Inf/Inf = NaN, the gauss blur
  // then propagates the NaN through the downsample / upsample chain,
  // and the postCompute bilinear sample paints a hard-edged ~355x355
  // square of zeros on the final composite (NaN tonemaps to 0).
  //
  // Detection uses clamp + self-equality. clamp(NaN) is impl-defined on
  // some WebGPU backends (returns NaN, returns 0, or returns the bound),
  // so a plain "x not equal x" NaN test was unreliable. Clamp first to
  // kill +/-Inf deterministically, then select-on-self-equality as a
  // second line in case clamp(NaN) leaks through.
  let clamped = clamp(color.rgb, vec3<f32>(-65504.0), vec3<f32>(65504.0));
  let is_finite = clamped == clamped;
  let safe_rgb = select(vec3<f32>(0.0), clamped, is_finite);
  // Soft-knee threshold: weight in [0,1]. Scaling by raw (lum - threshold)
  // unbounded-amplifies HDR specular highlights into the bloom buffer
  // (a 5-nit pixel becomes a 4x bloom seed; the upsample chain then sums
  // ~3 mips of that, blowing past what ACES can recover and causing the
  // big over-exposed halos seen on shiny PBR samples). Normalizing by lum
  // keeps the bloom buffer a soft-masked copy of the scene rather than
  // an amplified one.
  var lum = dot(vec3<f32>(0.2126, 0.7152, 0.0722), safe_rgb);
  var weight = max(0.0, lum - bloomCfg.luminanceThreshole) / max(lum, 1e-4);
  // weight alone only fixes the amplification — it still lets an
  // arbitrarily bright seed (weight approaches 1 as lum grows) pass its
  // raw HDR magnitude straight into the blur/downsample/upsample
  // pyramid. That pyramid spatially smears the value across a whole
  // blur radius *before* it ever reaches a tonemap curve, since the
  // single global ACES pass now runs once at the very end of the whole
  // frame (see TonemapPost) instead of once per post effect like in
  // 0.8 — so a lone blown-out highlight (specular, emissive, an SSR
  // mirror of a light) turns into a wide saturated-white halo instead
  // of a tight glow. Bound the seed's own magnitude here, the same way
  // 0.8's threshold pass did via this same ACESToneMapping helper,
  // before the soft-knee weight is applied.
  var toned = ACESToneMapping(safe_rgb, 1.0);
  var ret = toned * weight;
  textureStore(outTex, fragCoord, vec4<f32>(ret, color.w));
}
`

//________________________down sample
/**
 * @internal
 */
export let downSample: string = /*wgsl*/ `
${BloomCfg}

@group(0) @binding(1) var inTex : texture_2d<f32>;
@group(0) @binding(2) var inTexSampler: sampler;
@group(0) @binding(3) var outTex : texture_storage_2d<rgba16float, write>;

var<private> texSize: vec2<u32>;
var<private> fragCoord: vec2<i32>;

${GaussWeight2D}
${GaussBlur('GaussNxN', 'inTex', 'inTexSampler')}
${CalcUV_01}

@compute @workgroup_size( 8 , 8 , 1 )
fn CsMain( @builtin(workgroup_id) workgroup_id : vec3<u32> , @builtin(global_invocation_id) globalInvocation_id : vec3<u32>)
{
  fragCoord = vec2<i32>( globalInvocation_id.xy );
  texSize = textureDimensions(outTex).xy;
  if(fragCoord.x >= i32(texSize.x) || fragCoord.y >= i32(texSize.y)){
      return;
  }
  var color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  var uv = CalcUV_01(fragCoord, texSize);
  let stride = vec2<f32>(1.0) / vec2<f32>(f32(texSize.x), f32(texSize.y));   //  texel size of last level
  let rgb = GaussNxN(uv, i32(bloomCfg.downSampleBlurSize), stride, bloomCfg.downSampleBlurSigma);
  color = vec4<f32>(rgb, color.w);
  textureStore(outTex, fragCoord, color);
}
`


//__________________________up sample
/**
 * @internal
 */
export let upSample = /*wgsl*/ `
${BloomCfg}

@group(0) @binding(1) var _MainTex : texture_2d<f32>;
@group(0) @binding(2) var _MainTexSampler: sampler;
@group(0) @binding(3) var _PrevMip : texture_2d<f32>;
@group(0) @binding(4) var _PrevMipSampler: sampler;
@group(0) @binding(5) var outTex : texture_storage_2d<rgba16float, write>;

var<private> texSize: vec2<u32>;
var<private> fragCoord: vec2<i32>;

${GaussWeight2D}
${GaussBlur('GaussNxN_0', '_MainTex', '_MainTexSampler')}
${GaussBlur('GaussNxN_1', '_PrevMip', '_PrevMipSampler')}
${CalcUV_01}

@compute @workgroup_size( 8 , 8 , 1 )
fn CsMain( @builtin(workgroup_id) workgroup_id : vec3<u32> , @builtin(global_invocation_id) globalInvocation_id : vec3<u32>)
{
  fragCoord = vec2<i32>( globalInvocation_id.xy );
  texSize = textureDimensions(outTex).xy;
  if(fragCoord.x >= i32(texSize.x) || fragCoord.y >= i32(texSize.y)){
      return;
  }
  var color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  var uv = CalcUV_01(fragCoord, texSize);
  
  // half stride
  let prev_stride = vec2<f32>(0.5) / vec2<f32>(f32(texSize.x), f32(texSize.y));
  let curr_stride = vec2<f32>(1.0) / vec2<f32>(f32(texSize.x), f32(texSize.y));

  let rgb1 = GaussNxN_0(uv, i32(bloomCfg.upSampleBlurSize), prev_stride, bloomCfg.upSampleBlurSigma);
  let rgb2 = GaussNxN_1(uv, i32(bloomCfg.upSampleBlurSize), curr_stride, bloomCfg.upSampleBlurSigma);
  color = vec4<f32>(rgb1+rgb2, color.w);
  textureStore(outTex, fragCoord, color);
}
`


//__________________________blend
/**
 * @internal
 */
export let post = /*wgsl*/ `
${ColorUtil}
${BloomCfg}
${CalcUV_01}

@group(0) @binding(1) var _MainTex : texture_2d<f32>;
@group(0) @binding(2) var _BloomTex : texture_2d<f32>;
@group(0) @binding(3) var _BloomTexSampler :  sampler;
@group(0) @binding(4) var outTex : texture_storage_2d<rgba16float, write>;

var<private> texSize: vec2<u32>;
var<private> fragCoord: vec2<i32>;

@compute @workgroup_size( 8 , 8 , 1 )
fn CsMain( @builtin(workgroup_id) workgroup_id : vec3<u32> , @builtin(global_invocation_id) globalInvocation_id : vec3<u32>)
{
  fragCoord = vec2<i32>( globalInvocation_id.xy );
  texSize = textureDimensions(outTex).xy;
  if(fragCoord.x >= i32(texSize.x) || fragCoord.y >= i32(texSize.y)){
      return;
  }
  var color = textureLoad(_MainTex, fragCoord, 0);
  let uv = vec2<f32>(f32(fragCoord.x), f32(fragCoord.y)) / vec2<f32>(f32(texSize.x - 1), f32(texSize.y - 1));

  // var bloom = textureLoad(_BloomTex, fragCoord, 0).xyz;
  var bloom = textureSampleLevel(_BloomTex, _BloomTexSampler, uv, 0.0).xyz * bloomCfg.bloomIntensity;

  // ACES + gamma now happen in the final TonemapPost. Just additively
  // composite the linear HDR bloom onto the scene; the post-pass
  // tonemap reads the combined HDR signal and produces the
  // shoulder-compressed output for both scene and bloom in one pass.
  color = vec4<f32>(color.xyz + bloom.xyz, color.w);
  textureStore(outTex, fragCoord, color);
}
`