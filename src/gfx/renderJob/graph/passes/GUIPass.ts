import { ViewQuad } from '../../../../core/ViewQuad';
import { Texture } from '../../../graphics/webGpu/core/texture/Texture';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { FINAL_COLOR } from './PostPass';
import { createPresentQuad, presentTexture } from './_present';

/**
 * Published handle name for the canvas (swapchain) view that the
 * presentation pass draws into. Registered as a pure handle whose
 * getter returns null because the GPUTextureView comes from
 * `Context3D.context.getCurrentTexture()` and is owned by the
 * browser's compositor — the graph never allocates it.
 *
 * Exposed mainly so custom passes can declare `b.read(CANVAS_TEXTURE)`
 * to order against present-to-canvas (e.g. a debug overlay that runs
 * after the swapchain copy).
 *
 * @group Graph
 */
export const CANVAS_TEXTURE = '_CanvasTexture';

/**
 * Final present-to-canvas pass. Reads `_FinalColor` (whatever the
 * post chain ended with, or the color buffer if no post effects are
 * enabled — see {@link PostPass}) and blits it to the swapchain via
 * a self-owned fullscreen quad.
 *
 * @group Graph
 */
export class GUIPass extends RenderGraphPass {
    public readonly name = 'GUIPass';

    protected _presentQuad!: ViewQuad;

    public setup(b: RenderGraphBuilder): void {
        b.read(FINAL_COLOR);
        // CANVAS_TEXTURE is a pass-through handle; the actual swapchain
        // GPUTextureView is acquired per-frame inside presentTexture.
        b.write(CANVAS_TEXTURE, () => null);

        this._presentQuad = createPresentQuad(b.context3D);
    }

    public execute(ctx: RenderGraphPassContext): void {
        const finalColor = ctx.get<Texture>(FINAL_COLOR);
        presentTexture(ctx.view, this._presentQuad, finalColor);
    }

    public destroy(): void {
        this._presentQuad?.destroy();
        this._presentQuad = null as any;
    }
}
