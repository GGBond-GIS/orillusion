import { Context3D } from '../../graphics/webGpu/Context3D';
import { View3D } from '../../../core/View3D';
import { OcclusionSystem } from '../occlusion/OcclusionSystem';
import { RTFrame } from '../frame/RTFrame';
import { GraphValidator, topoSort, UnresolvedResourceError, WrongResourceKindError } from './GraphValidator';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from './RenderGraphPass';
import { RenderGraphResourcePool, ResourceKind } from './RenderGraphResourcePool';
import { BeginPassOptions, RenderGraphRenderTarget, RenderGraphRenderTargetDesc } from './RenderGraphRenderTarget';
import { RenderGraphRenderPass, RenderPipelineDesc } from './RenderGraphRenderPass';
import { ComputePipelineDesc, RenderGraphComputePass } from './RenderGraphComputePass';
import { TransientResourceRegistry } from './transient/TransientResourceRegistry';
import { TransientTexturePool } from './transient/TransientTexturePool';
import { TransientBufferPool } from './transient/TransientBufferPool';
import { LifetimeAnalyzer, ResourceLifetime } from './transient/LifetimeAnalyzer';
import { AccessHint, BufferDesc, TextureDesc } from './transient/ResourceDesc';
import { BufferHandle, TextureHandle, makeBufferHandle, makeTextureHandle, resourceName } from './transient/ResourceHandle';
import { RenderTexture } from '../../../textures/RenderTexture';
import { GPUBufferBase } from '../../graphics/webGpu/core/buffer/GPUBufferBase';
import { CResizeEvent } from '../../../event/CResizeEvent';
import { RTResourceMap } from '../frame/RTResourceMap';

/** Internal: per-graph metadata stamped onto a pass at add() time. */
const PASS_META = Symbol('RenderGraphPass.meta');
interface PassMeta {
    insertedOrder: number;
    /** Has the pass's `setup()` been run + committed? `add()` stamps
     *  `false`; the first `compile()` that processes the pass flips it
     *  to `true`. `replace`/`remove` consult this to decide whether the
     *  pass actually owns any pool entries worth releasing. */
    setupDone: boolean;
}

/**
 * Sentinel thrown by the transactional builder when a setup() call
 * references a resource (or upstream pass) that has not yet been
 * registered. The current attempt is rolled back (draft discarded);
 * `_runPendingSetups` retries the pass on a later round after other
 * passes have had a chance to publish the missing name.
 */
class _PendingSetupError extends Error {
    constructor(public readonly resourceName: string) {
        super(`RenderGraph: setup pending — '${resourceName}' not yet registered.`);
        this.name = '_PendingSetupError';
    }
}

/**
 * Per-attempt buffer of side-effects a pass's setup() would apply to
 * the graph. Committed by `_commitDraft` only if setup completes
 * without throwing `_PendingSetupError`; discarded on pending so the
 * pass can be retried with no lingering state.
 */
class _SetupDraft {
    reads: string[] = [];
    writes: string[] = [];
    creates: string[] = [];
    deps: Set<string>;
    /** name → would-be pool entry (overwrites real pool on commit). */
    poolEntries = new Map<string, { getter: () => unknown; kind: ResourceKind; persistent: boolean }>();
    /** name → newly-allocated RT (added to `_renderTargets` on commit). */
    rtEntries = new Map<string, RenderGraphRenderTarget>();
    /** name → transient kind for this attempt (for in-flight single-
     *  creator + recordAccessHint visibility). */
    transientKinds = new Map<string, 'texture' | 'buffer'>();
    /** Deferred transient registry mutations (declare/import). Captured
     *  as closures so commit replays them in setup order. */
    transientOps: Array<() => void> = [];
    /** Deferred `_writers.push` calls — only for tooling, but kept in
     *  draft so they're not applied on a failed attempt. */
    rtWriterPushes: Array<{ rt: RenderGraphRenderTarget; passName: string }> = [];
    /** Deferred access-hint records (`recordAccessHint`). */
    hintOps: Array<() => void> = [];
    /** Deferred `_eagerAllocateAndPublish` calls (publishToLegacyMap). */
    eagerPublishes: Array<{ name: string; desc: TextureDesc }> = [];

    constructor(initialDeps: Iterable<string> | undefined) {
        this.deps = new Set(initialDeps ?? []);
    }
}

/**
 * User-facing Frame Graph. Each {@link View3D} owns one — the graph
 * is bound to the view's Context3D in the constructor and uses that
 * view as the implicit owner for setup contexts and pass execution.
 *
 * Pass lifecycle:
 *
 *   graph.add(MyPass, ...args)
 *     → new MyPass(...args)            // ctor: nothing GPU
 *     → (defer; setup runs at compile)
 *     → graph.compile() (lazy)         // setup → validator → topoSort
 *       → pass.setup(builder)          // declares reads/writes/creates
 *     → pass.execute(ctx)              // each frame, in topo order
 *     → pass.destroy()                 // on graph.destroy() or remove()
 *
 * Setup is **deferred** to `compile()` and runs with a transactional
 * builder + multi-round iteration: a pass that reads a resource (or
 * uses an RT) declared by another not-yet-set-up pass throws an
 * internal `_PendingSetupError`, its draft is discarded, and the pass
 * is retried after other passes commit their declarations. This makes
 * `add()` call order irrelevant — the topo sort still ultimately
 * picks the right execute order from the declared reads/writes/deps.
 *
 * The graph collects `b.read` / `b.write` calls into the pass's
 * `reads` / `writes` / `creates` arrays during setup, freezing them
 * at commit time. See {@link RenderGraphPass} for the contract.
 *
 * ## Hot-swap contract
 *
 * Mutations are safe at any time between frames. Each one marks the
 * graph dirty so the next `compile()` rebuilds; wrap a sequence of
 * mutations in {@link beginUpdate} / {@link endUpdate} to coalesce.
 *
 * | Op | Effect on validator | Effect on pool |
 * |----|---------------------|----------------|
 * | `add(Ctor)` | new pass joins validation + topo | pass's `b.write(name, getter)` registers `name` |
 * | `remove(name)` | pass leaves validation + topo; consumers of its outputs fail compile | pass's `creates` are unregistered |
 * | `replace(name, Ctor)` | old leaves, new joins | old `creates` unregistered, then new `setup()` registers |
 * | `disablePass(name)` | pass is filtered out as if removed | unchanged (getter stays for cheap `enablePass`) |
 * | `enablePass(name)` | pass re-enters validation + topo | unchanged |
 *
 * `disable === remove` for the validator's purposes — disabling a
 * producer whose output is read by an enabled pass throws
 * `UnresolvedResourceError` at the next compile, instead of silently
 * delivering stale data at execute. Disable is the right choice when
 * you intend to flip the pass back on; remove is right when you don't.
 *
 * @group Graph
 */
