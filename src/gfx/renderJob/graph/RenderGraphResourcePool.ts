import { Context3D } from '../../graphics/webGpu/Context3D';

/**
 * Typed kind tag for pool entries. Lets the validator distinguish
 * "you're trying to open a render pass on a non-RT handle" from a
 * plain wrong-name lookup, and lets `dumpDot` color attachment edges
 * differently from sampled edges.
 *
 * - `opaque`: legacy / untyped handles (the historical default for
 *   `b.write(name, factory)` calls that don't go through one of the
 *   typed helpers).
 * - `texture` / `buffer`: typed plain resources.
 * - `rendertarget`: published by `b.createRenderTarget` /
 *   `b.adoptRenderTarget`; consumed by `b.useRenderTarget`.
 * - `renderpass` / `computepass`: reserved for future first-class
 *   pool entries (not currently registered — pass handles are
 *   owned by their host RenderGraphPass).
 *
 * @group Graph
 */
export type ResourceKind = 'opaque' | 'texture' | 'buffer' | 'rendertarget' | 'renderpass' | 'computepass';

/**
 * Thin name → getter registry with an optional kind sidecar.
 * Resources are owned by their creator pass (or by external
 * subsystems like `RTResourceMap` / `GBufferFrame`); this pool just
 * maps a string handle to a `() => T` lookup so other passes can
 * resolve dependencies via `ctx.get(name)` at execute time.
 *
 * Each `RenderGraph` owns one pool. Pass.setup populates it via
 * `RenderGraphBuilder.write(name, factory)` (the factory's return is
 * captured into a getter that always returns that same instance), or
 * via the typed builders (`b.createRenderTarget`, etc.) which also
 * stamp a kind.
 *
 * @group Graph
 */
export class RenderGraphResourcePool {
    private readonly _ctx: Context3D;
    private readonly _registry: Map<string, () => unknown> = new Map();
    private readonly _kinds: Map<string, ResourceKind> = new Map();
    /** Sidecar marking which resources are persistent (externally
     *  owned and never aliased / pool-allocated). Used by the
     *  transient subsystem to skip these during {@link LifetimeAnalyzer}
     *  + pool allocation, and by tooling to render imported handles
     *  distinctly. */
    private readonly _persistent: Set<string> = new Set();

    constructor(ctx: Context3D) {
        this._ctx = ctx;
    }

    public get context(): Context3D {
        return this._ctx;
    }

    /** Register a getter under `name`. Subsequent `get(name)` /
     *  `has(name)` calls resolve through this getter. Calling twice
     *  with the same name overwrites the previous getter — the
     *  graph's single-creator validator catches the production case;
     *  in tests this is convenient for swapping fakes.
     *  The optional `kind` defaults to `'opaque'` so existing
     *  call-sites that pre-date the typed builders keep working. */
    public register(name: string, getter: () => unknown, kind: ResourceKind = 'opaque'): void {
        this._registry.set(name, getter);
        this._kinds.set(name, kind);
    }

    /** Mark `name` as persistent — the transient pool will not allocate
     *  or alias a wrapper for it. The persistent flag is independent of
     *  the kind tag: any kind can be marked persistent. Calling on an
     *  unregistered name still records the flag (set on `register`). */
    public markPersistent(name: string): void {
        this._persistent.add(name);
    }

    public isPersistent(name: string): boolean {
        return this._persistent.has(name);
    }

    /** Drop the getter for `name`. Idempotent — silently no-ops if the
     *  name isn't registered. Called from `RenderGraph.remove()` and
     *  from `RenderGraph.replace()`'s pre-install cleanup so old
     *  getters don't outlive their owning pass. */
    public unregister(name: string): void {
        this._registry.delete(name);
        this._kinds.delete(name);
        this._persistent.delete(name);
    }

    /** Resolve a named resource. Throws if no getter is registered. */
    public get<T>(name: string): T {
        const getter = this._registry.get(name);
        if (!getter) {
            throw new Error(`RenderGraphResourcePool.get('${name}') — resource not registered. ` +
                `Has a pass declared b.write('${name}', factory) in its setup()?`);
        }
        return getter() as T;
    }

    public has(name: string): boolean {
        return this._registry.has(name);
    }

    /** Return the kind tag for `name`, or `null` if unregistered. */
    public kindOf(name: string): ResourceKind | null {
        return this._kinds.get(name) ?? null;
    }

    /** Drop all registrations. Called from `graph.destroy()` and on
     *  device-lost. The actual GPU resources are owned by the
     *  creator passes (or external maps), which manage their own
     *  destruction. */
    public dispose(): void {
        this._registry.clear();
        this._kinds.clear();
        this._persistent.clear();
    }
}
