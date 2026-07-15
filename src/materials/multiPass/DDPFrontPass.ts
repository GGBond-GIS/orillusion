import { RenderShaderPass } from '../../gfx/graphics/webGpu/shader/RenderShaderPass';
import { PassType } from '../../gfx/renderJob/passRenderer/state/PassType';

/**
 * Multi-pass companion shader for the front-color accumulation sub-pass
 * of Dual Depth Peeling OIT. Each peel iteration
 * advances the front layer one step deeper into the scene, accumulating
 * lit colour into the front MRT with the over operator:
 *
 *   newFront.rgb = prevFront.rgb + (1 - prevFront.a) · α · src.rgb
 *   newFront.a   = prevFront.a   + (1 - prevFront.a) · α
 *
 * When the front-most layer reaches α=1 the `(1 - prevFront.a)` factor
 * becomes 0 and subsequent layers contribute nothing — this is what
 * makes α=1 cleanly opaque under depth peeling, the property
 * weighted-blended OIT cannot match at small scene scales.
 *
 * Stage 2 outputs the premultiplied current-layer colour. Stage 3 will
 * add prev-front-MRT texelFetch and per-iteration depth comparison so
 * only fragments at the current peel layer contribute.
 *
 * @internal
 */
export class DDPFrontPass extends RenderShaderPass {
    constructor(vs: string = `PBRLItShader`, fs: string = `PBRLItShader`) {
        super(vs, fs);
        this.setShaderEntry(`VertMain`, `FragMain`);
        this.passType = PassType.OIT_DEPTH_PEEL_FRONT;
        const state = this.shaderState;
        // Depth-write enabled on the DDP-private depth buffer so closer
        // fragments occlude farther ones via the GPU depth test. With
        // overwrite blending (one/zero) on the front-color MRT, this
        // gives "front-most fragment wins per pixel" — depth peeling's
        // single-layer base case which is sufficient for α=1=opaque
        // (front opaque blocks bg fully) and a credible α<1 rendering
        // (front-most layer translucent over bg).
        state.depthWriteEnabled = true;
        state.transparent = true;
    }
}
