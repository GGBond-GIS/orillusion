import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { COLOR_BUFFER } from './ColorPass';
import { ClusterLightingPass } from './ClusterLightingPass';
import { MAIN_COLOR_RT } from './GBufferResourcePass';
import { SCENE_COLOR_PYRAMID } from './SceneColorPyramidPass';
import { dependOnIfRegistered } from './_helpers';
import {
    drawSortedTransparent,
    TRANSPARENT_DRAW_CTX,
    TransparentDrawContext,
} from './_transparentDraw';

/** Filter mode applied to the transparent draw list.
 *  - `'all'`: render every transparent node (default — used when
 *    TransparentOITPass isn't in the graph).
 *  - `'sorted'`: skip nodes whose material has `oitMode='weighted'`,
 *    leaving them for TransparentOITPass. */
export type SortedTransparentFilter = 'all' | 'sorted';

/**
 * Mutator pass that renders sorted transparent geometry AFTER opaque
 * rendering + SceneColorPyramid + Transmission. Reopens the main color
 * attachment with `loadOp='load'` so opaque + transmission contents
 * are preserved, then draws the transparent list and any Graphic3D
 * overlays.
 *
 * When the engine is configured with `render.useOIT = true` and
 * materials carry `oitMode === 'weighted'`, the OIT pass at the same
 * stage owns the weighted half of the pipeline; this pass renders the
 * subset of materials still on the sorted path.
 *
 * Resource flow:
 * - read `_SceneColorPyramid` — chains after pyramid copy.
 * - read `_TransparentDrawContext` — chains after ColorPass (creator).
 * - mutator write on `_ColorBuffer` — declares the in-place write.
 *
 * @group Graph
 */
export class SortedTransparentPass extends RenderGraphPass {
    public readonly name = 'SortedTransparentPass';

    constructor(public readonly filter: SortedTransparentFilter = 'all') {
        super();
    }

    public setup(b: RenderGraphBuilder): void {
        b.read(SCENE_COLOR_PYRAMID);
        b.read(TRANSPARENT_DRAW_CTX);
        b.write(COLOR_BUFFER);  // legacy mutator-write
        // Typed MAIN_COLOR_RT mutator chain — keeps the graph-level
        // view of the render target consistent with the encoder
        // lifecycle even though the actual draw goes through
        // RenderContext (splitTexture / glass materials live here).
        b.useRenderTarget(MAIN_COLOR_RT);

        dependOnIfRegistered(b, 'GPUCullPass');
    }

    public execute(ctx: RenderGraphPassContext): void {
        const state = ctx.get<TransparentDrawContext>(TRANSPARENT_DRAW_CTX);
        const cluster = ctx.graph.getPass<ClusterLightingPass>('ClusterLightingPass')?.clusterLightingBuffer;
        const layered = this.collectLayered(ctx.view);
        drawSortedTransparent(ctx.view, cluster, state, this.filter, layered.transparent);
    }
}
