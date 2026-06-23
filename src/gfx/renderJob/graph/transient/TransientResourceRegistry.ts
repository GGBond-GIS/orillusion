import { RenderTexture } from '../../../../textures/RenderTexture';
import { GPUBufferBase } from '../../../graphics/webGpu/core/buffer/GPUBufferBase';
import { AccessHint, BufferDesc, TextureDesc } from './ResourceDesc';

/**
 * Kind tag identifying a transient registry entry.
 * @group Graph
 */
export type TransientResourceKind = 'texture' | 'buffer';

/**
 * Internal record of one `b.declareTexture` / `b.declareBuffer` /
 * `b.importExternalTexture` / `b.importExternalBuffer` call.
 *
 * @internal
 * @group Graph
 */
export interface TransientResourceDeclaration {
    name: string;
    kind: TransientResourceKind;
    /** The desc passed in. For imported resources the desc is a
     *  best-effort reflection of the external resource (so the
     *  analyzer can still bucket / report on it). */
    desc: TextureDesc | BufferDesc;
    /** True for `b.importExternalTexture / importExternalBuffer` —
     *  pool must NOT alias and must NOT allocate; the external
     *  resource is the only physical resource. */
    persistent: boolean;
    /** Pass that owns the declaration (single-creator). */
    creatorPass: string;
    /** Only set when `persistent === true`: the externally-owned GPU
     *  resource that the pool returns via `getTexture` / `getBuffer`. */
    externalTexture?: RenderTexture;
    externalBuffer?: GPUBufferBase;
}

/**
 * Per-graph collector for transient resource declarations and access
 * hints. Lives on the {@link RenderGraph} as `_transient`. Populated
 * during each pass's `setup()` (through `RenderGraphBuilder`), consumed
 * by {@link LifetimeAnalyzer} inside `RenderGraph.compile()`.
 *
 * Plain pass `b.read(name)` / `b.write(name)` (without an access hint
 * and without a `TextureHandle/BufferHandle` target) still flow through
 * the legacy `RenderGraphResourcePool` and never touch this registry —
 * the new API is fully opt-in.
 *
 * @group Graph
 */
export class TransientResourceRegistry {
    /** logical name → declaration. Single-creator: redeclaring the
     *  same name throws. */
    private readonly _declarations = new Map<string, TransientResourceDeclaration>();
    /** logical name → unioned GPUTextureUsage / GPUBufferUsage bitfield
     *  contributed by every `read/write/readWrite` access hint targeting
     *  this resource. Combined with the desc's explicit `usage` (when
     *  not `'auto'`) inside the analyzer. */
    private readonly _hintUsage = new Map<string, number>();

    /**
     * Register a transient texture declaration.
     * @throws if `name` has already been declared (single-creator).
     */
    public declareTexture(name: string, desc: TextureDesc, creatorPass: string): void {
        this._assertUnique(name, creatorPass);
        this._declarations.set(name, {
            name,
            kind: 'texture',
            desc,
            persistent: false,
            creatorPass,
        });
    }

    /**
     * Register a transient buffer declaration.
     * @throws if `name` has already been declared (single-creator).
     */
    public declareBuffer(name: string, desc: BufferDesc, creatorPass: string): void {
        this._assertUnique(name, creatorPass);
        this._declarations.set(name, {
            name,
            kind: 'buffer',
            desc,
            persistent: false,
            creatorPass,
        });
    }

    /**
     * Register an externally-owned texture as a persistent resource.
     * The pool will not allocate, will not alias, and will not destroy
     * the underlying GPU texture. `getTexture(name)` returns `tex`
     * verbatim.
     */
    public importExternalTexture(name: string, tex: RenderTexture, creatorPass: string): void {
        this._assertUnique(name, creatorPass);
        this._declarations.set(name, {
            name,
            kind: 'texture',
            // Best-effort desc reflection. The analyzer only consults
            // the desc for bucketing transient resources; persistent
            // entries skip allocation entirely, so most fields are
            // advisory and labels only.
            desc: {
                format: tex.format,
                width: tex.width,
                height: tex.height,
                sampleCount: tex.sampleCount,
                numberLayer: tex.numberLayer,
                usage: tex.usage,
                aliasable: false,
                label: tex.name,
            },
            persistent: true,
            creatorPass,
            externalTexture: tex,
        });
    }

