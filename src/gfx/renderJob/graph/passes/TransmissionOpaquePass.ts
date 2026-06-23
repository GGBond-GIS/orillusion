import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { COLOR_BUFFER } from './ColorPass';
import { ClusterLightingPass } from './ClusterLightingPass';
import { MAIN_COLOR_RT } from './GBufferResourcePass';
import { SCENE_COLOR_PYRAMID } from './SceneColorPyramidPass';
import { dependOnIfRegistered } from './_helpers';
import {
    drawTransmissionContinuation,
    TRANSPARENT_DRAW_CTX,
    TransparentDrawContext,
} from './_transparentDraw';

/**
 * Mutator pass that draws opaque materials with transmission
 * (`transmissionFactor > 0`) AFTER the SceneColorPyramid has captured
 * the rest of the opaque world. Mutates `_ColorBuffer` in place via a
 * continuation render pass against the same color attachment.
 *
 * Why split: transmission materials sample the pyramid for refraction
 * (and, in alpha-cutout mode, alpha). If drawn alongside other opaque
 * materials in the main {@link ColorPass}, their own writes would
 * land in the pyramid before they could sample it — at the dragon's
 * screen position the pyramid would store the dragon, not whatever
 * cloth / wall sits behind it.
 *
 * Resource flow:
 * - read `_SceneColorPyramid` — chains topo-order strictly after
 *   {@link SceneColorPyramidPass}.
 * - read `_TransparentDrawContext` — chains strictly after ColorPass
 *   (it's the resource ColorPass creates to share render state).
 * - mutator write on `_ColorBuffer` — declares the in-place write so
 *   downstream `_ColorBuffer` consumers route through this pass.
 *
 * @group Graph
 */
export class TransmissionOpaquePass extends RenderGraphPass {
    public readonly name = 'TransmissionOpaquePass';

    public setup(b: RenderGraphBuilder): void {
        b.read(SCENE_COLOR_PYRAMID);
        b.read(TRANSPARENT_DRAW_CTX);
        b.write(COLOR_BUFFER);  // legacy mutator-write
        // Typed MAIN_COLOR_RT mutator chain — see SortedTransparentPass
        // for the rationale (encoder still goes through RenderContext
        // to preserve mid-pass splitTexture handling).
        b.useRenderTarget(MAIN_COLOR_RT);

        dependOnIfRegistered(b, 'GPUCullPass');
    }

    public execute(ctx: RenderGraphPassContext): void {
        const state = ctx.get<TransparentDrawContext>(TRANSPARENT_DRAW_CTX);
        const cluster = ctx.graph.getPass<ClusterLightingPass>('ClusterLightingPass')?.clusterLightingBuffer;
        const layered = this.collectLayered(ctx.view);
        drawTransmissionContinuation(ctx.view, cluster, state, layered.opaque);
    }
}
