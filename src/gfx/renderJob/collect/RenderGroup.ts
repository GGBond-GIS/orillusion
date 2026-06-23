import { RenderNode } from '../../../components/renderer/RenderNode';
import { PassType } from '../passRenderer/state/PassType';
/**
 * One group of draw-compatible RenderNodes (same geometry + same
 * shader variant across materials). Each group caches one GPURenderBundle
 * per composite state key — the cache invalidates automatically when
 * either the owning RendererPassState is rebuilt (format / RT / depth
 * change) or the group's node set mutates.
 *
 * Composite key: `${passType}|${stateVersion}|${nodeVersion}`.
 *
 * - `stateVersion` comes from the active RendererPassState; it ticks
 *   whenever descriptors are rebuilt.
 * - `nodeVersion` ticks inside `EntityBatchCollect.collect_add` when
 *   a node joins or leaves this group — shader variant changes flow
 *   through as a new key (different `key` → different group) and do
 *   not need a node-version bump.
 *
 * Without the composite key the cache was keyed by PassType alone and
 * never invalidated: a bundle recorded against a stale pass descriptor
 * would fail WebGPU validation on the next frame (e.g. `executeBundle:
 * bundle's depth format is depth32float, but the pass's is depth24plus`).
 *
 * @internal
 */
export type RenderGroup = {
    key: string;
    bundleMap: Map<string, GPURenderBundle>;
    renderNodes: RenderNode[];
    nodeVersion: number;
};

/** Build the composite bundle-cache key. Centralized here so the four
 *  call sites in RendererBase / ShadowMapPassRenderer stay consistent. */
export function renderGroupBundleKey(group: RenderGroup, passType: PassType, stateVersion: number): string {
    return `${passType}|${stateVersion}|${group.nodeVersion}`;
}