    /**
     * Register an externally-owned GPU buffer as a persistent resource.
     */
    public importExternalBuffer(name: string, buf: GPUBufferBase, creatorPass: string): void {
        this._assertUnique(name, creatorPass);
        this._declarations.set(name, {
            name,
            kind: 'buffer',
            desc: {
                size: buf.byteSize ?? 0,
                usage: buf.usage,
                aliasable: false,
            },
            persistent: true,
            creatorPass,
            externalBuffer: buf,
        });
    }

    /**
     * Record one `read` / `write` / `readWrite` access hint for a
     * resource. Hint bits are OR'd into the per-name hint usage map;
     * the analyzer combines this with the desc's `usage` (when `'auto'`)
     * to produce the final allocation usage.
     *
     * Targets that aren't registered in this registry are silently
     * ignored — they're legacy `b.write(name, getter)` resources that
     * live in `RenderGraphResourcePool` only and don't participate in
     * transient allocation.
     */
    public recordAccessHint(name: string, kind: TransientResourceKind, hint: AccessHint, mode: 'read' | 'write'): void {
        if (!this._declarations.has(name)) return;
        const prev = this._hintUsage.get(name) ?? 0;
        this._hintUsage.set(name, prev | hintToUsageBit(kind, hint, mode));
    }

    /** Read-only view of registered declarations. */
    public get declarations(): ReadonlyMap<string, TransientResourceDeclaration> {
        return this._declarations;
    }

    /** Per-name unioned usage contribution from access hints. */
    public hintUsageOf(name: string): number {
        return this._hintUsage.get(name) ?? 0;
    }

    public has(name: string): boolean {
        return this._declarations.has(name);
    }

    public get(name: string): TransientResourceDeclaration | undefined {
        return this._declarations.get(name);
    }

    /**
     * Drop the declaration + access hints for `name`. Called from
     * `RenderGraph.remove()` / `RenderGraph.replace()` so a re-added
     * pass can re-declare its outputs without tripping the
     * single-creator check.
     */
    public unregister(name: string): void {
        this._declarations.delete(name);
        this._hintUsage.delete(name);
    }

    /**
     * Drop every declaration and hint. Called on graph destroy and
     * device-lost.
     */
    public dispose(): void {
        this._declarations.clear();
        this._hintUsage.clear();
    }

    private _assertUnique(name: string, creatorPass: string): void {
        const prior = this._declarations.get(name);
        if (prior) {
            throw new Error(
                `RenderGraph.transient: resource '${name}' already declared by pass '${prior.creatorPass}' — ` +
                `pass '${creatorPass}' must use a different name. Only one pass may declare/import a given transient name.`,
            );
        }
    }
}

/**
 * Map an {@link AccessHint} + resource kind + read/write mode to the
 * corresponding `GPUTextureUsage` / `GPUBufferUsage` bit(s). Every
 * recorded hint additionally contributes `COPY_SRC | COPY_DST` for
 * textures (dev-time convenience for debug copies); buffers similarly
 * pick up `COPY_SRC | COPY_DST`.
 *
 * @internal
 */
export function hintToUsageBit(kind: TransientResourceKind, hint: AccessHint, mode: 'read' | 'write'): number {
    if (kind === 'texture') {
        let bits = GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST;
        switch (hint) {
            case 'sample':     bits |= GPUTextureUsage.TEXTURE_BINDING; break;
            case 'storage':    bits |= GPUTextureUsage.STORAGE_BINDING; break;
            case 'attachment': bits |= GPUTextureUsage.RENDER_ATTACHMENT; break;
            case 'copy':       /* COPY_SRC/COPY_DST already set */     break;
        }
        return bits;
    }
    // Buffer
    let bits = GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    switch (hint) {
        case 'sample':
        case 'attachment':
            // Buffers don't have these usages; the hint is a no-op
            // beyond the COPY bits. Pass authors should use the
            // explicit `usage` field on BufferDesc for non-storage
            // buffers (uniform, vertex, etc.).
            break;
        case 'storage':
            // Storage buffer access flavors STORAGE on both read and
            // write — WebGPU has no separate STORAGE_READ.
            bits |= GPUBufferUsage.STORAGE;
            break;
        case 'copy':
            // mode steers which direction is needed; both are already
            // set above for dev friction-free copies.
            break;
    }
    // mode parameter is reserved for future tightening (e.g. dropping
    // COPY_DST on read-only). Currently no-op.
    void mode;
    return bits;
}