export class RenderGraph {
    private readonly _view: View3D;
    private readonly _ctx: Context3D;
    private readonly _pool: RenderGraphResourcePool;
    private readonly _passes: RenderGraphPass[] = [];
    private readonly _byName: Map<string, RenderGraphPass> = new Map();
    /** name → RenderGraphRenderTarget for every typed RT registered
     *  through `b.createRenderTarget` / `b.adoptRenderTarget`. Lets
     *  {@link execute} reset the per-frame first-writer flag in O(RT)
     *  rather than scanning the pool. */
    private readonly _renderTargets: Map<string, RenderGraphRenderTarget> = new Map();
    /** Per-graph transient resource subsystem. Populated by `b.declareTexture`
     *  / `b.declareBuffer` / `b.importExternalTexture` during pass setup;
     *  consumed by {@link LifetimeAnalyzer} + the physical pools in
     *  {@link compile}. */
    private readonly _transient: TransientResourceRegistry = new TransientResourceRegistry();
    private readonly _texturePool: TransientTexturePool;
    private readonly _bufferPool: TransientBufferPool;
    /** Latest lifetime analysis output. Held across frames so future
     *  Phase 6 work (storeOp='discard' derivation, debug dumpDot)
     *  can consult per-resource intervals without re-running analyze. */
    private _lifetimes: ResourceLifetime[] = [];
    /** Per-resource last-use compile-order index. Used by
     *  {@link RenderGraphRenderTarget.beginPass} to auto-derive
     *  `storeOp='discard'` for attachments whose last writer is the
     *  current pass and which have no downstream reader. Built each
     *  compile; missing entries imply "no transient lifetime known
     *  → must store" (safe default). */
    private _lastUseByName: Map<string, number> = new Map();
    /** Index into `_compiled` of the pass currently in `execute()`.
     *  Set per-pass during {@link execute} so
     *  {@link RenderGraphRenderTarget.beginPass} can compare against
     *  `_lastUseByName` without threading an extra parameter through
     *  every encoder-open API. */
    private _currentPassIdx: number = -1;
    /** logical name → pool-resolved RenderTexture for the current
     *  compile window. Cleared each {@link compile} and repopulated
     *  from {@link TransientTexturePool.assign}. */
    private _textureBindings: Map<string, RenderTexture> = new Map();
    private _bufferBindings: Map<string, GPUBufferBase> = new Map();
    private _compiled: string[] | null = null;
    private _dirty: boolean = true;
    private _insertCounter: number = 0;
    private _batchDepth: number = 0;
    private readonly _onDeviceLost: (event: { data: unknown }) => void;
    private readonly _onCanvasResize: () => void;

    constructor(view: View3D) {
        this._view = view;
        this._ctx = view.engine3D.context3D;
        this._pool = new RenderGraphResourcePool(this._ctx);
        this._texturePool = new TransientTexturePool(this._ctx);
        this._bufferPool = new TransientBufferPool(this._ctx);

        // Release pool registrations when the device is lost. Fresh
        // textures + buffers come back via re-init, so the next
        // `add()` cycle re-registers everything.
        this._onDeviceLost = () => {
            this._pool.dispose();
            this._texturePool.dispose();
            this._bufferPool.dispose();
            this._textureBindings.clear();
            this._bufferBindings.clear();
            this._dirty = true;
        };
        // Canvas resize invalidates size-token resolution (e.g.
        // `width: 'screen/2'`). Mark dirty so the next `compile()`
        // re-analyzes lifetimes against the new presentationSize and
        // the pool re-allocates same-bucket-but-new-resolution slots.
        // Skip if the addEventListener API isn't present (test stubs).
        this._onCanvasResize = () => { this._dirty = true; };
        if (typeof this._ctx.addEventListener === 'function') {
            this._ctx.addEventListener(Context3D.DEVICE_LOST, this._onDeviceLost, this);
            this._ctx.addEventListener(CResizeEvent.RESIZE, this._onCanvasResize, this);
        }
    }

    public get context(): Context3D {
        return this._ctx;
    }

    public get view(): View3D {
        return this._view;
    }

    public get pool(): RenderGraphResourcePool {
        return this._pool;
    }

    public get passes(): readonly RenderGraphPass[] {
        return this._passes;
    }

    /**
     * Construct a pass and queue it for the next `compile()`. The
     * factory passes ctor args through to `new Ctor(...args)`; the
     * pass's `setup()` is NOT run here — it runs at compile time so
     * `add()` call order is independent of resource-dependency order.
     *
     * Returns the constructed pass so callers can hold a reference if
     * needed — but the canonical way to reach a pass after add is
     * `graph.getPass<T>(name)`. Note that `pass.reads`/`writes`/
     * `creates` are empty arrays until the first `compile()` runs the
     * pass's setup.
     */
    public add<C extends new (...args: any[]) => RenderGraphPass>(
        Ctor: C,
        ...args: ConstructorParameters<C>
    ): InstanceType<C> {
        const pass = new Ctor(...args) as InstanceType<C>;
        this._registerPending(pass);
        return pass;
    }

