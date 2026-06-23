import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { BeginPassOptions, RenderGraphRenderTarget } from '../RenderGraphRenderTarget';
import { MAIN_COLOR_RT } from './GBufferResourcePass';

/**
 * Configuration for {@link ClearDepthPass}.
 *
 * - `name`: optional override so multiple ClearDepth nodes can coexist
 *   in one graph (each registered RenderGraphPass needs a unique name).
 *   Defaults to `'ClearDepthPass'`.
 * - `after`: optional upstream pass name to bind a `dependsOn` edge to.
 *   When omitted, callers are expected to set the ordering by other
 *   means (e.g. mutating `pass.dependencies` directly, or relying on
 *   insertion order if there's nothing else to disambiguate).
 * - `rtName`: which typed render target to clear depth on. Defaults to
 *   {@link MAIN_COLOR_RT} (the engine's main color GBuffer). Custom
 *   pipelines that adopt their own GBuffer through `b.adoptRenderTarget`
 *   can point this at that handle.
 */
export interface ClearDepthPassConfig {
    name?: string;
    after?: string;
    rtName?: string;
}

/**
 * Stand-alone "clear depth, preserve color" pass.
 *
 * Use case: an opaque pipeline that wants to clear depth *between*
 * two opaque draw groups — e.g. GIS rendering that draws the planet
 * surface + ground decals first, then clears depth so screen-space
 * 3D content (buildings, vehicles, markers) is composited on top
 * without being z-fought or occluded by the curved planet surface.
 *
 * Opens a render pass on the target {@link RenderGraphRenderTarget}
 * with every color attachment forced to `loadOp='load'` (preserving
 * prior color writes) and depth forced to `loadOp='clear'`. No draw
 * calls — the clear happens automatically when WebGPU enters the
 * pass.
 *
 * Cost: one extra render pass per frame. No fragment work, so the
 * GPU cost is just the begin/end overhead + the depth clear itself
 * (a fast-path on every modern GPU). The CPU cost is one extra
 * command-encoder begin/end.
 *
 * Ordering: this pass on its own only declares a `dependsOn` edge to
 * the configured upstream pass, plus its mutator-write on the target
 * RT. Downstream consumers that should observe the cleared depth
 * (e.g. a second `ColorPass` subclass) need to declare their own
 * `dependsOn('ClearDepthPass')`.
 *
 * @group Graph
 */
export class ClearDepthPass extends RenderGraphPass {
    public readonly name: string;

    protected readonly _config: ClearDepthPassConfig;
    protected _target!: RenderGraphRenderTarget;
    protected _openOpts!: BeginPassOptions;

    constructor(config: ClearDepthPassConfig = {}) {
        super();
        this._config = config;
        this.name = config.name ?? 'ClearDepthPass';
    }

    public setup(b: RenderGraphBuilder): void {
        const rtName = this._config.rtName ?? MAIN_COLOR_RT;

        // borrowRenderTarget (not useRenderTarget): ClearDepthPass sits
        // between two opaque halves whose order is fixed by the user's
        // explicit `dependsOn` edges (see the GISLayerComposition
        // sample). Joining MAIN_COLOR_RT's mutator chain would
        // duplicate / contradict those edges and surface as a
        // CyclicDependencyError when the late opaque also writes the
        // RT through a subsequent mutator.
        this._target = b.borrowRenderTarget(rtName);

        // Size the colorLoadOps array to the target's attachment count —
        // auto-derive would default to 'clear' if this pass happens to
        // be the first writer this frame, which is the opposite of what
        // we want (we ALWAYS preserve color and clear depth).
        const colorLoadOps: GPULoadOp[] = new Array(this._target.colorTextures.length).fill('load');
        this._openOpts = {
            label: 'ClearDepth',
            colorLoadOps,
            depthLoadOp: 'clear',
        };

        if (this._config.after) {
            b.dependsOn(this._config.after);
        }
    }

    public execute(ctx: RenderGraphPassContext): void {
        const opened = this._target.beginPass(ctx, this._openOpts);
        this._target.endPass(ctx, opened);
    }
}
