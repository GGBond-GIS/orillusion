/**
 * @internal
 */
export let FragmentOutput: string = /*wgsl*/ `
    #if USE_OIT_DEPTH_PEEL
        // Dual depth peeling sub-passes (DEPTH / FRONT / BACK) each
        // write to a single attachment. Other variants of
        // FragmentOutput include a gBuffer slot which would force
        // the pipeline to expect 2 color attachments — keep just one
        // color location here so each peel pass can be wired with a
        // single-attachment RTFrame and the WebGPU pipeline-build
        // does not complain about an unmatched fragment output.
        struct FragmentOutput {
            @location(auto) color: vec4<f32>,
            #if USE_OUTDEPTH
                @builtin(frag_depth) out_depth: f32
            #endif
        };
    #else
        #if USE_CASTREFLECTION
            struct FragmentOutput {
                @location(auto) gBuffer: vec4<f32>,
                #if USE_OUTDEPTH
                    @builtin(frag_depth) out_depth: f32
                #endif
            };
        #else
            struct FragmentOutput {
                @location(auto) color: vec4<f32>,
                @location(auto) gBuffer: vec4<f32>,
                #if USE_OUTDEPTH
                    @builtin(frag_depth) out_depth: f32
                #endif
            };
        #endif
    #endif
`
