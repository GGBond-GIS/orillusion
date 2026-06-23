import { Context3D } from '../../graphics/webGpu/Context3D';
import { View3D } from '../../../core/View3D';
import { CEventDispatcher } from '../../../event/CEventDispatcher';
import { RenderNode } from '../../../components/renderer/RenderNode';
import { EntityCollect } from '../collect/EntityCollect';
import { VisibleLayer } from '../config/VisibleLayer';
import { OcclusionSystem } from '../occlusion/OcclusionSystem';
import { PassType } from '../passRenderer/state/PassType';
import { RenderGraph } from './RenderGraph';
import { Camera3D } from '../../../core/Camera3D';
import type { RTFrame } from '../frame/RTFrame';
import type { BeginPassOptions, RenderGraphRenderTarget, RenderGraphRenderTargetDesc } from './RenderGraphRenderTarget';
import type { RenderGraphRenderPass, RenderPipelineDesc } from './RenderGraphRenderPass';
import type { RenderGraphComputePass, ComputePipelineDesc } from './RenderGraphComputePass';
import type { RenderTexture } from '../../../textures/RenderTexture';
import type { GPUBufferBase } from '../../graphics/webGpu/core/buffer/GPUBufferBase';
import type { AccessHint, BufferDesc, TextureDesc } from './transient/ResourceDesc';
import type { BufferHandle, TextureHandle } from './transient/ResourceHandle';

/**
 * Setup-time builder handed to {@link RenderGraphPass.setup}. A pass
 * uses this to declare its graph-level dependencies (`read`) and
 * outputs (`write`). The builder also exposes the owning view's
 * Context3D and the graph itself so passes can look up earlier-added
 * sibling passes when a setup-time reference is required.
 *
 * Two modes for `write`:
 * - **Creator** — `write(name, factory)`. Calls the factory to allocate
 *   the resource, registers it in the graph pool under `name`, and
 *   records `name` in this pass's `creates` set. Single-creator rule:
 *   only one pass per name may pass a factory.
 * - **Mutator** — `write(name)`. Declares this pass mutates a resource
 *   created elsewhere. Multiple passes may declare write without a
 *   factory; their order is determined by insertion order. Downstream
 *   reads see the latest writer's state.
 *
 * @group Graph
 */
export interface RenderGraphBuilder {
    /** Pass-owning view's Context3D. */
    readonly context3D: Context3D;

    /** Pass-owning view. */
    readonly view: View3D;

    /** The graph this pass is being added to. Use
     *  `graph.getPass<T>(name)` to look up earlier-added sibling
     *  passes (later ones aren't in the graph yet during setup). */
    readonly graph: RenderGraph;

    /** Declare a read dependency on a named resource. The named
     *  handle must have a creator before this pass executes;
     *  validator enforces.
     *
     *  Pass a {@link TextureHandle} / {@link BufferHandle} returned by
     *  `b.declareTexture` / `b.declareBuffer` / `b.importExternalTexture`
     *  / `b.importExternalBuffer` to type-check the target and to
     *  contribute the optional `access` hint to the resource's final
     *  `GPUTextureUsage` / `GPUBufferUsage`. String form keeps working
     *  for legacy resources registered through `b.write(name, getter)`. */
    read(target: string | TextureHandle | BufferHandle, access?: AccessHint): void;

    /** Creator overload: declare a write to `name`, register `getter`
     *  in the pool. The `getter` is called every `pool.get(name)` —
     *  pass authors typically close over a local variable / instance
     *  field for stable identity (eager case), or implement internal
     *  caching that rebuilds on resize (lazy case). Returns
     *  `getter()` once for caller convenience. Single-creator rule
     *  applies.
     *
     *  This overload is the legacy path; new passes should prefer
     *  `b.declareTexture` / `b.declareBuffer` so the graph can manage
     *  lifecycle + aliasing instead of the pass owning a private
     *  RenderTexture. Phase 5 will deprecate this overload. */
    write<T>(name: string, getter: () => T): T;

