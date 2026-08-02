// Shared drawing routines used by ColorPass (opaque half) and the
// transparent continuation passes (TransmissionOpaquePass,
// SortedTransparentPass). Free functions, no shared state — the
// inter-pass coupling that used to live as private methods on
// ColorPass has been promoted to the TRANSPARENT_DRAW_CTX graph
// resource so any pass can stand on its own.

import { RenderNode } from '../../../../components/renderer/RenderNode';
import { View3D } from '../../../../core/View3D';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { EntityCollect } from '../../collect/EntityCollect';
import { ClusterLightingBuffer } from '../../passRenderer/cluster/ClusterLightingBuffer';
import { RenderContext } from '../../passRenderer/RenderContext';
import { PassType } from '../../passRenderer/state/PassType';
import { RendererPassState } from '../../passRenderer/state/RendererPassState';
import { buildTrBundles, preInitPassPipelines } from './_helpers';

/**
 * Encoder-driven counterpart to {@link drawNodes}. Calls
 * {@link RenderNode.renderPass2} (encoder-direct draw, no splitTexture
 * mid-pass split) rather than {@link RenderNode.renderPass}. Used by
 * passes that drive their own {@link RenderGraphRenderPass} lifecycle
 * and don't want the legacy {@link RenderContext} indirection.
 *
 * **Caller contract:** materials whose `shaderState.splitTexture` is
 * true (Glass-style refractive shaders) MUST be filtered out before
 * the list reaches this helper. The encoder-direct path has no hook
 * for mid-pass splits — splitTexture materials drawn through here
 * sample whatever's in the color attachment at the moment of draw,
 * which is incorrect. ColorPass uses `transmissionFilter='exclude'`
 * so the typical glass/refraction set is already excluded.
 *
 * @group Graph
 */
export function drawNodesEncoder(
    view: View3D,
    encoder: GPURenderPassEncoder,
    passState: RendererPassState,
    nodes: RenderNode[],
    cluster: ClusterLightingBuffer | undefined,
    options: DrawNodesOptions = {},
): void {
    const passType = options.passType ?? PassType.COLOR;
    const oitFilter = options.oitFilter ?? null;
    const transmissionFilter = options.transmissionFilter ?? null;

    preInitPassPipelines(view, passType, passState, cluster);

    const render = view.engine3D.setting.render;
    const max = Math.min(nodes.length, render.drawOpMax);
    for (let i = render.drawOpMin; i < max; ++i) {
        const node = nodes[i];
        if (!node.transform.enable) continue;
        if (!node.enable) continue;
        if (node.isDestroyed) continue;

        if (oitFilter !== null) {
            const mat = node.materials?.[0];
            if (oitFilter === 'sorted' && mat?.oitMode === 'weighted') continue;
            if (oitFilter === 'weighted' && mat?.oitMode !== 'weighted') continue;
        }
        if (transmissionFilter !== null) {
            const mat = node.materials?.[0] as any;
            const hasTransmission = typeof mat?.transmissionFactor === 'number' && mat.transmissionFactor > 0;
            if (transmissionFilter === 'exclude' && hasTransmission) continue;
            if (transmissionFilter === 'only' && !hasTransmission) continue;
        }
        if (!node.preInit(passType)) {
            node.nodeUpdate(view, passType, passState, cluster);
        }
        node.renderPass2(view, passType, passState, cluster!, encoder, false);
    }
}

/**
 * Resource handle name for the shared draw context published by
 * {@link ColorPass} and consumed by TransmissionOpaque /
 * SortedTransparent. Use in `b.read(TRANSPARENT_DRAW_CTX)` to declare
 * the dependency; resolve via `ctx.get<TransparentDrawContext>(...)`
 * at execute time.
 *
 * @group Graph
 */
export const TRANSPARENT_DRAW_CTX = '_TransparentDrawContext';

