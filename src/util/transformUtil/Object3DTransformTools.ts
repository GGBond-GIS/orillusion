import { TransformControllerBaseComponent } from "./TransformControllerBaseComponent";
import { ScaleControlComponents } from "./ScaleControlComponents";
import { TransformMode } from "./TransformMode";
import { TransformSpaceMode } from "./TransformSpaceMode";
import { Object3D } from "../../core/entities/Object3D";
import { RotationControlComponents } from "./RotationControlComponents";
import { TranslationControlComponents } from "./TranslationControlComponents";
import { Scene3D } from "../../core/Scene3D";
import { KeyEvent } from "../../event/eventConst/KeyEvent";
import { PointerEvent3D } from "../../event/eventConst/PointerEvent3D";
import { Engine3D } from "../../Engine3D";
import { KeyCode } from "../../event/KeyCode";


/**
 * Object3D transform controller
 * @group Util
 */
export class Object3DTransformTools extends Object3D {
    private static _instance: Object3DTransformTools;
    /** Lazily-created shared instance of the transform tools. */
    public static get instance(): Object3DTransformTools {
        if (!this._instance) {
            this._instance = new Object3DTransformTools();
        }
        return this._instance;
    }

    protected mTarget: Object3D;
    protected mTransformMode = TransformMode.NONE;
    protected mTransformSpaceType = TransformSpaceMode.Global;
    protected mControllers: TransformControllerBaseComponent[];
    /** Root gizmo object aligned to the target on the X axis. */
    public mXObj: Object3D;
    /** Gizmo object nested under mXObj for the Y axis. */
    public mYObj: Object3D;
    /** Gizmo object nested under mYObj for the Z axis. */
    public mZObj: Object3D;
    constructor() {
        super();
        this.mControllers = [null, null, null];
        this.mControllers[TransformMode.Scale] = this.addComponent(ScaleControlComponents);
        this.mControllers[TransformMode.Rotation] = this.addComponent(RotationControlComponents);
        this.mControllers[TransformMode.Translation] = this.addComponent(TranslationControlComponents);
        this.mControllers[TransformMode.Scale].enable = false;
        this.mControllers[TransformMode.Rotation].enable = false;
        this.mControllers[TransformMode.Translation].enable = false;

        this.mXObj = new Object3D();
        this.mYObj = new Object3D();
        this.mZObj = new Object3D();

        this.mXObj.addChild(this.mYObj);
        this.mYObj.addChild(this.mZObj);
    }

    /** Current transform mode (translation/rotation/scale/none). */
    public get transformMode(): TransformMode {
        return this.mTransformMode;
    }

    /** Current transform space (local or global). */
    public get transformSpaceMode(): TransformSpaceMode {
        return this.mTransformSpaceType;
    }

    /** Attach the gizmo to a scene so it becomes visible and interactive. */
    public active(scene: Scene3D) {
        scene.addChild(this);
        scene.addChild(this.mXObj);
    }

    /** Detach the gizmo from a scene. */
    public unActive(scene: Scene3D) {
        scene.removeChild(this);
    }

    /** The object currently controlled by the gizmo. */
    public get target(): Object3D {
        return this.mTarget;
    }

    /**
     * Bind the gizmo to a target object and optionally set the transform/space mode.
     * @param obj target object, or null to detach
     * @param transformMode optional transform mode to switch to
     * @param spaceMode optional transform space to switch to
     */
    public selectObject(obj: Object3D, transformMode?: TransformMode, spaceMode?: TransformSpaceMode) {
        if (this.mTarget != obj) {
            if (obj) {
                // obj.addChild(this);
                this.activate();
            } else {
                // this.mTarget.removeChild(this);
                this.unactivate();
            }
            this.mTarget = obj;
            this.mXObj.localPosition = obj.transform.worldPosition.clone();
        }
        if (transformMode != undefined) {
            this.selectTransformMode(transformMode);
        }
        if (spaceMode != undefined) {
            this.selectTransformSpaceMode(spaceMode);
        }
    }

    /** Switch the active transform mode, toggling the matching controller. */
    public selectTransformMode(transformMode: TransformMode) {
        if (this.mTransformMode == transformMode)
            return;
        if (this.mTransformMode != TransformMode.NONE)
            this.mControllers[this.mTransformMode].enable = false;

        this.mTransformMode = transformMode;

        if (this.mTransformMode != TransformMode.NONE)
            this.mControllers[this.mTransformMode].enable = true;
    }

    /** Switch the active transform space, resetting the current controller. */
    public selectTransformSpaceMode(spaceMode: TransformSpaceMode) {
        if (this.mTransformSpaceType == spaceMode)
            return;
        this.mTransformSpaceType = spaceMode;

        if (this.mTransformMode != TransformMode.NONE)
            this.mControllers[this.mTransformMode].reset();
    }

    protected _input(): any {
        const view = this.transform?.view3D;
        const owner = (view as any)?.engine3D;
        return owner?.inputSystem;
    }

    protected activate() {
        const input = this._input();
        if (!input) return;
        input.addEventListener(KeyEvent.KEY_DOWN, this.onKeyDown, this);
        input.addEventListener(PointerEvent3D.POINTER_DOWN, this.onMouseDown, this, null, 99999);
        input.addEventListener(PointerEvent3D.POINTER_MOVE, this.onMouseMove, this, null, 99999);
        input.addEventListener(PointerEvent3D.POINTER_UP, this.onMouseUp, this, null, 99999);
    }

    protected unactivate() {
        const input = this._input();
        if (!input) return;
        input.removeEventListener(KeyEvent.KEY_DOWN, this.onKeyDown, this);
        input.removeEventListener(PointerEvent3D.POINTER_DOWN, this.onMouseDown, this);
        input.removeEventListener(PointerEvent3D.POINTER_MOVE, this.onMouseMove, this);
        input.removeEventListener(PointerEvent3D.POINTER_UP, this.onMouseUp, this);
    }

    protected onKeyDown(e: KeyEvent) {
        switch (e.keyCode) {
            case KeyCode.Key_R:
                this.selectTransformMode(TransformMode.Scale);
                this.selectTransformSpaceMode(TransformSpaceMode.Local);
                break;
            case KeyCode.Key_E:
                this.selectTransformMode(TransformMode.Rotation);
                this.selectTransformSpaceMode(TransformSpaceMode.Global);
                break;
            case KeyCode.Key_W:
                this.selectTransformMode(TransformMode.Translation);
                this.selectTransformSpaceMode(TransformSpaceMode.Global);
                break;
            case KeyCode.Key_A:
                this.selectTransformSpaceMode(TransformSpaceMode.Local);
                break;
            case KeyCode.Key_S:
                this.selectTransformSpaceMode(TransformSpaceMode.Global);
                break;
        }
    }

    protected onMouseDown(e: PointerEvent3D) {
        if (this.mTransformMode != TransformMode.NONE)
            this.mControllers[this.mTransformMode].onMouseDown(e);
    }

    protected onMouseMove(e: PointerEvent3D) {
        if (this.mTransformMode != TransformMode.NONE) {
            this.mControllers[this.mTransformMode].onMouseMove(e);
        }
    }

    protected onMouseUp(e: PointerEvent3D) {
        if (this.mTransformMode != TransformMode.NONE)
            this.mControllers[this.mTransformMode].onMouseUp(e);
    }
}






