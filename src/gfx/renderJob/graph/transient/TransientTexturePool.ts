import { RenderTexture } from '../../../../textures/RenderTexture';
import { Texture } from '../../../graphics/webGpu/core/texture/Texture';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { TextureDesc } from './ResourceDesc';
import { ResourceLifetime } from './LifetimeAnalyzer';

/**
 * One physical {@link RenderTexture} slot held by the
 * {@link TransientTexturePool}. The wrapper persists across compile
 * windows; only its `inUseUntilIdx` / `inUseByName` debug fields
 * change per compile.
 *
 * @internal
 * @group Graph
 */
export interface PooledTexture {
    rt: RenderTexture;
    bucketKey: string;
    /** Last topo index in the current compile window at which the
     *  currently-assigned logical resource is alive. `-1` if free —
     *  i.e. eligible for reuse by a logical resource whose
     *  `firstUseIdx > inUseUntilIdx`. */
    inUseUntilIdx: number;
    inUseByName: string | null;
    estimatedBytes: number;
}

/**
 * Snapshot of one assign() call's resource-to-physical mapping.
 *
 * @group Graph
 */
export interface TransientTextureAssignment {
    /** logical resource name → the {@link RenderTexture} that
     *  `ctx.getTexture(name)` should return for this compile window. */
    bindings: Map<string, RenderTexture>;
    /** Per-name debug info: which bucket key the resource landed in
     *  and whether it aliased an existing entry. */
    debug: Map<string, { bucketKey: string; aliased: boolean; dedicated: boolean }>;
}

/**
 * Physical pool for transient render-graph textures with lifetime-aware
 * aliasing.
 *
 * Lifecycle:
 *
 *   compile() → LifetimeAnalyzer.analyze() → ResourceLifetime[]
 *             → pool.assign(lifetimes) → bindings Map
 *             → RenderGraphResourcePool registers () => binding
 *   execute() → ctx.getTexture(name) → pool-resolved RenderTexture
 *
 * Aliasing happens **inside one compile window**: lifetimes are sorted
 * by `firstUseIdx` ascending; for each one the pool finds a same-bucket
 * entry whose `inUseUntilIdx < firstUseIdx` and reuses it, otherwise
 * allocates a fresh {@link RenderTexture}. Across compile windows the
 * pool retains every allocated wrapper — the next assign() reshuffles
 * which logical name maps to which physical slot. Dedicated slots
 * (`aliasable: false`, mip pyramids, etc.) keep their `RenderTexture`
 * identity stable across windows by binding to a per-name slot that
 * lives outside the bucket reuse pool.
 *
 * On device-lost the pool calls `RenderTexture.destroy()` /
 * `Texture.delayDestroyTexture()` on every slot and clears the buckets;
 * the next compile re-allocates from scratch on the new device.
 *
 * @group Graph
 */
export class TransientTexturePool {
    private readonly _ctx: Context3D;
    private readonly _buckets = new Map<string, PooledTexture[]>();
    /** Per-name dedicated slots for aliasable:false resources. These
     *  bypass bucket reuse so consumers can cache bind groups against
     *  a stable `GPUTexture` identity across compiles. */
    private readonly _dedicatedByName = new Map<string, PooledTexture>();
    private _currentBytes = 0;
    private _peakBytes = 0;

    constructor(ctx: Context3D) {
        this._ctx = ctx;
    }