/**
 * Shared render state owned by ColorPass (which creates the underlying
 * RTFrames in setup) and consumed by the transparent continuation
 * passes. The `renderContext` carries the active command encoder so
 * the loadOp='load' chain between halves stays coherent — closing one
 * half's render pass and opening the next must happen in order.
 *
 * @group Graph
 */
export interface TransparentDrawContext {
    /** Pass state for the main color attachment (depthLoadOp='clear',
     *  rt loadOp='clear'). Used for the opaque half and for the
     *  transparent half's per-node drawing. */
    readonly rendererPassState: RendererPassState;
    /** Pass state with loadOp='load' / depthLoadOp='load' — used by
     *  Graphic3D overlays after any earlier render-pass split. */
    readonly splitRendererPassState: RendererPassState;
    /** Encoder host. Same instance across halves so beginOpaque /
     *  beginTransparent / endRenderPass interleave correctly. */
    readonly renderContext: RenderContext;
}

/** Per-node oit partition filter. `'sorted'` skips materials with
 *  `oitMode='weighted'`; `'weighted'` does the inverse. */
export type OitFilter = 'sorted' | 'weighted' | null;

/** Per-node transmission split filter. `'exclude'` skips materials
 *  with `transmissionFactor > 0`; `'only'` keeps only those. */
export type TransmissionFilter = 'exclude' | 'only' | null;

/** Per-call options for {@link drawNodes}. */
export interface DrawNodesOptions {
    oitFilter?: OitFilter;
    transmissionFilter?: TransmissionFilter;
    passType?: PassType;
}

/**
 * Per-node draw loop. Walks the slice `[render.drawOpMin, drawOpMax)`,
 * applies optional oit / transmission partition filters inline, and
 * dispatches `node.renderPass` for each surviving node. Used by:
 *
 * - ColorPass (opaque half, `transmissionFilter='exclude'`)
 * - TransmissionOpaquePass (continuation, `transmissionFilter='only'`)
 * - SortedTransparentPass (transparent half, `oitFilter` set by caller)
 *
 * @group Graph
 */
export function drawNodes(
    view: View3D,
    renderContext: RenderContext,
    passState: RendererPassState,
    nodes: RenderNode[],
    cluster: ClusterLightingBuffer | undefined,
    options: DrawNodesOptions = {},
): void {
    const passType = options.passType ?? PassType.COLOR;
    const oitFilter = options.oitFilter ?? null;
    const transmissionFilter = options.transmissionFilter ?? null;

    // Pre-init walk: ensure pipelines are compiled before draw so the
    // first frame doesn't stall on shader compile.
    preInitPassPipelines(view, passType, passState, cluster);

    const render = view.engine3D.setting.render;
    const max = Math.min(nodes.length, render.drawOpMax);
    for (let i = render.drawOpMin; i < max; ++i) {
        const node = nodes[i];
        if (!node.transform.enable) continue;
        if (!node.enable) continue;
        if (node.isDestroyed) continue;

        // OIT / sorted partition. When TransparentOITPass is in the
        // graph, SortedTransparentPass passes `oitFilter='sorted'` and
        // we skip materials that opted into WBOIT.
        if (oitFilter !== null) {
            const mat = node.materials?.[0];
            if (oitFilter === 'sorted' && mat?.oitMode === 'weighted') continue;
            if (oitFilter === 'weighted' && mat?.oitMode !== 'weighted') continue;
        }
        // Transmission split: keep transmission materials out of the
        // SceneColorPyramid copy by deferring them to the continuation
        // pass. The typeof guard avoids reading transmissionFactor on
        // UnlitMaterial etc.
        if (transmissionFilter !== null) {
            const mat = node.materials?.[0] as any;
            const hasTransmission = typeof mat?.transmissionFactor === 'number' && mat.transmissionFactor > 0;
            if (transmissionFilter === 'exclude' && hasTransmission) continue;
            if (transmissionFilter === 'only' && !hasTransmission) continue;
        }
        if (!node.preInit(passType)) {
            node.nodeUpdate(view, passType, passState, cluster);
        }
        node.renderPass(view, passType, renderContext);
    }
}

