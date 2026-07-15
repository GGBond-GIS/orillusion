/**
 * @internal
 */
export let Lambert_shader: string = /*wgsl*/ `
    #include "Common_vert"
    #include "Common_frag"
    #include "ClusterLight"
    #include "UnLit_frag"
    #include "UnLitMaterialUniform_frag"
    #include "EnvMap_frag"
    #include "ReflectionCG"
    #include "AlphaHash_frag"

    @group(1) @binding(auto)
    var baseMapSampler: sampler;
    @group(1) @binding(auto)
    var baseMap: texture_2d<f32>;

    fn vert(inputData:VertexAttributes) -> VertexOutput {
        ORI_Vert(inputData) ;
        return ORI_VertexOut ;
    }

    fn frag(){
        var transformUV1 = materialUniform.transformUV1;
        var transformUV2 = materialUniform.transformUV2;

        var uv = transformUV1.zw * ORI_VertexVarying.fragUV0 + transformUV1.xy;
        var baseMapColor = textureSample(baseMap,baseMapSampler,uv);
        if(baseMapColor.a < materialUniform.alphaCutoff) {
            discard;
        }

        #if USE_ALPHAHASH
            // Stochastic alpha test (Wyman 2017) — see PBRLitShader for
            // the full rationale. Alpha includes the materialUniform.baseColor.a
            // factor since that's what drives the user-visible slider.
            let _hashAlpha = baseMapColor.a * materialUniform.baseColor.a;
            if (_hashAlpha < alphaHash3D(ORI_VertexVarying.vWorldPos.xyz)) {
                discard;
            }
        #endif
        // sRGB-encoded baseMap → decode to linear before lighting
        // math (mirrors PBRLitShader's #else branch). Skip when
        // USE_SRGB_ALBEDO marks the texture as hardware-decoded.
        #if !USE_SRGB_ALBEDO
            baseMapColor = vec4f(gammaToLiner(baseMapColor.rgb), baseMapColor.a);
        #endif

        var lightColor = vec4<f32>(0.0);
        let lightIndex = getCluster();
        let start = max(lightIndex.start, 0.0);
        let count = max(lightIndex.count, 0.0);
        let end = max(start + count , 0.0);
        for(var i:i32 = i32(start) ; i < i32(end); i += 1 )
        {
          let light = getLight(i32(i));
  
          switch (light.lightType) {
            case PointLightType: {
            }
            case DirectLightType: {
                var normal = ORI_VertexVarying.vWorldNormal;
                let intensity = light.intensity;
                let att = max(dot(normal,-light.direction),0.0) * intensity;
                lightColor += vec4f(light.lightColor * att, 1.0);
            }
            case SpotLightType: {
            }
            default: {
            }
          }
        }

        let irradiance: vec3f = getReflectionsEnv(ORI_VertexVarying.vWorldNormal, ORI_VertexVarying.vWorldPos.xyz, 1.0);
        let albedo = baseMapColor.rgb * materialUniform.baseColor.rgb;
        // Direct: light · NdotL · albedo. Indirect: env irradiance ·
        // albedo (modulating env by surface colour gives the ambient
        // term its hue, matching PBR's diffuse IBL behaviour). Adding
        // raw irradiance — as the prior code did — washed every
        // shadow-side fragment to a uniform env-grey regardless of
        // sphere colour.
        //
        // NOTE: avoid the literal six-letter word v-e-r-s-i-o-n
        // followed by a space inside any shader string. The engine
        // RenderShaderPass.preCompileShader uses a naive substring
        // scan for that token to decide whether to route through the
        // GLSL converter; a comment containing it trips the detector
        // and the GLSL preprocessor then crashes on the include
        // directive.
        let directDiffuse = lightColor.rgb * albedo;
        let indirectDiffuse = irradiance * albedo;
        // Output alpha must combine the texture's alpha AND the
        // material's baseColor.a uniform. The prior code only
        // forwarded baseMapColor.a, so per-material alpha sliders had
        // no effect on Lambert's transparent rendering.
        let outAlpha = baseMapColor.a * materialUniform.baseColor.a;
        ORI_ShadingInput.BaseColor = vec4f(directDiffuse + indirectDiffuse, outAlpha);
        if(ORI_ShadingInput.BaseColor.a > 1.0){
            ORI_ShadingInput.BaseColor.a = 1.0;
        }
        UnLit();

        // let n = globalUniform.near ;
        // let f = globalUniform.far ;
        // let z = ORI_VertexVarying.fragCoord.z ;
        // ORI_FragmentOutput.out_depth = z * (n/(f-n)) ;
    }
`