    /** Mutator overload: declare this pass writes to an existing
     *  named resource (created by another pass). Multi-mutator OK;
     *  ordering is by insertion.
     *
     *  Handle form contributes an access hint to the resource's usage
     *  union; string form preserves legacy behavior. */
    write(target: string | TextureHandle | BufferHandle, access?: AccessHint): void;

    /** Combined read + write of an in-place mutated resource (e.g. a
     *  compute pass that samples and stores back to the same storage
     *  texture). Same as calling `b.read(target, access)` followed by
     *  `b.write(target, access)` — both arrays are populated and the
     *  hint is unioned into the resource's usage. */
    readWrite(target: TextureHandle | BufferHandle, access?: AccessHint): void;

    /**
     * Declare a transient texture this pass owns. The graph allocates
     * the underlying {@link RenderTexture} after compile from a pooled
     * physical slot (possibly aliased with another resource whose
     * lifetime ends before this one starts). The pass fetches the
     * actual texture from `ctx.getTexture(name)` inside `execute()`.
     *
     * Single-creator rule applies — declaring the same name twice
     * throws. `declareTexture` registers the pass as the resource's
     * creator (single-creator rule) but does NOT auto-record a read or
     * write access — pass authors must follow up with one of:
     *   - `b.write(handle, hint)` / `b.read(handle, hint)`, or
     *   - `b.readWrite(handle, hint)`
     * to declare how the pass actually uses the resource. Hints
     * (`'sample' | 'storage' | 'attachment' | 'copy'`) drive the final
     * `GPUTextureUsage` union when `desc.usage === 'auto'` (default).
     * A `declareTexture` with no follow-up access is treated as an
     * orphan declaration and skipped by the pool with a warning.
     */
    declareTexture(name: string, desc: TextureDesc): TextureHandle;

    /**
     * Declare a transient buffer this pass owns. Symmetric with
     * {@link declareTexture}: registers the creator only, the actual
     * access pattern must be declared via `b.read/write/readWrite`.
     * The pool reuses buffer wrappers by `(rounded-pow2 size, usage)`
     * bucket and grows them via `GPUBufferBase.resizeBuffer` when needed.
     */
    declareBuffer(name: string, desc: BufferDesc): BufferHandle;

    /**
     * Publish an externally-owned {@link RenderTexture} under `name`
     * as a persistent (non-aliasable, non-pool-allocated) resource.
     * Use for textures whose lifecycle is managed outside the graph
     * (e.g. {@link RTResourceMap}-cached resources, history textures
     * for TAA). Returns a {@link TextureHandle} so callers can use the
     * handle-typed `read` / `write` overloads.
     */
    importExternalTexture(name: string, tex: RenderTexture): TextureHandle;

    /**
     * Publish an externally-owned {@link GPUBufferBase} as a persistent
     * resource. Symmetric with {@link importExternalTexture}.
     */
    importExternalBuffer(name: string, buf: GPUBufferBase): BufferHandle;

    /** Declare an explicit ordering dependency on another pass by
     *  name, independent of any read/write resource edge. Use this
     *  when the upstream pass produces side effects the downstream
     *  pass consumes through a non-graph channel (e.g. GPU indirect
     *  buffers consumed via GlobalBindGroup, or off-screen RTs
     *  consumed by sibling materials). The named pass must already
     *  be registered in the graph before this call.
     *
     *  Beyond the topology edge, this also positions the dependent
     *  in the compiled schedule: the pass pops from the ready queue
     *  immediately after its latest explicit dep, ahead of unrelated
     *  passes that happen to have lower insertion order. In other
     *  words `b.dependsOn(X)` reads as "schedule me with X", not
     *  merely "after X somewhere" — a custom pass added late via
     *  `renderJob.graph.add(...)` that depends on a built-in pass
     *  will compile next to that built-in rather than at the tail
     *  of the pipeline. */
    dependsOn(passName: string): void;

