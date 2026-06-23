import { Camera3D } from '../../../core/Camera3D';
import { View3D } from '../../../core/View3D';
import { PickFire } from '../../../io/PickFire';
import { ProfilerUtil } from '../../../util/ProfilerUtil';
import { GlobalBindGroup } from '../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { PostPass } from '../graph/passes/PostPass';
import { RenderGraph } from '../graph/RenderGraph';
import { OcclusionSystem } from '../occlusion/OcclusionSystem';
import { PostBase } from '../post/PostBase';

/**
 * The base render job for one View3D. Owns:
 *
 * - the per-view {@link RenderGraph} — *empty* by default; subclasses
 *   compose pass sets via `this.graph.add(...)`;
 *   - lifecycle (`start`/`stop`/`pause`/`resume`) and frame driving via
 *   `renderFrame()` (which invokes `graph.execute(...)`);
 * - the public `addPost`/`removePost` entry points used by
 *   `PostProcessingComponent`, which route into the graph's `PostPass`
 *   when one is registered.
 *
 * `RendererJob` itself does NOT register any passes — that's the job
 * of subclasses like {@link ForwardRendererJob}, or of user code
 * extending `RendererJob` directly. This keeps the base class
 * pipeline-agnostic so deferred / VR / custom flows can share it.
 *
 * @group GFX
 */
export class RendererJob {
    public readonly graph: RenderGraph;
    public occlusionSystem: OcclusionSystem;

    public pauseRender: boolean = false;
    public pickFire: PickFire;
    public renderState: boolean = false;
    protected _view: View3D;

    private _frameIndex: number = 0;

    constructor(view: View3D) {
        this._view = view;
        this.occlusionSystem = new OcclusionSystem(view);
        this.graph = new RenderGraph(view);
    }

    public get view(): View3D {
        return this._view;
    }
    public set view(view: View3D) {
        this._view = view;
    }

    public start(): void {
        this.renderState = true;
        if (this._view.engine3D.setting.render.debug) this.debug();
        // Eagerly compile the graph: setup is deferred to compile time
        // (so add() order can be arbitrary), but synchronous user code
        // that follows startRenderView — typically initScene + the
        // material constructors that look up RTResourceMap entries —
        // needs feature.reads/writes populated and publishToLegacyMap
        // wrappers installed in the legacy texture map before the
        // first frame. Compiling here matches the eager-publish
        // contract the legacy add-time setup used to satisfy.
        this.graph.compile();
    }

    public stop(): void { }
    public pause(): void { this.pauseRender = true; }
    public resume(): void { this.pauseRender = false; }
    public debug(): void { }

    /** Drive one frame through the graph. Pre-graph bookkeeping that
     *  sits outside any pass (camera, light / reflection entries,
     *  occlusion snapshot) runs inline; everything else is owned by
     *  passes registered into `this.graph`. */
    public renderFrame(): void {
        const view = this._view;
        Camera3D.mainCamera = view.camera;
        ProfilerUtil.startView(view);
        GlobalBindGroup.getLightEntries(view.scene).update(view);
        GlobalBindGroup.getReflectionEntries(view.scene).update(view);
        this.occlusionSystem.update(view.camera, view.scene);
        this.graph.execute(this.occlusionSystem, this._frameIndex++);
    }

    /** Attach a post-processing effect. Routes into the graph's
     *  PostPass; if no PostPass is in the graph (e.g. a custom job
     *  without a post chain), this is a no-op. */
    public addPost(post: PostBase): PostBase | PostBase[] {
        const postPass = this.graph.getPass<PostPass>('PostPass');
        postPass?.attachPost(this._view, post);
        return post;
    }

    public removePost(post: PostBase | PostBase[]): void {
        const postPass = this.graph.getPass<PostPass>('PostPass');
        if (!postPass) return;
        if (Array.isArray(post)) {
            for (const p of post) postPass.detachPost(this._view, p);
        } else {
            postPass.detachPost(this._view, post);
        }
    }

    public destroy(_force?: boolean): void {
        this.graph.destroy();
    }
}
