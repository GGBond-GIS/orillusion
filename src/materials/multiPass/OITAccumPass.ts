import { RenderShaderPass } from '../../gfx/graphics/webGpu/shader/RenderShaderPass';
import { PassType } from '../../gfx/renderJob/passRenderer/state/PassType';

/**
 * Multi-pass companion shader that materials with `oitMode === 'weighted'`
 * register so the {@link TransparentOITFeature} can render them through
 * a Weighted-Blended OIT accumulation pipeline.
 *
 * Reuses the **full PBRLitShader** lighting pipeline (BxDFShading,
 * shadows, IBL, transmission, clearcoat — every define the COLOR pass
 * has is mirrored by {@link PassGenerate.createOITPass}). The trailing
 * `#if USE_OIT_ACCUM` block in `Common_frag` overrides the fragment's
 * `.color` and `.gBuffer` attachments with the WBOIT-weighted outputs;
 * the same fragment that would have written a single lit RGBA into
 * `_ColorBuffer` instead writes `(rgb·α·w, α·w)` into `_OITAccum` and
 * `α` into `_OITReveal`. Per-target blend states (additive on accum,
 * multiplicative on reveal) come from RenderShaderPass.createPipeline's
 * `PassType.OIT_ACCUM` branch.
 *
 * @internal
 */
export class OITAccumPass extends RenderShaderPass {
    /**
     * @param vs / fs — registered shader names. Default to PBRLitShader
     *   so existing LitMaterial-based callers keep working unchanged.
     *   PassGenerate.createOITPass passes the COLOR pass's own vsName/
     *   fsName so the OIT pipeline runs the SAME fragment program the
     *   color pass would have run (PBRLit for LitMaterial, UnLit for
     *   UnLitMaterial, …). Without this, an UnLit material running
     *   `oitMode='weighted'` would fail to bind because the cloned OIT
     *   pass still expected the full PBR uniform set.
     */
    constructor(vs: string = `PBRLItShader`, fs: string = `PBRLItShader`) {
        super(vs, fs);
        this.setShaderEntry(`VertMain`, `FragMain`);
        this.passType = PassType.OIT_ACCUM;
        const state = this.shaderState;
        // OIT relies on the depth buffer being already populated by the
        // opaque pass — read-only depth comparison; no writes so
        // overlapping fragments still all contribute to the accum.
        state.depthWriteEnabled = false;
        state.transparent = true;
        // The `USE_OIT_ACCUM` define is set by PassGenerate.createOITPass
        // *after* construction, alongside the rest of the cloned color
        // pass defines — it has to be last so it overrides any default
        // the StandShader baseline might have flipped.
    }
}