    /** Optional-dependency variant of {@link dependsOn}: if a pass
     *  named `passName` is already registered, add an ordering edge
     *  `<passName> → this`; otherwise silently skip. Use when this
     *  pass only needs to run *after* another pass when it happens
     *  to be present, without reading or writing any of its outputs
     *  — and is fine running on its own when the upstream pass is
     *  absent from the pipeline. When the edge is added it carries
     *  the same scheduling-shift behavior as {@link dependsOn}. */
    dependsOnIfPresent(passName: string): void;

    /**
     * Allocate a fresh typed {@link RenderGraphRenderTarget} (colors +
     * optional depth) and register it under `name`. Single-creator
     * rule applies — only one pass per `name` may call this. Internally
     * runs through `b.write(name, factory)` so the standard mutator
     * chain still orders downstream `b.useRenderTarget` writers.
     */
    createRenderTarget(name: string, desc: RenderGraphRenderTargetDesc): RenderGraphRenderTarget;

    /**
     * Adopt an externally-allocated {@link RTFrame} (e.g.
     * {@link GBufferFrame}) and publish it as a typed RT under `name`.
     * The wrapper does not own the underlying textures. Single-creator
     * rule applies.
     */
    adoptRenderTarget(
        name: string,
        rtFrame: RTFrame,
        opts?: { label?: string },
    ): RenderGraphRenderTarget;

    /**
     * Declare "this pass also writes to the RT named `name`" and return
     * the {@link RenderGraphRenderTarget} for use in `execute()`.
     * Internally a mutator-form `b.write(name)` — multiple passes may
     * chain on the same RT.
     *
     * The pass opens the encoder per-frame via
     * `target.beginPass(ctx, opts)`; load-ops default to the auto-derive
     * rule (first writer ⇒ 'clear', subsequent ⇒ 'load') unless `opts`
     * overrides them. Pipeline-owning passes can wrap the target in a
     * {@link RenderGraphRenderPass} via {@link createRenderPass}.
     */
    useRenderTarget(name: string): RenderGraphRenderTarget;

    /**
     * Like {@link useRenderTarget} but does NOT register a mutator-write
     * edge on the RT.
     *
     * Use when ordering is controlled by insertion order (or explicit
     * `dependsOn`) rather than graph-derived mutator edges — the
     * canonical case is {@link ColorPass} and its subclasses in a
     * chained-opaque setup (e.g. Globe → ClearDepth → World). Declaring
     * a mutator-write there would chain every ColorPass instance into
     * the transmission/transparent mutator chain by insertedOrder,
     * which combined with an explicit `dependsOn` from the transparent
     * passes onto the second opaque pass produces a
     * {@link CyclicDependencyError} at compile.
     *
     * The framework's per-frame auto-derive rule still applies (the
     * underlying first-writer flag is set by every `target.beginPass()`
     * call, mutator or borrowed).
     */
    borrowRenderTarget(name: string): RenderGraphRenderTarget;

    /**
     * Build a private render-pass handle around a single owned
     * {@link GPURenderPipeline} that draws into `target`. The handle
     * lazily compiles the pipeline on first `begin()` and reuses it
     * across frames. Symmetric with {@link createComputePass}.
     *
     * Storage / attachment dependencies on `target` itself are declared
     * separately through `b.useRenderTarget` / `b.borrowRenderTarget`
     * (or `b.adoptRenderTarget` / `b.createRenderTarget` if this pass
     * also creates the target). This call does NOT register anything in
     * the pool.
     */
    createRenderPass(
        name: string,
        target: RenderGraphRenderTarget,
        desc: RenderPipelineDesc,
        openOptions?: BeginPassOptions,
    ): RenderGraphRenderPass;

    /**
     * Build a private compute-pass handle (pipeline + lifecycle owned
     * by the caller). Does NOT register anything in the pool —
     * storage texture / buffer dependencies still flow through
     * `b.read` / `b.write`.
     */
    createComputePass(name: string, desc: ComputePipelineDesc): RenderGraphComputePass;
}