    /** Replace a pass by name. The replacement is queued for setup at
     *  the next `compile()` — same deferred-setup contract as `add()`.
     *  The old pass's `destroy()` is called immediately and any resource
     *  handles it owns are unregistered from the pool, but only if it
     *  had completed setup (otherwise it owns nothing yet). */
    public replace<C extends new (...args: any[]) => RenderGraphPass>(
        name: string,
        Ctor: C,
        ...args: ConstructorParameters<C>
    ): InstanceType<C> {
        const idx = this._passes.findIndex(p => p.name === name);
        if (idx < 0) throw new Error(`RenderGraph.replace: pass '${name}' not found.`);
        const prev = this._passes[idx];
        // Preserve the original insertion order. replace is "in-place
        // swap of one pass for another", and `insertedOrder` is the
        // single tie-break key used by topoSort's chain-writers /
        // resource-flow edges (GraphValidator.topoSort). Without
        // preserving it, the new pass moves to the back of the order
        // and any mutator-writer of one of its outputs (e.g.
        // SortedTransparentPass mutating COLOR_BUFFER that ColorPass
        // creates) flips relative to it, producing a fake cycle.
        const prevMeta = (prev as any)[PASS_META] as PassMeta | undefined;
        prev.destroy();
        if (prevMeta?.setupDone) {
            for (const n of prev.creates) this._releaseCreated(n);
        }
        const pass = new Ctor(...args) as InstanceType<C>;
        // Initialize empty frozen arrays + meta with preserved order.
        (pass as any).reads = Object.freeze([]);
        (pass as any).writes = Object.freeze([]);
        (pass as any).creates = Object.freeze([]);
        (pass as any)[PASS_META] = {
            insertedOrder: prevMeta?.insertedOrder ?? this._insertCounter++,
            setupDone: false,
        } satisfies PassMeta;
        this._passes.splice(idx, 1, pass);
        this._byName.delete(name);
        this._byName.set(pass.name, pass);
        this._dirty = true;
        return pass;
    }

    /** Remove a pass by name. Idempotent — returns `false` if `name`
     *  isn't registered (callers can use this for unconditional
     *  cleanup). On a hit: `pass.destroy()` runs, every name in
     *  `pass.creates` is dropped from the pool, and the pass is
     *  unlinked from the graph. The next `compile()` rebuilds without
     *  it, and `UnresolvedResourceError` surfaces for any consumer that
     *  still references the removed pass's outputs. */
    public remove(name: string): boolean {
        const idx = this._passes.findIndex(p => p.name === name);
        if (idx < 0) return false;
        const pass = this._passes[idx];
        const meta = (pass as any)[PASS_META] as PassMeta | undefined;
        pass.destroy();
        // Only release pool entries if the pass actually completed
        // setup — a pass that's added then immediately removed before
        // any compile owns nothing yet.
        if (meta?.setupDone) {
            for (const n of pass.creates) this._releaseCreated(n);
        }
        this._passes.splice(idx, 1);
        this._byName.delete(name);
        this._dirty = true;
        return true;
    }

    /** Runtime kill switch. Disabled passes are treated as if they
     *  weren't in the graph: they don't participate in validation or
     *  topo sort, and they're skipped during execute. Disabling a
     *  producer whose output is read by another enabled pass will make
     *  the next `compile()` throw `UnresolvedResourceError`. Use this
     *  for temporary off switches you intend to flip back on; use
     *  {@link remove} for permanent removal. */
    public disablePass(name: string): this {
        const p = this._byName.get(name);
        if (!p) throw new Error(`RenderGraph.disablePass: pass '${name}' not found.`);
        if (p.enabled) {
            p.enabled = false;
            this._dirty = true;
        }
        return this;
    }

    public enablePass(name: string): this {
        const p = this._byName.get(name);
        if (!p) throw new Error(`RenderGraph.enablePass: pass '${name}' not found.`);
        if (!p.enabled) {
            p.enabled = true;
            this._dirty = true;
        }
        return this;
    }

    /** Look up a pass by name. */
    public getPass<T extends RenderGraphPass = RenderGraphPass>(name: string): T | null {
        return (this._byName.get(name) as T | undefined) ?? null;
    }

    /** Open a mutation batch. `compile()` short-circuits until the
     *  matching `endUpdate()` runs, so a sequence of `add` / `remove` /
     *  `replace` / `disablePass` / `enablePass` calls produces at most
     *  one validation + topo sort. Pairs are reentrant: nesting two
     *  `beginUpdate()` calls requires two `endUpdate()` calls to flush.
     *  Calling `execute()` mid-batch is allowed but will run against
     *  the last compiled order (i.e. ignores in-flight mutations);
     *  flush the batch before the next frame if you want the new
     *  structure to take effect. */
    public beginUpdate(): this {
        this._batchDepth++;
        return this;
    }

    /** Close a mutation batch opened with {@link beginUpdate}. When the
     *  outermost batch closes, `compile()` runs if any mutation
     *  happened inside. */
    public endUpdate(): this {
        if (this._batchDepth <= 0) {
            throw new Error('RenderGraph.endUpdate: no matching beginUpdate.');
        }
        this._batchDepth--;
        if (this._batchDepth === 0 && this._dirty) this.compile();
        return this;
    }

