import { Engine3D } from "..";
import { CEventListener } from "../event/CEventListener";
import { ShadowLightsCollect } from "../gfx/renderJob/collect/ShadowLightsCollect";
import { RenderGraph } from "../gfx/renderJob/graph/RenderGraph";
import { PickFire } from "../io/PickFire";
import { Vector4 } from "../math/Vector4";
import { Camera3D } from "./Camera3D";
import { Scene3D } from "./Scene3D";

/**
 * A render view that pairs a {@link Camera3D} with a {@link Scene3D} and a
 * viewport, and drives the rendering of that scene through the camera.
 * @group Core
 */
export class View3D extends CEventListener {
    private _camera: Camera3D;
    private _scene: Scene3D;
    private _viewPort: Vector4;
    private _enablePick: boolean = false;
    private _enable: boolean = true;
    public pickFire: PickFire;
    /**
     * Reference to the Engine3D instance that owns this view. Set by
     * `engine.startRenderView(view)`. Components that need per-instance state
     * (input system, context, etc.) read it via this back-pointer so
     * they work under multi-instance setups.
     */
    public engine3D: Engine3D;

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        super();
        this._viewPort = new Vector4(x, y, width, height);
    }

    public get enable(): boolean {
        return this._enable;
    }

    public set enable(value: boolean) {
        this._enable = value;
    }

    public get enablePick(): boolean {
        return this._enablePick;
    }

    public set enablePick(value: boolean) {
        if (this._enablePick != value) {
            this.pickFire = new PickFire(this);
            this.pickFire.start();
        }
        this._enablePick = value;
    }

    public get scene(): Scene3D {
        return this._scene;
    }

    public set scene(value: Scene3D) {
        this._scene = value;
        value.view = this;

        ShadowLightsCollect.createBuffer(this);
    }

    public get camera(): Camera3D {
        return this._camera;
    }

    public set camera(value: Camera3D) {
        this._camera = value;
    }

    public get viewPort(): Vector4 {
        return this._viewPort;
    }

    public set viewPort(value: Vector4) {
        this._viewPort = value;
    }

    /** Frame Graph bound to this view's engine. The view's render
     *  job owns it (constructed during `engine.startRenderView`).
     *  Returns null only when the engine has not yet started a
     *  render job for this view. */
    public get renderGraph(): RenderGraph | null {
        return this.engine3D?.getRenderJob(this)?.graph ?? null;
    }
}
