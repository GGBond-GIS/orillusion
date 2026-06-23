// Helpers shared across multiple RenderGraphPass implementations. Kept
// as free functions (not a base class) so each pass remains a single
// inheritance from RenderGraphPass and can pick the helpers it needs.

import { Camera3D } from '../../../../core/Camera3D';
import { View3D } from '../../../../core/View3D';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { EntityCollect } from '../../collect/EntityCollect';
import { renderGroupBundleKey } from '../../collect/RenderGroup';
import { ClusterLightingBuffer } from '../../passRenderer/cluster/ClusterLightingBuffer';
import { PassType } from '../../passRenderer/state/PassType';
import { RendererPassState } from '../../passRenderer/state/RendererPassState';
import { RenderGraphBuilder } from '../RenderGraphPass';

/**
 * Conditional `b.dependsOn`: declare an ordering edge on each named
 * upstream pass that is registered in the graph, silently skipping
 * names that aren't present. Use this from a pass's `setup()` when
 * the upstream is gated (e.g. `GPUCullPass` is only added when
 * `setting.render.gpuCull` is on) and the downstream still needs to
 * run after it whenever it exists.
 *
 * @group Graph
 */
export function dependOnIfRegistered(b: RenderGraphBuilder, ...names: string[]): void {
    for (const n of names) {
        if (b.graph.getPass(n)) b.dependsOn(n);
    }
}

/**
 * Build (or fetch from cache) the GPURenderBundle list for one entity
 * batch (`getOpRenderGroup` or `getTrRenderGroup`). Bundles cache by
 * `renderGroupBundleKey(group, passType, stateVersion)`, so resizing
 * the canvas (or any other change that bumps `stateVersion`) auto-
 * invalidates them. Pre-Phase-D this lived on `RendererBase`; pulled
 * out so each pass can opt in without inheritance.
 *
 * @group Graph
 */
export function buildBundles(
    view: View3D,
    camera: Camera3D,
    passType: PassType,
    passState: RendererPassState,
    batch: { renderGroup: Map<unknown, any> } | null,
    cluster: ClusterLightingBuffer | undefined,
    isShadowCamera: boolean = false,
): GPURenderBundle[] {
    if (!batch) return [];
    const gpu = view.engine3D.context3D.gpuContext;
    const stateVersion = passState.stateVersion;
    const bundles: GPURenderBundle[] = [];
    batch.renderGroup.forEach((v) => {
        const cacheKey = renderGroupBundleKey(v, passType, stateVersion);
        if (v.bundleMap.has(cacheKey)) {
            bundles.push(v.bundleMap.get(cacheKey));
            return;
        }
        const encoder = gpu.recordBundleEncoder(passState.renderBundleEncoderDescriptor);
        if (isShadowCamera) {
            // Shadow cameras aren't in the scene graph, so they need an
            // explicit camera-group refresh before the bundle records
            // its bind group.
            GlobalBindGroup.updateCameraGroup(camera);
        }
        gpu.bindCamera(encoder, camera);
        if (v.renderNodes && v.renderNodes.length > 0) {
            gpu.bindGeometryBuffer(encoder, v.renderNodes[0].geometry);
            for (const node of v.renderNodes) {
                if (!node.transform.enable) continue;
                node.recordRenderPass2(view, passType, passState, cluster, encoder as unknown as GPURenderPassEncoder);
            }
        }
        const bundle = encoder.finish();
        v.bundleMap.set(cacheKey, bundle);
        bundles.push(bundle);
    });
    return bundles;
}

/** Convenience: bundle the opaque batch for a view. */
export function buildOpBundles(
    view: View3D,
    camera: Camera3D,
    passType: PassType,
    passState: RendererPassState,
    cluster?: ClusterLightingBuffer,
    isShadowCamera = false,
): GPURenderBundle[] {
    const batch = EntityCollect.instance.getOpRenderGroup(view.scene);
    return buildBundles(view, camera, passType, passState, batch, cluster, isShadowCamera);
}

/** Convenience: bundle the transparent batch for a view. */
export function buildTrBundles(
    view: View3D,
    camera: Camera3D,
    passType: PassType,
    passState: RendererPassState,
    cluster?: ClusterLightingBuffer,
    isShadowCamera = false,
): GPURenderBundle[] {
    const batch = EntityCollect.instance.getTrRenderGroup(view.scene);
    return buildBundles(view, camera, passType, passState, batch, cluster, isShadowCamera);
}

/**
 * Pre-init walk — iterate the per-shader collect and trigger
 * `preInit(passType)` on each shader's first node. The first node
 * whose `preInit` returns true (i.e. its pipeline isn't built yet)
 * gets a `nodeUpdate` so the pipeline builds before any draws.
 *
 * Used by every pass that draws geometry to avoid first-frame
 * compile stalls. The `predicate` argument lets a pass exclude nodes
 * (e.g. ReflectionPass skips `ReflectionDebug`-masked nodes).
 *
 * @group Graph
 */
export function preInitPassPipelines(
    view: View3D,
    passType: PassType,
    passState: RendererPassState,
    cluster?: ClusterLightingBuffer,
    predicate?: (node: any) => boolean,
): void {
    const renderShaderCollect = EntityCollect.instance.getRenderShaderCollect(view);
    if (!renderShaderCollect) return;
    for (const renderList of renderShaderCollect) {
        const nodeMap = renderList[1];
        for (const [, node] of nodeMap) {
            if (predicate && !predicate(node)) continue;
            if (!node.isDestroyed && node.preInit(passType)) {
                node.nodeUpdate(view, passType, passState, cluster ?? null);
                break;
            }
        }
    }
}