    /**
     * Allocate (or reuse) physical wrappers for every transient
     * lifetime. Persistent (imported) lifetimes are ignored — those
     * are registered directly by the builder when the external
     * texture is imported.
     */
    public assign(lifetimes: readonly ResourceLifetime[]): TransientTextureAssignment {
        // Reset bucket occupancy for the new compile window. The
        // wrappers themselves stay alive; their inUse markers reset.
        for (const list of this._buckets.values()) {
            for (const pt of list) {
                pt.inUseUntilIdx = -1;
                pt.inUseByName = null;
            }
        }

        const bindings = new Map<string, RenderTexture>();
        const debug = new Map<string, { bucketKey: string; aliased: boolean; dedicated: boolean }>();

        // Pool only handles transient textures. Persistent (imported)
        // entries are registered directly by the builder and never
        // enter the bucket map.
        const texLifetimes = lifetimes.filter(lt => lt.kind === 'texture' && !lt.persistent);

        // Sort by firstUseIdx ascending — earliest-starting lifetimes
        // pick first, leaving later-starting ones to reuse the freed
        // slots. Tie-break by name for determinism.
        const sorted = [...texLifetimes].sort((a, b) => {
            if (a.firstUseIdx !== b.firstUseIdx) return a.firstUseIdx - b.firstUseIdx;
            return a.name < b.name ? -1 : 1;
        });

        for (const lt of sorted) {
            const desc = lt.desc as TextureDesc;
            const w = lt.resolvedWidth!;
            const h = lt.resolvedHeight!;
            const usage = lt.resolvedUsage;
            if (!usage) {
                console.warn(
                    `[RenderGraph] transient texture '${lt.name}' resolved to usage=0 — ` +
                    `no read/write access hints recorded and no explicit usage on the desc. ` +
                    `Allocating with TEXTURE_BINDING as a safe default.`,
                );
            }
            const finalUsage = usage || GPUTextureUsage.TEXTURE_BINDING;
            const bucketKey = computeBucketKey(desc, w, h, finalUsage);
            const aliasable = desc.aliasable !== false;

            let slot: PooledTexture;
            let aliased = false;
            let dedicated = false;

            if (!aliasable) {
                // Stable identity across compile windows. The slot lives
                // outside the bucket reuse map.
                const existing = this._dedicatedByName.get(lt.name);
                if (existing && existing.bucketKey === bucketKey) {
                    slot = existing;
                } else if (existing && inPlaceResizable(existing.bucketKey, bucketKey)) {
                    // Only the resolution changed (canvas resize). Resize
                    // the wrapper IN PLACE rather than allocating a new
                    // RenderTexture. Dedicated slots exist precisely so
                    // consumers (e.g. LitMaterial's transmission pass)
                    // can cache a bind group against a fixed RenderTexture
                    // identity; replacing the wrapper on resize would
                    // strand those bind groups on the destroyed old-size
                    // GPUTexture, producing "Destroyed texture [...] used
                    // in a submit" every frame after a resize. resize()
                    // delay-destroys the old GPU texture, rebuilds the
                    // descriptor and fires noticeChange() so consumers
                    // rebind to the new texture next frame.
                    this._currentBytes -= existing.estimatedBytes;
                    existing.rt.resize(w, h);
                    this._patchMipLevels(existing.rt, desc);
                    existing.bucketKey = bucketKey;
                    existing.estimatedBytes = estimateTextureBytes(desc, w, h);
                    this._currentBytes += existing.estimatedBytes;
                    if (this._currentBytes > this._peakBytes) this._peakBytes = this._currentBytes;
                    slot = existing;
                } else {
                    // No existing slot, or a non-size attribute (format,
                    // usage, layers, samples, mips) changed — the GPU
                    // texture is fundamentally different, so allocate fresh.
                    if (existing) this._destroySlot(existing);
                    slot = this._allocateSlot(lt, desc, w, h, finalUsage, bucketKey);
                    this._dedicatedByName.set(lt.name, slot);
                }
                dedicated = true;
            } else {
                // Try to reuse a same-bucket entry whose previous
                // logical resource has finished before this one starts.
                let bucket = this._buckets.get(bucketKey);
                if (!bucket) {
                    bucket = [];
                    this._buckets.set(bucketKey, bucket);
                }
                slot = this._findReusableSlot(bucket, lt.firstUseIdx)
                    ?? this._appendNewSlot(bucket, lt, desc, w, h, finalUsage, bucketKey);
                aliased = slot.inUseByName !== null && slot.inUseByName !== lt.name;
                slot.inUseUntilIdx = lt.lastUseIdx;
                slot.inUseByName = lt.name;
            }

            bindings.set(lt.name, slot.rt);
            debug.set(lt.name, { bucketKey, aliased, dedicated });
        }

        // Sweep dedicated slots whose name disappeared from the active
        // declaration set — those represent passes that were removed
        // or replaced. Destroying them here keeps memory in line with
        // the live graph.
        const liveDedicated = new Set(sorted.filter(lt => (lt.desc as TextureDesc).aliasable === false).map(lt => lt.name));
        for (const [name, slot] of this._dedicatedByName) {
            if (!liveDedicated.has(name)) {
                this._destroySlot(slot);
                this._dedicatedByName.delete(name);
            }
        }

        // Sweep stale aliasable buckets. A bucket key encodes WxH (see
        // computeBucketKey), so a canvas resize routes every transient to
        // a freshly-keyed bucket and leaves the previous size's bucket
        // behind. Markers were reset to null at the top of this pass and
        // only re-set for slots claimed this window, so a bucket with no
        // claimed slot is a shape the live graph no longer references —
        // most commonly an old resolution. Without this, the pool retains
        // a full set of transient RenderTextures per distinct size ever
        // seen, leaking GPU memory on every resize until allocation fails.
        // Live-size buckets keep all their slots (including idle aliasing
        // headroom) because at least one slot is in use.
        for (const [key, list] of this._buckets) {
            if (!list.some(slot => slot.inUseByName !== null)) {
                for (const slot of list) this._destroySlot(slot);
                this._buckets.delete(key);
            }
        }

        return { bindings, debug };
    }

