/**
 * @internal
 *
 * Planar-mirror shader. Samples a render target the caller provides
 * (typically the output of a {@link SceneCapturePass} that captures
 * the scene from a y=plane reflection of the main camera) in screen
 * space, so the surface acts as a per-pixel planar reflection rather
 * than a UV-mapped texture.
 *
 * Coordinate handling:
 *
 *   - `fragPosition.xy / fragPosition.w` gives clip-space NDC in
 *     `[-1, 1]`.
 *   - WebGPU texture v=0 is at the top of the image while NDC y=+1
 *     is at the top of the viewport, so we use `(1 - ndc.y) * 0.5`
 *     to flip the v axis when sampling.
 *   - X is also flipped (`(1 - ndc.x) * 0.5`) because the mirror
 *     camera and the main camera look at the same world point from
 *     opposite ends along the mirror's normal — this swaps left and
 *     right in the captured image relative to main-camera screen
 *     coordinates. Without the X flip a character on the left would
 *     reflect the character on the right.
 *
 * The shader piggy-backs on the engine's UnLit pipeline (no shading,
 * no env / shadow / GI consumption) — the captured RT already
 * contains a fully shaded scene from the mirror-camera's viewpoint,
 * so re-shading the floor on top would double-light the reflection.
 */
export let MirrorShader: string = /* wgsl */ `
    #include "Common_vert"
    #include "Common_frag"
    #include "UnLit_frag"
    #include "UnLitMaterialUniform_frag"

    @group(1) @binding(auto)
    var mirrorMap_Sampler: sampler;
    @group(1) @binding(auto)
    var mirrorMap: texture_2d<f32>;

    fn vert(inputData: VertexAttributes) -> VertexOutput {
        ORI_Vert(inputData);
        return ORI_VertexOut;
    }

    fn frag() {
        var ndc = ORI_VertexVarying.fragPosition.xy / ORI_VertexVarying.fragPosition.w;
        var uv = vec2<f32>((1.0 - ndc.x) * 0.5, (1.0 - ndc.y) * 0.5);
        let mirror = textureSample(mirrorMap, mirrorMap_Sampler, uv);
        ORI_ShadingInput.BaseColor = vec4<f32>(mirror.rgb * materialUniform.baseColor.rgb, 1.0);
        UnLit();
    }
`;