    /** Validate + topologically sort. Idempotent — short-circuits if
     *  no mutation since the last compile. Throws GraphCompileError
     *  subclasses on validation failure.
     *
     *  Disabled passes are filtered out before validation and topo sort
     *  — `disable === remove` from the validator's point of view. This
     *  means disabling a producer whose output is read by another
     *  enabled pass throws `UnresolvedResourceError` here, instead of
     *  silently leaving the consumer with stale/zero data at execute.
     *  Use `remove(name)` for permanent removal; use `disablePass(name)`
     *  + matching `disablePass` on every reader for a temporary off
     *  switch. */
    public compile(): void {
        if (this._batchDepth > 0) return;
        if (!this._dirty && this._compiled) return;
        // Run setup() for any pass that hasn't yet been processed. This
        // is the deferred-setup step that lets `add()` call order be
        // independent of resource-dependency order: forward references
        // throw a `_PendingSetupError` internally, the draft is rolled
        // back, and the pass is retried on a later round.
        this._runPendingSetups();
        const activePasses = this._passes.filter(p => p.enabled);
        const activeByName: Map<string, RenderGraphPass> = new Map();
        for (const p of activePasses) activeByName.set(p.name, p);
        const validator = new GraphValidator(activePasses);
        validator.validateSingleCreator();
        validator.validateResolvable();
        this._compiled = topoSort(activePasses, activeByName, this._insertedOrder.bind(this));

        // Transient pool: analyze lifetimes against the freshly-compiled
        // order, then ask the pools to assign physical wrappers (aliasing
        // when intervals don't overlap). The bindings re-register over
        // the placeholder getters installed at declare time.
        this._lifetimes = LifetimeAnalyzer.analyze(
            this._compiled,
            activeByName,
            this._transient,
            this._ctx.presentationSize as [number, number],
        );
        const texAssign = this._texturePool.assign(this._lifetimes);
        const bufAssign = this._bufferPool.assign(this._lifetimes);
        this._textureBindings = texAssign.bindings;
        this._bufferBindings = bufAssign.bindings;
        const legacyMap = RTResourceMap.forContext(this._ctx);
        for (const [name, rt] of texAssign.bindings) {
            // Persistent textures were registered as `() => tex` at
            // import time and don't appear in `texAssign.bindings`
            // (the pool filters persistent out). Transient ones get
            // their placeholder swapped for the resolved wrapper here.
            this._pool.register(name, () => rt, 'texture');
            // Back-compat: descriptors marked `publishToLegacyMap`
            // (typically dedicated mip-pyramids that historical
            // material code reads via RTResourceMap.getTexture)
            // get their pool wrapper published into the legacy map
            // under the logical name. Only valid for `aliasable:false`
            // resources — publishing an aliased wrapper would let
            // material readers cache a pointer that the pool later
            // hands to another logical resource.
            const decl = this._transient.get(name);
            const desc = decl?.desc as TextureDesc | undefined;
            if (desc?.publishToLegacyMap) {
                legacyMap.rtTextureMap.set(name, rt);
            }
        }
        for (const [name, buf] of bufAssign.bindings) {
            this._pool.register(name, () => buf, 'buffer');
        }
        // Build last-use lookup for storeOp='discard' derivation
        // (Phase 6). Persistent imports keep their default lastUseIdx
        // of N-1 and effectively never trigger discard — that's the
        // right behavior (external owners may cross-frame sample).
        this._lastUseByName.clear();
        for (const lt of this._lifetimes) {
            if (lt.persistent) continue;
            this._lastUseByName.set(lt.name, lt.lastUseIdx);
        }
        this._dirty = false;
        // if (import.meta.env.DEV) console.debug('[RenderGraph] compiled pass order:', this._compiled.join(' → '));
        if (this._lifetimes.length > 0) {
            const ts = this._texturePool.stats();
            // if (import.meta.env.DEV) console.debug(
            //     `[RenderGraph] transient: ${this._lifetimes.length} lifetimes ` +
            //     `(${texAssign.bindings.size} tex / ${bufAssign.bindings.size} buf bound), ` +
            //     `tex pool ${ts.slotCount} slots / ${(ts.currentBytes / 1024 / 1024).toFixed(2)} MB ` +
            //     `(peak ${(ts.peakBytes / 1024 / 1024).toFixed(2)} MB)`,
            // );
        }
    }

    /** Run one frame. Lazy-compiles on first call (or after a
     *  mutation). Disabled passes are skipped. In dev mode each
     *  execute is wrapped in a `device.pushErrorScope('validation')`
     *  so the offending pass name shows up next to any WebGPU error. */
    public execute(occlusion: OcclusionSystem, frameIndex: number): void {
        this.compile();
        const order = this._compiled!;
        const pool = this._pool;
        const view = this._view;
        const graph = this;
        // Reset per-frame first-writer flag on every registered RT so
        // the auto-derive rule reapplies each frame: the first pass
        // that opens this RT this frame gets clear-by-default; any
        // later pass gets load-by-default.
        for (const rt of this._renderTargets.values()) {
            rt._firstWriterFiredThisFrame = false;
        }
        const ctx: RenderGraphPassContext = {
            view,
            occlusion,
            graph,
            frameIndex,
            get<T>(name: string): T {
                return pool.get<T>(name);
            },
            getTexture(name: string | TextureHandle): RenderTexture {
                const n = resourceName(name);
                const kind = pool.kindOf(n);
                if (kind !== 'texture' && kind !== 'opaque') {
                    // 'opaque' covers legacy `b.write(name, getter)`
                    // texture resources whose kind was never typed —
                    // accept them so callers can migrate to
                    // ctx.getTexture without first re-declaring
                    // upstream producers.
                    throw new WrongResourceKindError('<ctx.getTexture>', n, 'texture', kind ?? 'unregistered');
                }
                return pool.get<RenderTexture>(n);
            },
            getBuffer(name: string | BufferHandle): GPUBufferBase {
                const n = resourceName(name);
                const kind = pool.kindOf(n);
                if (kind !== 'buffer' && kind !== 'opaque') {
                    throw new WrongResourceKindError('<ctx.getBuffer>', n, 'buffer', kind ?? 'unregistered');
                }
                return pool.get<GPUBufferBase>(n);
            },
            getRenderTarget(name: string): RenderGraphRenderTarget {
                const kind = pool.kindOf(name);
                if (kind !== 'rendertarget') {
                    throw new WrongResourceKindError('<ctx.getRenderTarget>', name, 'rendertarget', kind ?? 'unregistered');
                }
                return pool.get<RenderGraphRenderTarget>(name);
            },
            beginRenderPass(handle: RenderGraphRenderPass): GPURenderPassEncoder {
                return handle.begin(this);
            },
            endRenderPass(handle: RenderGraphRenderPass): void {
                handle.end(this);
            },
            beginComputePass(handle: RenderGraphComputePass): GPUComputePassEncoder {
                return handle.begin(this);
            },
            endComputePass(handle: RenderGraphComputePass): void {
                handle.end(this);
            },
        };
        const device = this._ctx.device;
        const devMode = this._ctx.engine?.setting.render.debug === true;
        if (devMode && device) device.pushErrorScope('validation');
        for (let i = 0; i < order.length; i++) {
            const name = order[i];
            const p = this._byName.get(name)!;
            if (!p.enabled) continue;
            // Track which compile-order index is in flight so
            // RenderGraphRenderTarget.beginPass can compare against
            // the per-resource last-use map to derive storeOp='discard'.
            this._currentPassIdx = i;
            p.execute(ctx);
        }
        this._currentPassIdx = -1;
        if (devMode && device) {
            void device.popErrorScope().then(err => {
                if (err) {
                    console.error(`[RenderGraph] validation error in frame ${frameIndex}: ${err.message}. ` +
                        `Passes ran: ${order.join(' → ')}.`);
                }
            }).catch(() => { /* device lost or scope empty */ });
        }
    }