    /** Destroy every pooled wrapper. Called on graph destroy and
     *  device-lost. */
    public dispose(): void {
        for (const list of this._buckets.values()) {
            for (const slot of list) this._destroySlot(slot);
        }
        this._buckets.clear();
        for (const slot of this._dedicatedByName.values()) this._destroySlot(slot);
        this._dedicatedByName.clear();
        this._currentBytes = 0;
    }

    public stats(): { currentBytes: number; peakBytes: number; bucketCount: number; slotCount: number } {
        let slotCount = this._dedicatedByName.size;
        for (const list of this._buckets.values()) slotCount += list.length;
        return {
            currentBytes: this._currentBytes,
            peakBytes: this._peakBytes,
            bucketCount: this._buckets.size,
            slotCount,
        };
    }

    private _findReusableSlot(bucket: PooledTexture[], firstUseIdx: number): PooledTexture | null {
        // Prefer the slot whose previous run ended longest ago — gives
        // a deterministic packing that minimizes thrash across compiles.
        // Linear scan is fine: buckets are bounded by max-concurrent
        // resources of one shape (typically < 8 in real frame graphs).
        let best: PooledTexture | null = null;
        for (const slot of bucket) {
            if (slot.inUseByName !== null) continue;     // currently held by another lifetime
            if (slot.inUseUntilIdx >= firstUseIdx) continue; // last assignment overlaps
            if (best === null || slot.inUseUntilIdx < best.inUseUntilIdx) best = slot;
        }
        return best;
    }

    private _appendNewSlot(
        bucket: PooledTexture[],
        lt: ResourceLifetime,
        desc: TextureDesc,
        w: number,
        h: number,
        usage: number,
        bucketKey: string,
    ): PooledTexture {
        const slot = this._allocateSlot(lt, desc, w, h, usage, bucketKey);
        bucket.push(slot);
        return slot;
    }

    private _allocateSlot(
        lt: ResourceLifetime,
        desc: TextureDesc,
        w: number,
        h: number,
        usage: number,
        bucketKey: string,
    ): PooledTexture {
        // autoResize=false: the pool drives resize by re-running
        // analyze + assign whenever presentationSize changes (which
        // the graph schedules via markDirty on the canvas-resize
        // event). Letting the texture install its own listener would
        // double-resize and clobber the pool's lifetime bookkeeping.
        const rt = new RenderTexture(
            w,
            h,
            desc.format,
            (desc.mipLevelCount ?? 1) > 1,
            usage,
            desc.numberLayer ?? 1,
            desc.sampleCount ?? 0,
            /*clear*/ true,
            /*autoResize*/ false,
            this._ctx,
        );
        rt.name = desc.label ?? lt.name;
        this._patchMipLevels(rt, desc);
        const estimatedBytes = estimateTextureBytes(desc, w, h);
        this._currentBytes += estimatedBytes;
        if (this._currentBytes > this._peakBytes) this._peakBytes = this._currentBytes;
        return {
            rt,
            bucketKey,
            inUseUntilIdx: lt.lastUseIdx,
            inUseByName: lt.name,
            estimatedBytes,
        };
    }

    /**
     * Force the GPUTextureDescriptor's actual mip count — the
     * RenderTexture ctor + resize() path forces useMipmap=false and
     * rebuilds the descriptor with mipLevelCount=1. Phase 4 removes this
     * workaround at the RenderTexture level.
     *
     * Patch only `textureDescriptor.mipLevelCount` + null the cached
     * gpuTexture/view so the next materialize uses the new mip count. Do
     * NOT also touch `mipmapCount` / `viewDescriptor` / `useMipmap` on the
     * wrapper — those propagate into `textureBindingLayout.sampleType`
     * rebuilds that flip r32float from `unfilterable-float` (correct) to
     * filterable `float` (rejected by validation). HiZ + downstream
     * r32float consumers bind via their own explicit views + bind-group
     * layouts so the wrapper-level sample-type defaults don't matter for
     * them; for rgba16float pyramids the defaults already match
     * (filterable). Re-applied after an in-place resize because resize()
     * rebuilds the descriptor back to mipLevelCount=1.
     *
     * The requested count is clamped to the maximum a full mip chain
     * supports at the texture's current size (`1 + floor(log2(max(w,h)))`).
     * Passes that bake their mip count once at setup time from the initial
     * presentation size (e.g. HiZPass) would otherwise keep requesting that
     * fixed count after the canvas shrinks below the next power of two,
     * tripping WebGPU's "mip level count exceeds the maximum for its size"
     * validation and aborting the frame — a resize crash distinct from the
     * stale-bind-group one. Consumers that need the real count read it back
     * from `textureDescriptor.mipLevelCount` (HiZPass.execute), so clamping
     * here keeps their generation loops in range too.
     */
    private _patchMipLevels(rt: RenderTexture, desc: TextureDesc): void {
        const requested = desc.mipLevelCount ?? 1;
        if (requested <= 1) return;
        const maxForSize = 1 + Math.floor(Math.log2(Math.max(rt.width, rt.height)));
        const mips = Math.min(requested, maxForSize);
        const rtAny = rt as unknown as {
            textureDescriptor?: GPUTextureDescriptor;
            gpuTexture: GPUTexture | null;
            view: GPUTextureView | null;
        };
        if (rtAny.textureDescriptor) {
            rtAny.textureDescriptor.mipLevelCount = mips;
        }
        rtAny.gpuTexture = null;
        rtAny.view = null;
    }

