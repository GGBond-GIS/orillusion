import { RenderShaderPass } from '../../gfx/graphics/webGpu/shader/RenderShaderPass';
import { PassType } from '../../gfx/renderJob/passRenderer/state/PassType';

/**
 * Multi-pass companion shader for the depth-extraction sub-pass of
 * Dual Depth Peeling OIT. Materials with
 * `oitMode === 'depth-peel'` register this pass via
 * {@link PassGenerate.createDepthPeelPasses} so the
 * {@link DualDepthPeelingRenderer} can render them through a
 * single-attachment RG32F MRT to extract the per-pixel
 * (depth_min, depth_max) pair.
 *
 * Output (set by Common_frag's `#if USE_OIT_DEPTH_PEEL_DEPTH` block):
 *   color.r = -fragCoord.z    →  after MAX blend: max(-d_i) = -min(d_i)
 *   color.g =  fragCoord.z    →  after MAX blend: max(d_i)
 *
 * Per-target blend state for this pass (MAX/MAX) is wired in
 * {@link RenderShaderPass.createPipeline}'s PassType.OIT_DEPTH_PEEL_DEPTH
 * branch.
 *
 * @internal
 */
export class DDPDepthPass extends RenderShaderPass {
    constructor(vs: string = `PBRLItShader`, fs: string = `PBRLItShader`) {
        super(vs, fs);
        this.setShaderEntry(`VertMain`, `FragMain`);
        this.passType = PassType.OIT_DEPTH_PEEL_DEPTH;
        const state = this.shaderState;
        // Depth comes from the main color pass's GBuffer (loadOp='load').
        // The peel sub-pass reads but does not write depth — we only
        // care about the fragment's NDC z, which `fragCoord.z` gives us.
        state.depthWriteEnabled = false;
        state.transparent = true;
    }
}
