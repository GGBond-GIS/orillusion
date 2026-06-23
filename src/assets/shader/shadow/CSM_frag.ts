/**
 * @internal
 * CSM cascade blend weight for a given shadow UV.
 * Reads globalUniform.csmMargin — caller's shader must include GlobalUniform.
 */
export let CSM_frag: string = /*wgsl*/ `
    fn calcCSMBlendWeight(shadowUV: vec2<f32>) -> f32 {
        var uv = 2.0 * shadowUV - vec2<f32>(1.0);
        uv = saturate(vec2<f32>(1.0) - abs(uv));
        uv /= clamp(globalUniform.csmMargin, 0.01, 0.5);
        return min(min(uv.x, 1.0), uv.y);
    }
`