/**
 * Runtime context handed to {@link RenderGraphPass.execute} once per
 * frame. `get<T>(name)` resolves a named handle through the graph
 * pool; `graph` is exposed so passes can look up sibling passes for
 * RPC-style calls (e.g. transparent passes calling into ColorPass's
 * public render methods).
 *
 * @group Graph
 */
export interface RenderGraphPassContext {
    readonly view: View3D;
    readonly occlusion: OcclusionSystem;
    readonly graph: RenderGraph;
    readonly frameIndex: number;

    /** Resolve a named resource through the graph pool. */
    get<T>(name: string): T;

    /** Resolve a {@link RenderTexture} by name. Returns the pool-assigned
     *  physical wrapper for transient resources or the imported texture
     *  for resources registered via `b.importExternalTexture`. Throws if
     *  `name` is not a texture kind (validator should have caught the
     *  mismatch at compile; this is the defensive runtime check). */
    getTexture(name: string | TextureHandle): RenderTexture;

    /** Resolve a {@link GPUBufferBase} by name. Symmetric with
     *  {@link getTexture}. */
    getBuffer(name: string | BufferHandle): GPUBufferBase;

    /** Resolve a {@link RenderGraphRenderTarget} by name. Throws if
     *  the handle exists but is not a render target (validator should
     *  have caught it at compile, this is the defensive runtime
     *  check). */
    getRenderTarget(name: string): RenderGraphRenderTarget;

    /** Open the underlying `GPURenderPassEncoder` for a handle
     *  returned from `b.useRenderTarget(...)`. The encoder lifetime
     *  extends to the matching {@link endRenderPass}. */
    beginRenderPass(handle: RenderGraphRenderPass): GPURenderPassEncoder;

    /** Close the render pass encoder + submit the per-pass command
     *  buffer. Idempotent on already-ended handles. */
    endRenderPass(handle: RenderGraphRenderPass): void;

    /** Open the underlying `GPUComputePassEncoder` for a compute
     *  handle. Pipeline is lazily built on the first call. */
    beginComputePass(handle: RenderGraphComputePass): GPUComputePassEncoder;

    /** Close the compute pass encoder + submit the per-pass command
     *  buffer. */
    endComputePass(handle: RenderGraphComputePass): void;
}

/**
 * A single rendering capability in the graph. Subclasses declare
 * their identity via `name`, allocate GPU resources and declare
 * dependencies in `setup`, and submit GPU work in `execute`.
 *
 * `reads`, `writes`, and `creates` are populated by {@link RenderGraph.compile}
 * after `setup()` runs (setup is deferred from `add()` to the next
 * compile, so `add()` call order doesn't constrain resource-dependency
 * order). They start as frozen empty arrays at add() time and are
 * replaced with the recorded `b.read` / `b.write` names on commit.
 *
 * @group Graph
 */
export abstract class RenderGraphPass extends CEventDispatcher {
    /** Unique pass identifier. Used as the graph-node key and in
     *  error messages — prefer PascalCase ending in `Pass`
     *  (e.g. `ShadowPass`, `ColorPass`). */
    public abstract readonly name: string;

    /** Material-side pass types consumed. Optional; defaults to none
     *  for pure compute / copy passes. */
    public readonly materialPasses: readonly PassType[] = [];

    /** Runtime kill switch. `graph.disablePass(name)` flips this. A
     *  disabled pass is treated as if it weren't in the graph: it's
     *  filtered out before validation + topo sort, and skipped during
     *  execute. Disabling a producer whose output is read by another
     *  enabled pass makes the next `compile()` throw
     *  `UnresolvedResourceError`. */
    public enabled: boolean = true;