    /** Graphviz DOT representation of the compiled graph. Stable
     *  iteration order so snapshot tests can diff against a fixture.
     *  Edges go from the LAST writer of each resource to each reader;
     *  multiple mutators of the same resource appear as a chain.
     *  Explicit `dependencies` edges are rendered as dotted lines. */
    public dumpDot(): string {
        this.compile();
        const lines: string[] = ['digraph RenderGraph {'];
        lines.push('  rankdir=LR;');
        lines.push('  node [shape=box, style=rounded];');

        for (const name of this._compiled!) {
            lines.push(`  "${name}";`);
        }

        // Build sorted writer chains per resource.
        const writers = this._buildSortedWriters();
        // Edges:
        //   - chain edges between consecutive writers (same name, dashed)
        //   - last-writer → reader (solid, labeled by resource name)
        for (const [name, ws] of writers) {
            for (let i = 1; i < ws.length; i++) {
                const prev = ws[i - 1];
                const curr = ws[i];
                if (prev !== curr) lines.push(`  "${prev}" -> "${curr}" [style=dashed, label="mutate(${name})"];`);
            }
        }
        for (const reader of this._compiled!) {
            const p = this._byName.get(reader)!;
            for (const r of p.reads) {
                const ws = writers.get(r);
                if (!ws || ws.length === 0) continue;
                const last = ws[ws.length - 1];
                if (last !== reader) lines.push(`  "${last}" -> "${reader}" [label="${r}"];`);
            }
            if (p.dependencies) {
                for (const dep of p.dependencies) {
                    if (!this._byName.has(dep)) continue;
                    lines.push(`  "${dep}" -> "${reader}" [style=dotted, label="dependsOn"];`);
                }
            }
        }
        lines.push('}');
        return lines.join('\n');
    }

    /** Tear down all passes, the resource pool, and the device-lost
     *  listener. Called from RendererJob.destroy on engine dispose. */
    public destroy(): void {
        if (typeof this._ctx.removeEventListener === 'function') {
            this._ctx.removeEventListener(Context3D.DEVICE_LOST, this._onDeviceLost, this);
            this._ctx.removeEventListener(CResizeEvent.RESIZE, this._onCanvasResize, this);
        }
        for (const p of this._passes) p.destroy();
        for (const rt of this._renderTargets.values()) rt.destroy(this._ctx);
        this._renderTargets.clear();
        this._passes.length = 0;
        this._byName.clear();
        this._compiled = null;
        this._dirty = true;
        this._pool.dispose();
        this._transient.dispose();
        this._texturePool.dispose();
        this._bufferPool.dispose();
        this._textureBindings.clear();
        this._bufferBindings.clear();
    }

    /**
     * Snapshot of the transient pools' current allocations + HWM stats.
     * Use this to monitor whether lifetime-aliasing is actually saving
     * memory after migrating a pass to `b.declareTexture`. The numbers
     * are rough estimates (4 bpp fallback for unknown formats) — useful
     * for ratio comparisons, not absolute accounting.
     */
    public transientStats(): {
        texture: { currentBytes: number; peakBytes: number; bucketCount: number; slotCount: number };
        buffer: { currentBytes: number; peakBytes: number; bucketCount: number; slotCount: number };
        lifetimes: number;
    } {
        return {
            texture: this._texturePool.stats(),
            buffer: this._bufferPool.stats(),
            lifetimes: this._lifetimes.length,
        };
    }

    /**
     * @internal Test/debug accessor for the transient registry.
     */
    public get transientRegistry(): TransientResourceRegistry {
        return this._transient;
    }

    /**
     * Phase 6 storeOp='discard' helper. Returns `true` when the named
     * transient resource's last-use compile-order index equals the pass
     * currently in `execute()` — meaning a render pass writing to it
     * right now can drop the store (no later pass will read the
     * attachment, so the store is wasted bandwidth on tile-based GPUs).
     *
     * Returns `false` for any non-transient resource (no lifetime info)
     * or when called outside of `execute()`. The safe default
     * (return false → keep storeOp='store') means missing lifetime
     * info never accidentally discards live data — discards only fire
     * when the analyzer has definitively scoped a resource and the
     * pass position matches the last-use boundary.
     *
     * @internal
     */
    public isLastUseInCurrentPass(name: string): boolean {
        if (this._currentPassIdx < 0) return false;
        const lastIdx = this._lastUseByName.get(name);
        return lastIdx !== undefined && lastIdx === this._currentPassIdx;
    }

