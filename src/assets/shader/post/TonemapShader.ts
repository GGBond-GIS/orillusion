import { ColorUtil } from "../utils/ColorUtil";

/**
 * @internal
 */
export let TonemapShader: string = /*wgsl*/ `
    ${ColorUtil}

    struct FragmentOutput {
        @location(auto) o_Target: vec4<f32>
    };

    @group(1) @binding(0)
    var baseMapSampler: sampler;
    @group(1) @binding(1)
    var baseMap: texture_2d<f32>;

    struct MaterialUniform {
        exposure: f32,
        mode: f32,
    };

    @group(2) @binding(0)
    var<uniform> materialUniform: MaterialUniform;

    @fragment
    fn main(@location(auto) fragUV: vec2<f32>) -> FragmentOutput {
        var uv = fragUV;
        uv.y = 1.0 - uv.y;
        let raw = textureSample(baseMap, baseMapSampler, uv);

        var rgb = raw.rgb * materialUniform.exposure;
        if (materialUniform.mode > 0.5) {
            rgb = ACESToneMapping(rgb, 1.0);
        }
        return FragmentOutput(vec4<f32>(rgb, raw.a));
    }
`;
