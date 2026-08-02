import { RenderGraphPass } from '../RenderGraphPass';
import { BufferDesc, SizeSpec, TextureDesc } from './ResourceDesc';
import { TransientResourceDeclaration, TransientResourceKind, TransientResourceRegistry } from './TransientResourceRegistry';

/**
 * Per-resource analysis result. The transient pool consumes these to
 * decide aliasing (same bucket key, disjoint `[firstUseIdx, lastUseIdx]`
 * intervals can share a physical wrapper) and final allocation.
 *
 * @group Graph
 */
export interface ResourceLifetime {
    name: string;
    kind: TransientResourceKind;
    /** Original desc as passed to `b.declareTexture` /
     *  `b.declareBuffer`. The analyzer never mutates it. */
    desc: TextureDesc | BufferDesc;
    /** Index into the topo-sorted pass order at which this resource is
     *  first written or read. `Number.POSITIVE_INFINITY` if no enabled
     *  pass references it — the analyzer emits a console.warn for
     *  these "orphan" declarations. */
    firstUseIdx: number;
    /** Last index at which this resource is referenced. `-1` if no
     *  enabled pass references it. */
    lastUseIdx: number;
    /** Final unioned `GPUTextureUsage` / `GPUBufferUsage` bitmask after
     *  combining the desc's `usage` field with every access hint
     *  contribution recorded in {@link TransientResourceRegistry}. */
    resolvedUsage: number;
    /** Resolved pixel width (textures only). Undefined for buffers. */
    resolvedWidth?: number;
    /** Resolved pixel height (textures only). Undefined for buffers. */
    resolvedHeight?: number;
    /** Resolved byte size (buffers only). Undefined for textures. */
    resolvedSize?: number;
    /** True ⇒ this resource is externally owned (imported) or
     *  explicitly marked `aliasable: false`. The pool MUST NOT alias
     *  it with any other lifetime in the same bucket. */
    persistent: boolean;
}

/**
 * Compile-time lifetime analysis over the {@link TransientResourceRegistry}'s
 * declarations and the compiled pass order. Invoked from
 * `RenderGraph.compile()` immediately after `topoSort`; output drives
 * the transient texture + buffer pools.
 *
 * The analyzer walks the topo order and updates each resource's
 * `[firstUseIdx, lastUseIdx]` envelope from every pass's
 * `reads` / `writes` / `_lifetimeReads` / `_lifetimeWrites` arrays.
 * The `_lifetime*` arrays are populated by the typed-RT builders
 * (`borrowRenderTarget` etc., Phase 2) to extend a resource's
 * lifetime without polluting the topo edge set; Phase 0 tolerates
 * their absence.
 *
 * @group Graph
 */
export class LifetimeAnalyzer {
    /**
     * Analyze one compile window.
     *
     * @param order Topo-sorted pass names from {@link topoSort}.
     * @param byName Pass lookup map.
     * @param registry Per-graph transient registry populated during setup.
     * @param presentationSize `[width, height]` of the owning view's
     *   canvas. Used to resolve `'screen'` / `'screen/2'` size tokens.
     */
    public static analyze(
        order: readonly string[],
        byName: ReadonlyMap<string, RenderGraphPass>,
        registry: TransientResourceRegistry,
        presentationSize: readonly [number, number],
    ): ResourceLifetime[] {
        const lifetimes = new Map<string, ResourceLifetime>();

        // Seed one ResourceLifetime per declaration. Persistent ones
        // get the full envelope upfront; transient ones start with
        // empty envelopes that get widened during the walk.
        for (const [name, decl] of registry.declarations) {
            lifetimes.set(name, seedLifetime(decl, order.length));
        }

        // Walk the order, widening envelopes for every read/write.
        for (let i = 0; i < order.length; i++) {
            const pass = byName.get(order[i]);
            if (!pass) continue;
            widenAll(pass.reads, i, lifetimes);
            widenAll(pass.writes, i, lifetimes);
            // Phase-2 hooks: typed RT builders push attachment sub-names
            // into these private arrays so attachment lifetimes follow
            // their composite RT's writers/borrowers without injecting
            // topo edges. Tolerate absence in Phase 0.
            const lifetimeReads = (pass as PassWithLifetimeArrays)._lifetimeReads;
            const lifetimeWrites = (pass as PassWithLifetimeArrays)._lifetimeWrites;
            if (lifetimeReads) widenAll(lifetimeReads, i, lifetimes);
            if (lifetimeWrites) widenAll(lifetimeWrites, i, lifetimes);
        }

        // Resolve size tokens and final usage.
        const out: ResourceLifetime[] = [];
        for (const lt of lifetimes.values()) {
            // Persistent resources keep the seeded full envelope even
            // if no pass referenced them by name — that's the expected
            // case for adopted GBuffer textures consumed via material
            // back-channels.
            if (!lt.persistent && lt.lastUseIdx < 0) {
                console.warn(
                    `[RenderGraph] transient resource '${lt.name}' was declared but is unused this compile window — ` +
                    `no enabled pass reads or writes it. Skipping pool allocation.`,
                );
                continue;
            }
            resolveSizeAndUsage(lt, registry, presentationSize);
            out.push(lt);
        }
        return out;
    }
}