    /** Which scene layers this pass consumes, as a bitmask. Default
     *  {@link VisibleLayer.All} reproduces the legacy "draw every
     *  collected node" behaviour. Custom passes (or custom
     *  {@link RendererJob}s wiring built-in passes) override this to
     *  restrict the pass to specific composition layers — combined
     *  with the active camera's `cullingMask` at execute time via
     *  bitwise AND, then matched against each node's `visibleLayer`:
     *
     *      (node.visibleLayer & pass.layerMask & camera.cullingMask) !== 0
     *
     *  Use {@link collectLayered} from inside `execute()` to fetch the
     *  filtered opaque/transparent lists; it threads `layerMask` and
     *  the camera mask through {@link EntityCollect.getLayerLists}. */
    public layerMask: number = VisibleLayer.All;

    /** Names this pass reads. Populated on the first
     *  `RenderGraph.compile()` that processes this pass, from the
     *  `b.read(...)` calls inside its `setup()`. Empty frozen array
     *  before compile. */
    public readonly reads!: readonly string[];

    /** Names this pass writes (creator + mutator combined). Populated
     *  on the first `RenderGraph.compile()` from the `b.write(...)`
     *  calls inside `setup()`. Empty frozen array before compile. */
    public readonly writes!: readonly string[];

    /** Subset of `writes` for which this pass was the creator (called
     *  `b.write(name, factory)`, not `b.write(name)`). The validator's
     *  single-creator rule operates on this set. */
    public readonly creates!: readonly string[];

    /** Explicit ordering dependencies on other pass names, set either
     *  from `setup()` via `b.dependsOn(name)` or by direct assignment
     *  before the next compile. Each entry adds a topo-sort edge
     *  `<name> → this`, independent of any resource edge. Use for
     *  side-effect dependencies the graph can't see (indirect buffers,
     *  off-screen RTs consumed via materials, etc.).
     *
     *  Beyond the edge, an entry here also positions this pass in the
     *  compiled schedule: the effective scheduling key collapses to
     *  "just after the latest dep", so a late-added pass with explicit
     *  dependencies runs next to its dep instead of trailing at the
     *  end of the queue. See {@link topoSort} for the full rule. */
    public dependencies?: ReadonlySet<string>;

    /** Allocate GPU resources, declare graph-level dependencies via
     *  `b.read` / `b.write`. Called from `RenderGraph.compile()` —
     *  setup is deferred from `add()` so `add()` call order doesn't
     *  constrain resource-dependency order. Forward references (reads
     *  to a resource a later-added pass creates) are resolved through
     *  a multi-round retry loop in `compile()`. */
    public setup(_b: RenderGraphBuilder): void {
        // No-op by default.
    }

    /** Execute the pass for one frame. Implementations build command
     *  encoders via `ctx.view.engine3D.context3D.gpuContext`, read
     *  inputs via `ctx.get('<name>')`, and submit GPU work. */
    public abstract execute(ctx: RenderGraphPassContext): void;

    /** Optional teardown hook called from `graph.destroy()` — release
     *  orphan Object3Ds / view quads / device resources that the pass
     *  owns directly. */
    public destroy(): void {
        // No-op by default.
    }

    /**
     * Helper for subclasses: fetch opaque + transparent lists filtered
     * by this pass's {@link layerMask} and a camera's `cullingMask`.
     * Replaces the legacy
     * `EntityCollect.instance.getRenderNodes(view.scene, camera)`
     * call inside `execute()` — passes that don't override
     * `layerMask` get identical results because the default
     * `VisibleLayer.All` mask is a no-op intersection.
     *
     * Shadow / reflection / GI-probe / scene-capture passes that
     * render through a non-main camera should pass that camera
     * explicitly so its own `cullingMask` (rather than the view's
     * main camera) participates in the bitwise AND.
     */
    protected collectLayered(
        view: View3D,
        camera?: Camera3D,
    ): { opaque: RenderNode[]; transparent: RenderNode[] } {
        const cam = camera ?? view.camera;
        const camMask = cam?.cullingMask ?? VisibleLayer.All;
        return EntityCollect.instance.getLayerLists(view.scene, cam, this.layerMask, camMask);
    }
}