    private _destroySlot(slot: PooledTexture): void {
        const gpu = (slot.rt as unknown as { gpuTexture: GPUTexture | null }).gpuTexture;
        if (gpu) Texture.delayDestroyTexture(this._ctx, gpu);
        (slot.rt as unknown as { gpuTexture: GPUTexture | null }).gpuTexture = null;
        (slot.rt as unknown as { view: GPUTextureView | null }).view = null;
        this._currentBytes -= slot.estimatedBytes;
        if (this._currentBytes < 0) this._currentBytes = 0;
    }
}

/**
 * Compose the bucket key. Two lifetimes can alias only when their keys
 * match exactly — any difference (format, size, sample/layer/mip count,
 * usage) routes them to separate buckets.
 *
 * @internal
 */
export function computeBucketKey(desc: TextureDesc, w: number, h: number, usage: number): string {
    const mip = desc.mipLevelCount ?? 1;
    const sample = desc.sampleCount ?? 0;
    const layers = desc.numberLayer ?? 1;
    return `${desc.format}|${w}x${h}|s${sample}|l${layers}|m${mip}|u${usage}`;
}

/**
 * Whether bucket key `b` describes the same texture that key `a` does after
 * an in-place resize — i.e. it differs only in attributes that
 * {@link RenderTexture.resize} + {@link TransientTexturePool._patchMipLevels}
 * can rebuild without constructing a new wrapper: the `WxH` size token (index
 * 1) and the `m<mip>` mip-count token (index 4, which for pyramids is a
 * function of size). Format, sample count, layer count and usage are fixed at
 * construction and resize() reuses them, so any difference there is a genuine
 * shape change that requires a fresh allocation. Keeping the wrapper identity
 * stable for size/mip-only changes is what lets dedicated-slot consumers
 * (cached material bind groups) survive a canvas resize.
 *
 * @internal
 */
export function inPlaceResizable(a: string, b: string): boolean {
    if (a === b) return false;
    const strip = (k: string) => { const p = k.split('|'); p.splice(4, 1); p.splice(1, 1); return p.join('|'); };
    return strip(a) === strip(b);
}

/**
 * Rough size estimate for HWM accounting. Treats every format as 4 bpp
 * unless we know better — the actual GPU footprint depends on driver
 * tiling and isn't observable from WebGPU.
 *
 * @internal
 */
export function estimateTextureBytes(desc: TextureDesc, w: number, h: number): number {
    const bpp = bytesPerPixel(desc.format);
    const layers = desc.numberLayer ?? 1;
    const samples = Math.max(1, desc.sampleCount ?? 0);
    const mips = desc.mipLevelCount ?? 1;
    let total = 0;
    let mw = w, mh = h;
    for (let m = 0; m < mips; m++) {
        total += mw * mh * bpp * layers * samples;
        mw = Math.max(1, mw >> 1);
        mh = Math.max(1, mh >> 1);
    }
    return total;
}

function bytesPerPixel(format: GPUTextureFormat): number {
    // Coarse classification — exact byte counts for the WebGPU formats
    // the engine actually uses for transient resources. Unknown formats
    // fall back to 4 bpp.
    switch (format) {
        case 'r8unorm': case 'r8snorm': case 'r8uint': case 'r8sint':
            return 1;
        case 'r16uint': case 'r16sint': case 'r16float':
        case 'rg8unorm': case 'rg8snorm': case 'rg8uint': case 'rg8sint':
            return 2;
        case 'r32uint': case 'r32sint': case 'r32float':
        case 'rg16uint': case 'rg16sint': case 'rg16float':
        case 'rgba8unorm': case 'rgba8unorm-srgb': case 'rgba8snorm':
        case 'rgba8uint': case 'rgba8sint':
        case 'bgra8unorm': case 'bgra8unorm-srgb':
        case 'rgb10a2unorm': case 'rg11b10ufloat':
        case 'depth24plus': case 'depth32float':
            return 4;
        case 'rg32uint': case 'rg32sint': case 'rg32float':
        case 'rgba16uint': case 'rgba16sint': case 'rgba16float':
        case 'depth32float-stencil8':
            return 8;
        case 'rgba32uint': case 'rgba32sint': case 'rgba32float':
            return 16;
        default:
            return 4;
    }
}