    /**
     * Back-compat helper for `desc.publishToLegacyMap` resources that
     * need to be readable through `RTResourceMap.getTexture(name)` BEFORE
     * the first {@link compile} runs (e.g. transmission materials whose
     * constructors look up `_SceneColorPyramid` during scene setup).
     *
     * Allocates the dedicated pool slot eagerly (the wrapper identity
     * is stable because `aliasable:false` resources always go through
     * the per-name dedicated path), registers it in the graph pool,
     * and publishes the wrapper into the legacy map. The next compile
     * re-runs through {@link TransientTexturePool.assign} and returns
     * the same wrapper from `_dedicatedByName`, then re-publishes
     * (idempotent set).
     *
     * @internal
     */
    private _eagerAllocateAndPublish(name: string, desc: TextureDesc): void {
        const [pw, ph] = this._ctx.presentationSize as [number, number];
        const w = typeof desc.width === 'number' ? desc.width
            : desc.width === 'screen' ? pw
            : desc.width === 'screen/2' ? Math.max(1, Math.floor(pw / 2))
            : desc.width === 'screen/4' ? Math.max(1, Math.floor(pw / 4))
            : desc.width === 'screen/8' ? Math.max(1, Math.floor(pw / 8))
            : pw;
        const h = typeof desc.height === 'number' ? desc.height
            : desc.height === 'screen' ? ph
            : desc.height === 'screen/2' ? Math.max(1, Math.floor(ph / 2))
            : desc.height === 'screen/4' ? Math.max(1, Math.floor(ph / 4))
            : desc.height === 'screen/8' ? Math.max(1, Math.floor(ph / 8))
            : ph;
        const usage = typeof desc.usage === 'number' ? desc.usage
            : (GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
               | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST);
        // Synthesize a minimal ResourceLifetime so the pool's
        // _allocateSlot can take its normal dedicated path. The
        // first/last idx are placeholders; the pool ignores them on
        // dedicated allocation.
        const lt: ResourceLifetime = {
            name, kind: 'texture', desc,
            firstUseIdx: 0, lastUseIdx: 0,
            resolvedUsage: usage,
            resolvedWidth: w, resolvedHeight: h,
            persistent: false,
        };
        const single = this._texturePool.assign([lt]);
        const rt = single.bindings.get(name);
        if (!rt) {
            // Defensive: should be unreachable because pool always
            // allocates dedicated slots for aliasable:false.
            return;
        }
        this._pool.register(name, () => rt, 'texture');
        const legacyMap = RTResourceMap.forContext(this._ctx);
        legacyMap.rtTextureMap.set(name, rt);
    }

    /**
     * Push a freshly-constructed pass into the queue. Stamps insertion
     * order and an empty per-pass meta so `_insertedOrder` returns a
     * stable value even before the pass's setup runs. The actual
     * `pass.setup(builder)` is deferred to the next `compile()` via
     * {@link _runPendingSetups}.
     *
     * Duplicate pass names are tolerated here — the validator surfaces
     * `'duplicate pass name'` at compile time so the error path lines
     * up with every other compile-time check.
     */
    private _registerPending(pass: RenderGraphPass): void {
        (pass as any).reads = Object.freeze([]);
        (pass as any).writes = Object.freeze([]);
        (pass as any).creates = Object.freeze([]);
        (pass as any)[PASS_META] = {
            insertedOrder: this._insertCounter++,
            setupDone: false,
        } satisfies PassMeta;
        this._passes.push(pass);
        this._byName.set(pass.name, pass);
        this._dirty = true;
    }

    /**
     * Run `setup()` for every pass added but not yet committed. The
     * loop iterates rounds in insertion order; a pass whose setup
     * throws {@link _PendingSetupError} (forward-referenced resource
     * or dependsOn target) is deferred to a later round. A round
     * that makes zero progress proves the missing names are genuinely
     * unresolvable — re-surface the first culprit as
     * {@link UnresolvedResourceError} for an actionable message.
     */
    private _runPendingSetups(): void {
        const all = this._passes.filter(p => !((p as any)[PASS_META] as PassMeta).setupDone);
        if (all.length === 0) return;

        let remaining = all.slice();
        let lastError: { pass: RenderGraphPass; error: _PendingSetupError } | null = null;
        // Safety bound: each round must commit at least one pass to make
        // progress, so worst-case rounds = passes. Use 2N+2 as a slack
        // margin in case of internal logic bugs.
        const maxRounds = all.length * 2 + 2;
        let round = 0;
        while (remaining.length > 0) {
            if (++round > maxRounds) {
                throw new Error(
                    `RenderGraph.compile: pending setups did not converge after ${round} rounds. ` +
                    `Remaining: ${remaining.map(p => p.name).join(', ')}.`,
                );
            }
            const stillPending: RenderGraphPass[] = [];
            let progress = false;
            for (const pass of remaining) {
                let draft: _SetupDraft;
                try {
                    draft = this._runSetupTransactional(pass);
                } catch (e) {
                    if (e instanceof _PendingSetupError) {
                        stillPending.push(pass);
                        lastError = { pass, error: e };
                        continue;
                    }
                    throw e;
                }
                this._commitDraft(pass, draft);
                ((pass as any)[PASS_META] as PassMeta).setupDone = true;
                progress = true;
            }
            if (!progress) {
                // Genuinely unresolvable — re-surface as the standard
                // compile-time error so users see consistent messaging.
                const { pass, error } = lastError!;
                throw new UnresolvedResourceError(pass.name, error.resourceName);
            }
            remaining = stillPending;
        }
    }

