/**
 * Batching mode for a {@link RenderNode}. Controls whether the node
 * participates in the engine's batched render-group path (instead of
 * the default per-node opaque/transparent lists).
 *
 * Historically this enum was named `RenderLayer`, but the values
 * actually express *batching behavior*, not layer membership — it was
 * renamed to `BatchMode`, and the layer-mask concern now lives in
 * {@link VisibleLayer}. Migration: replace `RenderLayer.*` usages with
 * `BatchMode.*` and `RenderLayerUtil` with {@link BatchModeUtil}.
 *
 * @group GFX
 */
export enum BatchMode {
    None = 1 << 1,
    StaticBatch = 1 << 2,
    DynamicBatch = 1 << 3,
    Hidden = 1 << 4,
}

/**
 * Bitmask helpers for {@link BatchMode}. The any-match semantics
 * (`hasMask` returns true when any common bit is set) matches the
 * previous `RenderLayerUtil` behavior so call sites need no logic
 * changes after the rename.
 *
 * @internal
 * @group GFX
 */
export class BatchModeUtil {
    public static addMask(src: BatchMode, tag: BatchMode): BatchMode {
        let value = src | tag;
        return value;
    }

    public static removeMask(src: BatchMode, tag: BatchMode): BatchMode {
        let value = src & (~tag);
        return value;
    }

    public static hasMask(m1: BatchMode, m2: BatchMode): boolean {
        return (m1 & m2) != 0;
    }
}
