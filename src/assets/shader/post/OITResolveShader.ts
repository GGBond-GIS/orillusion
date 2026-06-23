/**
 * Weighted-Blended OIT resolve fragment shader. Pairs with the
 * `USE_OIT_ACCUM` shader path in `PBRLitShader` (see Common_frag's
 * tail block). Read the two OIT attachments and composite
 * into the destination color buffer using:
 *
 *   visibility   = 1 - reveal   // probability the fragment is visible
 *   averagedRGB  = accum.rgb / max(accum.a, 1e-4)
 *   final        = mix(bg, averagedRGB, visibility)
 *
 * Rendered as a full-screen quad with blend
 *   { src: ONE, dst: ONE_MINUS_SRC_ALPHA }
 * so we can output `vec4(averagedRGB * visibility, visibility)` and
 * have the hardware blend it on top of the existing color buffer.
 *
 * @internal
 */
export let OITResolveShader: string = /*wgsl*/`
    @group(0) @binding(0)
    var oitAccumSampler: sampler;
    @group(0) @binding(1)
    var oitAccum: texture_2d<f32>;
    @group(0) @binding(2)
    var oitRevealSampler: sampler;
    @group(0) @binding(3)
    var oitReveal: texture_2d<f32>;

    struct VSOut {
        @builtin(position) pos: vec4<f32>,
        @location(0) uv: vec2<f32>,
    };

    @vertex
    fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
        // Three big-triangle covers the screen; UV interpolated to 0..1
        // across the visible region.
        var pos = array<vec2<f32>, 3>(
            vec2<f32>(-1.0, -1.0),
            vec2<f32>( 3.0, -1.0),
            vec2<f32>(-1.0,  3.0),
        );
        var uv = array<vec2<f32>, 3>(
            vec2<f32>(0.0, 1.0),
            vec2<f32>(2.0, 1.0),
            vec2<f32>(0.0, -1.0),
        );
        var out: VSOut;
        out.pos = vec4<f32>(pos[vid], 0.0, 1.0);
        out.uv = uv[vid];
        return out;
    }

    @fragment
    fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
        let accum = textureSample(oitAccum, oitAccumSampler, in.uv);
        let reveal = textureSample(oitReveal, oitRevealSampler, in.uv).r;
        // Empty pixel: nothing accumulated, leave the background alone.
        if (accum.a == 0.0) {
            discard;
        }
        let avg = accum.rgb / max(accum.a, 1e-4);
        // Output pre-multiplied — the host pipeline uses
        // SRC=ONE, DST=ONE_MINUS_SRC_ALPHA so the final value is
        //   bg * (1 - visibility) + (avg * visibility)
        // which is exactly the WBOIT compositing formula.
        let visibility = 1.0 - reveal;
        return vec4<f32>(avg * visibility, visibility);
    }
`;