    /**
     * Single transactional attempt of `pass.setup(builder)`. Builder
     * mutations accumulate into a fresh {@link _SetupDraft} instead of
     * directly mutating `_pool` / `_renderTargets` / `_transient`. The
     * caller commits the draft via {@link _commitDraft} when setup
     * returns without throwing; on `_PendingSetupError` the draft is
     * dropped and the pass is retried after a sibling commit publishes
     * the missing name.
     *
     * The builder's visibility checks consult both the committed graph
     * state AND the in-flight draft so self-references within a single
     * setup (e.g. `b.declareTexture` followed by `b.write(handle)`) are
     * resolved against names declared earlier in the same call.
     */
    private _runSetupTransactional(pass: RenderGraphPass): _SetupDraft {
        const draft = new _SetupDraft(pass.dependencies);
        const ctx = this._ctx;

        const hasName = (n: string): boolean =>
            this._pool.has(n) || draft.poolEntries.has(n);
        const kindOfName = (n: string): ResourceKind | null => {
            const e = draft.poolEntries.get(n);
            if (e) return e.kind;
            return this._pool.kindOf(n);
        };
        const getRT = (n: string): RenderGraphRenderTarget | null => {
            const r = draft.rtEntries.get(n);
            if (r) return r;
            if (this._pool.kindOf(n) === 'rendertarget') {
                return this._pool.get<RenderGraphRenderTarget>(n);
            }
            return null;
        };
        const isTransientDeclared = (n: string): boolean =>
            this._transient.has(n) || draft.transientKinds.has(n);
        const transientKindOf = (n: string): 'texture' | 'buffer' | undefined => {
            const k = draft.transientKinds.get(n);
            if (k) return k;
            return this._transient.get(n)?.kind;
        };

        const placeholderGetter = (name: string) => () => {
            throw new Error(
                `RenderGraph: transient resource '${name}' has not been materialized yet — ` +
                `it can only be resolved via ctx.getTexture/getBuffer(name) inside execute(), ` +
                `not via pool.get during setup.`,
            );
        };

        const recordHintIfTransient = (name: string, mode: 'read' | 'write', access?: AccessHint): void => {
            const kind = transientKindOf(name);
            if (!kind) return;
            // Default hints reflect the typical mode:
            //   read → 'sample', write → 'storage'. Attachment writes
            //   route through b.useRenderTarget which folds in the
            //   RENDER_ATTACHMENT bit elsewhere.
            const hint: AccessHint = access ?? (mode === 'read' ? 'sample' : 'storage');
            draft.hintOps.push(() => this._transient.recordAccessHint(name, kind, hint, mode));
        };

        const registerRT = (n: string, rt: RenderGraphRenderTarget): RenderGraphRenderTarget => {
            draft.poolEntries.set(n, { getter: () => rt, kind: 'rendertarget', persistent: false });
            draft.rtEntries.set(n, rt);
            draft.writes.push(n);
            draft.creates.push(n);
            draft.rtWriterPushes.push({ rt, passName: pass.name });
            return rt;
        };

        const builder: RenderGraphBuilder = {
            context3D: ctx,
            view: this._view,
            graph: this,
            read: ((target: string | TextureHandle | BufferHandle, access?: AccessHint) => {
                const n = resourceName(target);
                if (!hasName(n)) throw new _PendingSetupError(n);
                draft.reads.push(n);
                recordHintIfTransient(n, 'read', access);
            }) as RenderGraphBuilder['read'],
            write: (<T>(target: string | TextureHandle | BufferHandle, getterOrAccess?: (() => T) | AccessHint): T | void => {
                // Disambiguate the three overloads:
                //   write(name, getter)      — legacy creator
                //   write(handle, access?)   — new mutator + hint
                //   write(name, access?)     — string mutator + hint
                if (typeof getterOrAccess === 'function') {
                    const n = resourceName(target);
                    const getter = getterOrAccess as () => T;
                    draft.writes.push(n);
                    draft.creates.push(n);
                    draft.poolEntries.set(n, {
                        getter: getter as () => unknown,
                        kind: 'opaque',
                        persistent: false,
                    });
                    return getter();
                }
                const n = resourceName(target);
                if (!hasName(n)) throw new _PendingSetupError(n);
                draft.writes.push(n);
                recordHintIfTransient(n, 'write', getterOrAccess as AccessHint | undefined);
                return undefined;
            }) as RenderGraphBuilder['write'],
            readWrite: (target: TextureHandle | BufferHandle, access?: AccessHint): void => {
                const n = resourceName(target);
                if (!hasName(n)) throw new _PendingSetupError(n);
                draft.reads.push(n);
                draft.writes.push(n);
                recordHintIfTransient(n, 'read', access);
                recordHintIfTransient(n, 'write', access);
            },
            declareTexture: (n: string, desc: TextureDesc): TextureHandle => {
                if (isTransientDeclared(n)) {
                    throw new Error(
                        `RenderGraph.transient: resource '${n}' already declared — ` +
                        `pass '${pass.name}' must use a different name.`,
                    );
                }
                draft.transientKinds.set(n, 'texture');
                draft.transientOps.push(() => this._transient.declareTexture(n, desc, pass.name));
                draft.creates.push(n);
                draft.poolEntries.set(n, { getter: placeholderGetter(n), kind: 'texture', persistent: false });
                // publishToLegacyMap back-compat: materials that read
                // RTResourceMap.getTexture(name) during initScene need
                // the dedicated wrapper allocated before the first
                // execute() runs. Queued into draft.eagerPublishes so
                // commit runs it AFTER the pool placeholder registration
                // (the eager-allocate overwrites the placeholder with
                // the real wrapper). aliasable:false guarantees the
                // wrapper identity is stable across compiles.
                if (desc.publishToLegacyMap && desc.aliasable === false) {
                    draft.eagerPublishes.push({ name: n, desc });
                }
                return makeTextureHandle(n);
            },
            declareBuffer: (n: string, desc: BufferDesc): BufferHandle => {
                if (isTransientDeclared(n)) {
                    throw new Error(
                        `RenderGraph.transient: resource '${n}' already declared — ` +
                        `pass '${pass.name}' must use a different name.`,
                    );
                }
                draft.transientKinds.set(n, 'buffer');
                draft.transientOps.push(() => this._transient.declareBuffer(n, desc, pass.name));
                draft.poolEntries.set(n, { getter: placeholderGetter(n), kind: 'buffer', persistent: false });
                draft.creates.push(n);
                return makeBufferHandle(n);
            },
            importExternalTexture: (n: string, tex: RenderTexture): TextureHandle => {
                if (isTransientDeclared(n)) {
                    throw new Error(
                        `RenderGraph.transient: resource '${n}' already declared — ` +
                        `pass '${pass.name}' must use a different name.`,
                    );
                }
                draft.transientKinds.set(n, 'texture');
                draft.transientOps.push(() => this._transient.importExternalTexture(n, tex, pass.name));
                draft.poolEntries.set(n, { getter: () => tex, kind: 'texture', persistent: true });
                // Imports DO push writes — the import semantically is
                // "this pass produces the resource" so downstream
                // b.read / b.write callers can find a writer when topo
                // sort walks the resource flow.
                draft.writes.push(n);
                draft.creates.push(n);
                return makeTextureHandle(n);
            },
            importExternalBuffer: (n: string, buf: GPUBufferBase): BufferHandle => {
                if (isTransientDeclared(n)) {
                    throw new Error(
                        `RenderGraph.transient: resource '${n}' already declared — ` +
                        `pass '${pass.name}' must use a different name.`,
                    );
                }
                draft.transientKinds.set(n, 'buffer');
                draft.transientOps.push(() => this._transient.importExternalBuffer(n, buf, pass.name));
                draft.poolEntries.set(n, { getter: () => buf, kind: 'buffer', persistent: true });
                draft.writes.push(n);
                draft.creates.push(n);
                return makeBufferHandle(n);
            },
            dependsOn: (passName: string) => {
                // `_byName` is populated at add() time, never during
                // setup commits, so there's no benefit to deferring
                // this check through the multi-round loop — a missing
                // target is genuinely missing. Throw a plain Error
                // with an actionable message.
                if (!this._byName.has(passName)) {
                    throw new Error(
                        `RenderGraph: pass '${pass.name}' calls b.dependsOn('${passName}') but no pass named '${passName}' is registered. ` +
                        `Add the upstream pass to the graph before calling compile().`,
                    );
                }
                draft.deps.add(passName);
            },
            dependsOnIfPresent: (passName: string) => {
                if (this._byName.has(passName)) draft.deps.add(passName);
            },
            createRenderTarget: (n: string, desc: RenderGraphRenderTargetDesc): RenderGraphRenderTarget => {
                return registerRT(n, RenderGraphRenderTarget.allocate(n, ctx, desc));
            },
            adoptRenderTarget: (n: string, rtFrame: RTFrame, opts?: { label?: string }): RenderGraphRenderTarget => {
                return registerRT(n, RenderGraphRenderTarget.fromRTFrame(n, rtFrame, opts));
            },
            useRenderTarget: (n: string): RenderGraphRenderTarget => {
                if (!hasName(n)) throw new _PendingSetupError(n);
                const kind = kindOfName(n);
                if (kind !== 'rendertarget') {
                    throw new WrongResourceKindError(pass.name, n, 'rendertarget', kind ?? 'unregistered');
                }
                const rt = getRT(n)!;
                draft.writes.push(n);
                draft.rtWriterPushes.push({ rt, passName: pass.name });
                return rt;
            },
            borrowRenderTarget: (n: string): RenderGraphRenderTarget => {
                // Same as useRenderTarget but skips the writes.push(n).
                // ColorPass and chained-opaque subclasses use this so
                // they don't pollute the MAIN_COLOR_RT mutator chain.
                if (!hasName(n)) throw new _PendingSetupError(n);
                const kind = kindOfName(n);
                if (kind !== 'rendertarget') {
                    throw new WrongResourceKindError(pass.name, n, 'rendertarget', kind ?? 'unregistered');
                }
                const rt = getRT(n)!;
                draft.rtWriterPushes.push({ rt, passName: pass.name });
                return rt;
            },
            createRenderPass: (
                name: string,
                target: RenderGraphRenderTarget,
                desc: RenderPipelineDesc,
                openOptions?: BeginPassOptions,
            ): RenderGraphRenderPass => {
                return new RenderGraphRenderPass(name, target, desc, openOptions);
            },
            createComputePass: (name: string, desc: ComputePipelineDesc): RenderGraphComputePass => {
                return new RenderGraphComputePass(name, desc);
            },
        };
        pass.setup(builder);
        return draft;
    }