/**
 * Phase-2 typed RT builders attach optional lifetime arrays to
 * passes so attachment sub-names follow their composite RT's writers
 * without affecting topo. Phase 0 declares the optional shape only;
 * the fields are written by Phase 2 builder code.
 *
 * @internal
 */
interface PassWithLifetimeArrays {
    _lifetimeReads?: readonly string[];
    _lifetimeWrites?: readonly string[];
}

function seedLifetime(decl: TransientResourceDeclaration, orderLength: number): ResourceLifetime {
    // `persistent` here means "externally-owned, pool MUST NOT allocate"
    // — only true for importExternalTexture / importExternalBuffer
    // resources. `aliasable: false` is a DIFFERENT concern: the pool
    // still allocates (and tracks lifetime + size), it just refuses
    // to share the wrapper with other lifetimes. The dedicated path
    // is handled inside TransientTexturePool itself.
    const persistent = decl.persistent;
    const firstUseIdx = decl.persistent ? 0 : Number.POSITIVE_INFINITY;
    const lastUseIdx = decl.persistent ? Math.max(0, orderLength - 1) : -1;
    return {
        name: decl.name,
        kind: decl.kind,
        desc: decl.desc,
        firstUseIdx,
        lastUseIdx,
        resolvedUsage: 0,
        persistent,
    };
}

function widenAll(names: readonly string[], passIdx: number, lifetimes: Map<string, ResourceLifetime>): void {
    for (const n of names) {
        const lt = lifetimes.get(n);
        if (!lt) continue;
        if (passIdx < lt.firstUseIdx) lt.firstUseIdx = passIdx;
        if (passIdx > lt.lastUseIdx) lt.lastUseIdx = passIdx;
    }
}

function resolveSizeAndUsage(
    lt: ResourceLifetime,
    registry: TransientResourceRegistry,
    presentationSize: readonly [number, number],
): void {
    if (lt.kind === 'texture') {
        const desc = lt.desc as TextureDesc;
        lt.resolvedWidth = resolveSizeSpec(desc.width, presentationSize[0]);
        lt.resolvedHeight = resolveSizeSpec(desc.height, presentationSize[1]);
    } else {
        const desc = lt.desc as BufferDesc;
        lt.resolvedSize = desc.size;
    }

    const hintBits = registry.hintUsageOf(lt.name);
    const explicit = (lt.desc as TextureDesc | BufferDesc).usage;
    if (typeof explicit === 'number') {
        lt.resolvedUsage = explicit | hintBits;
        // If the caller wrote an explicit mask but missed a bit that a
        // hint requires, warn — the union is permissive (their mask
        // gets the missing bit anyway), but the divergence usually
        // means the caller's mental model of how the resource is used
        // is stale.
        const missing = hintBits & ~explicit;
        if (missing !== 0) {
            console.warn(
                `[RenderGraph] transient '${lt.name}' explicit usage 0x${explicit.toString(16)} ` +
                `is missing bits 0x${missing.toString(16)} that are required by recorded access hints. ` +
                `Final usage will be 0x${lt.resolvedUsage.toString(16)} — consider switching to usage:'auto' ` +
                `or extending the explicit mask.`,
            );
        }
    } else {
        // 'auto' or undefined: use the hint-derived bits alone.
        // Empty hints (no read/write with intent) leaves usage = 0,
        // which the pool detects and reports as a malformed declaration.
        lt.resolvedUsage = hintBits;
    }
}

/**
 * Resolve a {@link SizeSpec} token against a canvas dimension. Numeric
 * specs pass through verbatim; symbolic tokens divide the canvas dim
 * by the corresponding denominator.
 *
 * @internal
 */
export function resolveSizeSpec(spec: SizeSpec, canvasDim: number): number {
    if (typeof spec === 'number') return Math.max(1, Math.floor(spec));
    switch (spec) {
        case 'screen':   return Math.max(1, Math.floor(canvasDim));
        case 'screen/2': return Math.max(1, Math.floor(canvasDim / 2));
        case 'screen/4': return Math.max(1, Math.floor(canvasDim / 4));
        case 'screen/8': return Math.max(1, Math.floor(canvasDim / 8));
    }
    // Exhaustiveness guard — unreachable when SizeSpec is the only
    // input type, but defensive against future additions.
    throw new Error(`[RenderGraph] unknown SizeSpec: ${String(spec)}`);
}