/**
 * Reopen the color attachment with loadOp='load' and draw the deferred
 * transmission-opaque continuation — opaque materials whose
 * `transmissionFactor > 0`, deferred so they can sample the
 * SceneColorPyramid for refraction.
 *
 * Called by {@link TransmissionOpaquePass}. The pass owns no state of
 * its own — everything it needs flows through `state` (resolved from
 * the {@link TRANSPARENT_DRAW_CTX} graph resource), `cluster`
 * (resolved by the caller from ClusterLightingPass if present), and
 * `opaqueList` (pre-collected by the caller via
 * {@link RenderGraphPass.collectLayered}, so layer / camera-mask
 * filtering is applied before this function sees the list).
 *
 * @group Graph
 */
export function drawTransmissionContinuation(
    view: View3D,
    cluster: ClusterLightingBuffer | undefined,
    state: TransparentDrawContext,
    opaqueList: RenderNode[],
): void {
    const gpu = view.engine3D.context3D.gpuContext;
    state.renderContext.gpu = gpu;

    const camera = view.camera;
    GlobalBindGroup.updateCameraGroup(camera);
    state.rendererPassState.camera3D = camera;

    if (!opaqueList || opaqueList.length === 0) return;

    state.renderContext.beginTransparentRenderPass();
    const encoder = state.renderContext.encoder;
    gpu.bindCamera(encoder, camera);

    drawNodes(
        view,
        state.renderContext,
        state.rendererPassState,
        opaqueList,
        cluster,
        { transmissionFilter: 'only' },
    );

    state.renderContext.endRenderPass();
}

/**
 * Reopen the color attachment with loadOp='load' and draw the
 * transparent half: sorted transparent geometry + Graphic3D overlays.
 * `filter='sorted'` skips WBOIT materials (those are handled by
 * TransparentOITPass); `'all'` draws everything and is the default
 * when no OIT pass is present.
 *
 * Bundled tr-list execution is enabled only for the `'all'` path — the
 * sorted partition is per-node because cached bundles bake the full
 * transparent set and there is no per-OIT bundle re-keying yet.
 *
 * Called by {@link SortedTransparentPass}.
 *
 * @group Graph
 */
export function drawSortedTransparent(
    view: View3D,
    cluster: ClusterLightingBuffer | undefined,
    state: TransparentDrawContext,
    filter: 'all' | 'sorted',
    transparentList: RenderNode[],
): void {
    const gpu = view.engine3D.context3D.gpuContext;
    state.renderContext.gpu = gpu;

    const camera = view.camera;
    GlobalBindGroup.updateCameraGroup(camera);
    state.rendererPassState.camera3D = camera;

    state.renderContext.beginTransparentRenderPass();
    const encoder = state.renderContext.encoder;

    const trBundles = filter === 'all'
        ? buildTrBundles(view, camera, PassType.COLOR, state.rendererPassState, cluster)
        : [];
    if (trBundles.length > 0) {
        encoder.executeBundles(trBundles);
    }

    // Bind camera unconditionally — the Graphic3D overlay loop below
    // shares this encoder via the split pass state and would issue
    // draws with no bind group at index 0 if the transparent list
    // happened to be empty this frame (a scene that uses only
    // Graphic3D primitives, for example).
    gpu.bindCamera(encoder, camera);
    if (transparentList && transparentList.length > 0) {
        drawNodes(
            view,
            state.renderContext,
            state.rendererPassState,
            transparentList,
            cluster,
            { oitFilter: filter === 'all' ? null : 'sorted' },
        );
    }

    // Graphic3D overlays (debug primitives, gizmos) draw last with the
    // split pass state (loadOp='load') so they survive any earlier
    // render-pass split.
    const graphics = EntityCollect.instance.getGraphicList();
    for (const g of graphics) {
        g.nodeUpdate(view, PassType.COLOR, state.splitRendererPassState, cluster);
        g.renderPass2(view, PassType.COLOR, state.splitRendererPassState, cluster, encoder);
    }

    state.renderContext.endRenderPass();
}
