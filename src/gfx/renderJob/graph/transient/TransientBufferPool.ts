import { GPUBufferBase } from '../../../graphics/webGpu/core/buffer/GPUBufferBase';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { BufferDesc } from './ResourceDesc';
import { ResourceLifetime } from './LifetimeAnalyzer';

/**
 * One physical buffer slot held by the {@link TransientBufferPool}.
 *
 * @internal
 * @group Graph
 */
export interface PooledBuffer {
    buf: GPUBufferBase;
    bucketKey: string;
    actualSize: number;
    inUseUntilIdx: number;
    inUseByName: string | null;
}

/**
 * Snapshot of one assign() pass.
 *
 * @group Graph
 */
export interface TransientBufferAssignment {
    bindings: Map<string, GPUBufferBase>;
    debug: Map<string, { bucketKey: string; aliased: boolean; dedicated: boolean; grew: boolean }>;
}

/**
 * Physical pool for transient graph buffers. Mirrors
 * {@link TransientTexturePool} but buckets by `(roundedSize, usage)`
 * and reuses {@link GPUBufferBase} wrappers by calling
 * `resizeBuffer(size)` when the existing capacity is short.
 *
 * Phase 0 has no first-party consumers of `b.declareBuffer` — the pool
 * exists so the new API surface is symmetric with textures and so
 * future passes (GPU culling scratch, transient indirect args) can
 * adopt it without further engine work.
 *
 * @group Graph
 */
export class TransientBufferPool {
    private readonly _ctx: Context3D;
    private readonly _buckets = new Map<string, PooledBuffer[]>();
    private readonly _dedicatedByName = new Map<string, PooledBuffer>();
    private _currentBytes = 0;
    private _peakBytes = 0;

    constructor(ctx: Context3D) {
        this._ctx = ctx;
    }

    public assign(lifetimes: readonly ResourceLifetime[]): TransientBufferAssignment {
        for (const list of this._buckets.values()) {
            for (const slot of list) {
                slot.inUseUntilIdx = -1;
                slot.inUseByName = null;
            }
        }

        const bindings = new Map<string, GPUBufferBase>();
        const debug = new Map<string, { bucketKey: string; aliased: boolean; dedicated: boolean; grew: boolean }>();

        const bufLifetimes = lifetimes
            .filter(lt => lt.kind === 'buffer' && !lt.persistent)
            .sort((a, b) => {
                if (a.firstUseIdx !== b.firstUseIdx) return a.firstUseIdx - b.firstUseIdx;
                return a.name < b.name ? -1 : 1;
            });

        for (const lt of bufLifetimes) {
            const desc = lt.desc as BufferDesc;
            const requested = lt.resolvedSize!;
            const rounded = roundUpToPow2(Math.max(16, requested));
            const usage = lt.resolvedUsage || desc.usage;
            const bucketKey = `${rounded}|u${usage}`;
            const aliasable = desc.aliasable !== false;

            let slot: PooledBuffer;
            let aliased = false;
            let dedicated = false;
            let grew = false;

            if (!aliasable) {
                const existing = this._dedicatedByName.get(lt.name);
                if (existing && existing.bucketKey === bucketKey) {
                    slot = existing;
                } else {
                    if (existing) this._destroySlot(existing);
                    slot = this._allocateSlot(lt, usage, rounded, bucketKey);
                    this._dedicatedByName.set(lt.name, slot);
                }
                dedicated = true;
            } else {
                let bucket = this._buckets.get(bucketKey);
                if (!bucket) {
                    bucket = [];
                    this._buckets.set(bucketKey, bucket);
                }
                const reused = this._findReusableSlot(bucket, lt.firstUseIdx);
                if (reused) {
                    slot = reused;
                    if (slot.actualSize < requested) {
                        slot.buf.resizeBuffer(rounded);
                        this._currentBytes += rounded - slot.actualSize;
                        slot.actualSize = rounded;
                        grew = true;
                    }
                    aliased = slot.inUseByName !== null && slot.inUseByName !== lt.name;
                } else {
                    slot = this._allocateSlot(lt, usage, rounded, bucketKey);
                    bucket.push(slot);
                }
                slot.inUseUntilIdx = lt.lastUseIdx;
                slot.inUseByName = lt.name;
                if (this._currentBytes > this._peakBytes) this._peakBytes = this._currentBytes;
            }

            bindings.set(lt.name, slot.buf);
            debug.set(lt.name, { bucketKey, aliased, dedicated, grew });
        }

        const liveDedicated = new Set(bufLifetimes
            .filter(lt => (lt.desc as BufferDesc).aliasable === false)
            .map(lt => lt.name));
        for (const [name, slot] of this._dedicatedByName) {
            if (!liveDedicated.has(name)) {
                this._destroySlot(slot);
                this._dedicatedByName.delete(name);
            }
        }

        // Sweep stale aliasable buckets, mirroring TransientTexturePool.
        // A bucket whose slots all went unclaimed this window (markers
        // were reset to null at the top of assign) is a size/usage shape
        // the live graph no longer references, so retaining it leaks GPU
        // memory across resolution-dependent recompiles.
        for (const [key, list] of this._buckets) {
            if (!list.some(slot => slot.inUseByName !== null)) {
                for (const slot of list) this._destroySlot(slot);
                this._buckets.delete(key);
            }
        }

        return { bindings, debug };
    }

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

    private _findReusableSlot(bucket: PooledBuffer[], firstUseIdx: number): PooledBuffer | null {
        let best: PooledBuffer | null = null;
        for (const slot of bucket) {
            if (slot.inUseByName !== null) continue;
            if (slot.inUseUntilIdx >= firstUseIdx) continue;
            if (best === null || slot.inUseUntilIdx < best.inUseUntilIdx) best = slot;
        }
        return best;
    }

    private _allocateSlot(lt: ResourceLifetime, usage: number, size: number, bucketKey: string): PooledBuffer {
        const buf = new GPUBufferBase();
        buf.usage = usage;
        buf.byteSize = size;
        // Bind to the context so the first .buffer access materializes
        // on the right device.
        (buf as unknown as { _boundCtx: Context3D })._boundCtx = this._ctx;
        this._currentBytes += size;
        if (this._currentBytes > this._peakBytes) this._peakBytes = this._currentBytes;
        return {
            buf,
            bucketKey,
            actualSize: size,
            inUseUntilIdx: lt.lastUseIdx,
            inUseByName: lt.name,
        };
    }

    private _destroySlot(slot: PooledBuffer): void {
        try { slot.buf.destroy(); } catch { /* device-lost / already destroyed */ }
        this._currentBytes -= slot.actualSize;
        if (this._currentBytes < 0) this._currentBytes = 0;
    }
}

/** @internal */
export function roundUpToPow2(n: number): number {
    if (n <= 1) return 1;
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}
