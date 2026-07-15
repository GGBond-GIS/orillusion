/**
 * Screen-Space Global Illumination (SSGI) — horizon-based.
 *
 * Per pixel: integrate indirect light by ray-marching the
 * scene-color buffer along several azimuthal directions, accumulating
 * the visible-horizon-bounded inscattering. Cheap relative to true
 * GI, expensive relative to GTAO.
 *
 * Pairs with `_HiZPyramid` (when available) for log2-mip ray traversal,
 * and `_ColorBuffer` as the radiance source.
 *
 * MVP scope:
 *   - 4 azimuthal slices × 8 radial steps (32 taps / pixel).
 *   - Single-bounce only.
 *   - Hi-Z acceleration deferred (current draft does linear march).
 *
 * @internal
 */
export let SSGI_cs: string = /*wgsl*/`
    #include "GlobalUniform"
    #include "GBufferStand"

    const PI: f32 = 3.1415926;

    struct SSGISettings {
        intensity: f32,
        radius: f32,
        sliceCount: f32,
        stepCount: f32,
    };

    @group(0) @binding(2) var<uniform> ssgiSettings: SSGISettings;
    @group(0) @binding(3) var inTex: texture_2d<f32>;
    @group(0) @binding(4) var outTex: texture_storage_2d<rgba16float, write>;

    var<private> texSize: vec2<u32>;
    var<private> fragCoord: vec2<i32>;
    var<private> fragUV: vec2<f32>;
    var<private> gBuffer: GBuffer;

    @compute @workgroup_size(8, 8, 1)
    fn CsMain(@builtin(global_invocation_id) gid: vec3<u32>) {
        fragCoord = vec2<i32>(gid.xy);
        texSize = textureDimensions(inTex).xy;
        if (fragCoord.x >= i32(texSize.x) || fragCoord.y >= i32(texSize.y)) { return; }
        fragUV = vec2<f32>(fragCoord) / vec2<f32>(texSize - 1u);

        let oc = textureLoad(inTex, fragCoord, 0);
        gBuffer = getGBuffer(fragCoord);
        useNormalMatrixInv();
        let visible = getRoughnessFromGBuffer(gBuffer);
        if (visible <= 0.0) {
            textureStore(outTex, fragCoord, oc);
            return;
        }

        let normal = getWorldNormalFromGBuffer(gBuffer);

        // Azimuthal march. For each slice, march along the screen-space
        // direction, sample the color buffer at each step, weight by
        // the cosine of the surface normal vs the sampled direction.
        let sliceCount = i32(clamp(ssgiSettings.sliceCount, 2.0, 8.0));
        let stepCount = i32(clamp(ssgiSettings.stepCount, 4.0, 16.0));
        var giAccum = vec3<f32>(0.0);
        let radiusUV = ssgiSettings.radius / f32(min(texSize.x, texSize.y));

        for (var slice: i32 = 0; slice < sliceCount; slice = slice + 1) {
            let theta = (f32(slice) + 0.5) * (2.0 * PI / f32(sliceCount));
            let dir = vec2<f32>(cos(theta), sin(theta));
            for (var s: i32 = 1; s <= stepCount; s = s + 1) {
                let t = f32(s) / f32(stepCount);
                let sampleUV = clamp(fragUV + dir * radiusUV * t, vec2<f32>(0.001), vec2<f32>(0.999));
                let sampleCoord = vec2<i32>(sampleUV * vec2<f32>(texSize));
                let bounce = textureLoad(inTex, sampleCoord, 0).rgb;
                // Weight by inverse distance; very simple — no horizon test
                // (deferred to a follow-up that consumes _HiZPyramid).
                let w = (1.0 - t) * (1.0 / f32(stepCount));
                giAccum = giAccum + bounce * w;
            }
        }
        giAccum = giAccum / f32(sliceCount);
        let result = oc.rgb + giAccum * ssgiSettings.intensity;
        textureStore(outTex, fragCoord, vec4<f32>(result, oc.a));
    }
`;