    /**
     * Apply a successful draft to real graph state. Pool registrations
     * land first so subsequent passes' setup can resolve names through
     * `_pool.has`. Transient declarations + access hints + writer-push
     * tooling and the publishToLegacyMap eager allocations run after.
     * The pass's frozen `reads` / `writes` / `creates` arrays and
     * `dependencies` set are finalized last.
     */
    private _commitDraft(pass: RenderGraphPass, draft: _SetupDraft): void {
        for (const [name, e] of draft.poolEntries) {
            this._pool.register(name, e.getter, e.kind);
            if (e.persistent) this._pool.markPersistent(name);
        }
        for (const [name, rt] of draft.rtEntries) {
            this._renderTargets.set(name, rt);
        }
        for (const op of draft.transientOps) op();
        for (const e of draft.rtWriterPushes) {
            e.rt._writers.push(e.passName);
        }
        for (const op of draft.hintOps) op();
        // Eager-publish runs LAST so its `_pool.register` call overwrites
        // the placeholder getter installed during the declareTexture step.
        for (const e of draft.eagerPublishes) {
            this._eagerAllocateAndPublish(e.name, e.desc);
        }
        (pass as any).reads = Object.freeze(draft.reads.slice());
        (pass as any).writes = Object.freeze(draft.writes.slice());
        (pass as any).creates = Object.freeze(draft.creates.slice());
        if (draft.deps.size > 0) {
            pass.dependencies = draft.deps;
        }
    }

    private _insertedOrder(p: RenderGraphPass): number {
        return ((p as any)[PASS_META] as PassMeta | undefined)?.insertedOrder ?? -1;
    }

    /** Drop a name from the pool. If the entry is a typed
     *  {@link RenderGraphRenderTarget} also call its `destroy` hook
     *  and remove it from the per-frame reset map. Transient
     *  declarations are unregistered from the registry so the
     *  single-creator check stays clean for any subsequent re-add. */
    private _releaseCreated(name: string): void {
        if (this._pool.kindOf(name) === 'rendertarget') {
            const rt = this._renderTargets.get(name);
            if (rt) {
                rt.destroy(this._ctx);
                this._renderTargets.delete(name);
            }
        }
        this._pool.unregister(name);
        this._transient.unregister(name);
        this._textureBindings.delete(name);
        this._bufferBindings.delete(name);
    }

    /** name → writers sorted by insertion order. Used by `dumpDot`
     *  to render the writer chain for each resource. */
    private _buildSortedWriters(): Map<string, string[]> {
        const writers = new Map<string, string[]>();
        for (const p of this._passes) {
            for (const w of p.writes) {
                if (!writers.has(w)) writers.set(w, []);
                writers.get(w)!.push(p.name);
            }
        }
        for (const [, list] of writers) {
            list.sort((a, b) => this._insertedOrder(this._byName.get(a)!) - this._insertedOrder(this._byName.get(b)!));
        }
        return writers;
    }
}
