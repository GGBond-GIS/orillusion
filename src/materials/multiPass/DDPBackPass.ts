import { RenderShaderPass } from '../../gfx/graphics/webGpu/shader/RenderShaderPass';
import { PassType } from '../../gfx/renderJob/passRenderer/state/PassType';

/**
 * Multi-pass companion shader for the back-color accumulation sub-pass
 * of Dual Depth Peeling OIT. Back-layer accumulation
 * is associative under the under-blend so a single buffer suffices
 * (no ping-pong needed): each peel iteration writes the layer at the
 * current furthest depth into the back MRT.
 *
 * Final composite (handled by the resolve feature in stage 4):
 *   final = bg · (1 - frontA) + frontColor + (1 - frontA) · backColor
 *
 * Stage 2 outputs the premultiplied current-layer colour. Stage 3 adds
 * per-iteration depth comparison so only fragments at the current peel
 * iteration's furthest depth contribute.
 *
 * @internal
 */
export class DDPBackPass extends RenderShaderPass {
    constructor(vs: string = `PBRLItShader`, fs: string = `PBRLItShader`) {
        super(vs, fs);
        this.setShaderEntry(`VertMain`, `FragMain`);
        this.passType = PassType.OIT_DEPTH_PEEL_BACK;
        const state = this.shaderState;
        state.depthWriteEnabled = false;
        state.transparent = true;
    }
}
