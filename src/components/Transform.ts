import { WasmMatrix } from "./matrix/WasmMatrix";
import { Scene3D } from "../core/Scene3D";
import { View3D } from "../core/View3D";
import { Object3D } from "../core/entities/Object3D";
import { CEvent } from "../event/CEvent";
import { ComponentCollect } from "../gfx/renderJob/collect/ComponentCollect";
import { MathUtil } from "../math/MathUtil";
import { Matrix4, append } from "../math/Matrix4";
import { Orientation3D } from "../math/Orientation3D";
import { Quaternion } from "../math/Quaternion";
import { Vector3 } from "../math/Vector3";
import { ComponentBase } from "./ComponentBase";
import { Entity } from "..";

/**
 * The Transform component contains the position, rotation, and scaling of an object in 3D space.
 * Each object (Object 3D) has a Transform component
 * @group Components
 */
export class Transform extends ComponentBase {


    /**
    * @internal
    */
    public static LIMIT: number = 1;
    /**
    * @internal
    */
    public static COMPONENT_NAME = 'UUTransform';
    /**
    * @internal
    */
    public static COMPONENT_TYPE = 'Transform';
    /**
    * @internal
    */
    public static POSITION_ONCHANGE: string = 'POSITION_ONCHANGE';

    /**
    * @internal
    */
    public static ROTATION_ONCHANGE: string = 'ROTATION_ONCHANGE';
    /**
    * @internal
    */
    public static SCALE_ONCHANGE: string = 'SCALE_ONCHANGE';
    /**
    * @internal
    */
    public static PARENT_ONCHANGE: string = 'PARENT_ONCHANGE';
    /**
    * @internal
    */
    public static CHILDREN_ONCHANGE: string = 'CHILDREN_ONCHANGE';
    /**
    * @internal
    */
    public static ADD_ONCHANGE: string = 'ADD_ONCHANGE';
    /**
     * @internal
     */
    public static LOCAL_ONCHANGE: string = 'LOCAL_ONCHANGE';

    /**
    * @internal
    */
    public eventPositionChange: CEvent = new CEvent(Transform.POSITION_ONCHANGE);
    /**
    * @internal
    */
    public eventRotationChange: CEvent = new CEvent(Transform.ROTATION_ONCHANGE);
    /**
    * @internal
    */
    public eventScaleChange: CEvent = new CEvent(Transform.SCALE_ONCHANGE);
    /**
    * @internal
    */
    public eventLocalChange: CEvent = new CEvent(Transform.LOCAL_ONCHANGE);
    /**
    * @internal
    */
    public onPositionChange: Function;
    /**
    * @internal
    */
    public onRotationChange: Function;
    /**
    * @internal
    */
    public onScaleChange: Function;

    private _scene3d: Scene3D;

    private _parent: Transform;

    private _localPos: Vector3;
    public _localRot: Vector3;
    private _localRotQuat: Quaternion;
    private _localScale: Vector3;


    private _localDetailPos: Vector3;
    private _localDetailRot: Vector3;
    private _localDetailScale: Vector3;


    index: number;
    index2: number;
    // public localMatrix: Matrix4;
    // private _localChange: boolean = true;


    private _forward: Vector3 = new Vector3();
    private _back: Vector3 = new Vector3();
    private _right: Vector3 = new Vector3();
    private _left: Vector3 = new Vector3();
    private _up: Vector3 = new Vector3();
    private _down: Vector3 = new Vector3();
    public readonly _worldMatrix: Matrix4;

    private _targetPos: Vector3;
    public static: boolean = false;
    public depthOrder: number = 0;

    /** Whether the local transform is dirty and the world matrix needs recomputing. */
    public get localChange(): boolean {
        return WasmMatrix.matrixStateBuffer[this.index2] != 0;
    }

    public set localChange(value: boolean) {
        // console.log(this.index2, value);
        WasmMatrix.matrixStateBuffer[this.index2] = value ? 1 : 0;
    }

    /** Optional look-at target position used by orientation helpers. */
    public get targetPos(): Vector3 {
        return this._targetPos;
    }
    public set targetPos(value: Vector3) {
        this._targetPos = value;
    }

    /** Parent transform in the hierarchy, or null for a root. */
    public get parent(): Transform {
        return this._parent;
    }

    public set parent(value: Transform) {
        //why don't it need to compare the data
        let lastParent = this._parent?.object3D;
        this._parent = value;
        this.depthOrder = value ? value.depthOrder + 1 : 0;
        WasmMatrix.setParent(this.index, value ? value.worldMatrix.index : -1, this.depthOrder);
        this.localChange = true;
        if (this.object3D) {
            let hasRoot = value ? value.scene3D : null;
            if (!hasRoot) {
                this.object3D.components.forEach((c) => {
                    c[`__stop`]();
                });
            } else {
                this._scene3d = hasRoot;
                this.object3D.components.forEach((c) => {
                    ComponentCollect.appendWaitStart(c);
                });
            }

            for (let child of this.object3D.entityChildren) {
                child.transform.parent = value ? this : null;
            }

            //notify parent change
            this.object3D.components.forEach((c) => {
                c.onParentChange?.(lastParent, this._parent?.object3D);
            });
        }
        this.notifyLocalChange();
    }

    /** Enable state; propagates to all child transforms. */
    public set enable(value: boolean) {
        if (this.transform._scene3d && value) {
            super.enable = true;
        } else {
            super.enable = false;
        }
        for (let child of this.object3D.entityChildren) {
            child.transform.enable = value;
        }
    }
    public get enable(): boolean {
        return this._enable;
    }

    /** The scene this transform belongs to. */
    public get scene3D(): Scene3D {
        return this._scene3d;
    }

    public set scene3D(value: Scene3D) {
        this._scene3d = value;
    }

    /** The view associated with this transform's scene, or null. */
    public get view3D(): View3D {
        if (this._scene3d && this._scene3d.view) {
            return this._scene3d.view;
        }
        return null;
    }

    constructor() {
        super();
        this._worldMatrix = new Matrix4(true);
        this.index = this._worldMatrix.index;
        this.index2 = this._worldMatrix.index * WasmMatrix.stateStruct;
        this._localPos = new Vector3();
        this._localRot = new Vector3();
        this._localRotQuat = new Quaternion();
        this._localScale = new Vector3(1, 1, 1);

        WasmMatrix.setScale(this.index, this._localScale.x, this._localScale.y, this._localScale.z);
        WasmMatrix.setRotation(this.index, this._localRotQuat.x, this._localRotQuat.y, this._localRotQuat.z, this._localRotQuat.w);
        WasmMatrix.setTranslate(this.index, this._localPos.x, this._localPos.y, this._localPos.z);
    }

    /** Lifecycle hook called once when the transform is created. */
    awake() { }

    /** Lifecycle hook called when the transform starts. */
    start() { }

    /** Lifecycle hook called when the transform stops. */
    stop() { }


    /**
    * @internal
    */
    public notifyLocalChange() {
        this.localChange = true;
        if (this.object3D) {
            let entityChildren = this.object3D.entityChildren;
            let i = 0, len = entityChildren.length;
            for (i = 0; i < len; i++) {
                const transform = entityChildren[i].transform;
                transform.notifyLocalChange();
            }
        }
        this.eventDispatcher.dispatchEvent(this.eventLocalChange);
    }

    /**
     * @internal
     * Push a rotation (given as both its Euler and quaternion form) into the
     * transform's local state and to the WASM matrix solver, which stores
     * rotation as a quaternion to avoid Euler gimbal lock. Does not invoke
     * `onRotationChange` or dispatch `eventRotationChange` — callers differ
     * in when/how they do that.
     */
    private _applyLocalRotation(euler: Vector3, quat: Quaternion) {
        this._localRot.copy(euler);
        this._localRotQuat.copy(quat);
        WasmMatrix.setRotation(this.index, quat.x, quat.y, quat.z, quat.w);
        this.notifyLocalChange();
    }

    /** World-space up direction; setting it rotates the object to face that up. */
    public get up(): Vector3 {
        Matrix4.transformVector(this.worldMatrix, Vector3.UP, this._up);
        return this._up;
    }

    public set up(value: Vector3) {
        this._up.copy(value);

        MathUtil.fromToRotation(Vector3.UP, this._up, Quaternion.HELP_0);
        this.transform.localRotQuat = Quaternion.HELP_0;
    }

    /** World-space down direction; setting it reorients the object. */
    public get down(): Vector3 {
        Matrix4.transformVector(this.worldMatrix, Vector3.DOWN, this._down);
        return this._down;
    }

    public set down(value: Vector3) {
        this._down.copy(value);

        MathUtil.fromToRotation(Vector3.DOWN, this._down, Quaternion.HELP_0);
        this.transform.localRotQuat = Quaternion.HELP_0;

        this.notifyLocalChange();
        this.onRotationChange?.();

        if (this.eventRotationChange) {
            this.eventDispatcher.dispatchEvent(this.eventRotationChange);
        }
    }

    /** World-space forward direction; setting it reorients the object. */
    public get forward(): Vector3 {
        Matrix4.transformVector(this.worldMatrix, Vector3.FORWARD, this._forward);
        return this._forward;
    }

    public set forward(value: Vector3) {
        this._forward.copy(value);

        MathUtil.fromToRotation(Vector3.FORWARD, this._forward, Quaternion.HELP_0);
        this.transform.localRotQuat = Quaternion.HELP_0;

        this.notifyLocalChange();
        this.onRotationChange?.();

        if (this.eventRotationChange) {
            this.eventDispatcher.dispatchEvent(this.eventRotationChange);
        }
    }

    /** World-space back direction; setting it reorients the object. */
    public get back(): Vector3 {
        Matrix4.transformVector(this.worldMatrix, Vector3.BACK, this._back);
        return this._back;
    }

    public set back(value: Vector3) {
        this._back.copy(value);

        MathUtil.fromToRotation(Vector3.BACK, this._back, Quaternion.HELP_0);
        this.transform.localRotQuat = Quaternion.HELP_0;
    }

    /** World-space left direction; setting it reorients the object. */
    public get left(): Vector3 {
        Matrix4.transformVector(this.worldMatrix, Vector3.neg_X_AXIS, this._left);
        return this._left;
    }

    public set left(value: Vector3) {
        this._left.copy(value);

        MathUtil.fromToRotation(Vector3.LEFT, this._left, Quaternion.HELP_0);
        this.transform.localRotQuat = Quaternion.HELP_0;
    }

    /** World-space right direction; setting it reorients the object. */
    public get right(): Vector3 {
        Matrix4.transformVector(this.worldMatrix, Vector3.X_AXIS, this._right);
        return this._right;
    }

    public set right(value: Vector3) {
        this._right.copy(value);

        MathUtil.fromToRotation(Vector3.RIGHT, this._right, Quaternion.HELP_0);
        this.transform.localRotQuat = Quaternion.HELP_0;

        this.notifyLocalChange();
        this.onRotationChange?.();

        if (this.eventRotationChange) {
            this.eventDispatcher.dispatchEvent(this.eventRotationChange);
        }
    }

    /**
     *
     * The transformation property of the object relative to the parent, stored in the from of a quaternion
     */
    public get localRotQuat(): Quaternion {
        if (this.localChange) {
            this.updateWorldMatrix();
        }
        return this._localRotQuat;
    }

    public set localRotQuat(value: Quaternion) {
        if (value.x != this._localRotQuat.x
            || value.y != this._localRotQuat.y
            || value.z != this._localRotQuat.z
            || value.w != this._localRotQuat.w) {
            value.getEulerAngles(Vector3.HELP_0);
            this._applyLocalRotation(Vector3.HELP_0, value);
            this.onRotationChange?.();

            if (this.eventRotationChange) {
                this.eventDispatcher.dispatchEvent(this.eventRotationChange);
            }
        }
    }

    /**
     * @private
     */
    public notifyChange(): void {
        this.notifyLocalChange();
        this.onRotationChange?.();
        this.onScaleChange?.();
        this.onPositionChange?.();

        if (this.eventRotationChange) {
            this.eventDispatcher.dispatchEvent(this.eventRotationChange);
        }
        if (this.eventPositionChange) {
            this.eventDispatcher.dispatchEvent(this.eventPositionChange);
        }
        if (this.eventScaleChange) {
            this.eventDispatcher.dispatchEvent(this.eventScaleChange);
        }
    }

    /**
    * @internal
    */
    public get worldMatrix(): Matrix4 {
        this.updateWorldMatrix();
        return this._worldMatrix;
    }

    /**
     *
     * Update the matrix4 in world space
     */
    public updateWorldMatrix(force: boolean = false) {
        if (this.localChange || force) {
            // Compose from the quaternion, not _localRot — getEulerAngles() has a
            // singularity (gimbal lock) whenever the decomposed pitch approaches
            // ±90°, which a pure yaw rotation of ±90°/270° hits exactly. Composing
            // from the quaternion sidesteps that entirely.
            this._worldMatrix.compose(this._localPos, this._localRotQuat, this._localScale);
            if (this.parent) {
                append(this._worldMatrix, this.parent.worldMatrix, this._worldMatrix);
            }
            this.localChange = false;
        }
    }

    /** Recursively update this transform and all descendants' world matrices. */
    public updateChildTransform() {
        let self = this;
        if (self.localChange) {
            self.updateWorldMatrix();
        }
        if (self.object3D.numChildren > 0) {
            let i = 0;
            // for (i = 0; i < self.object3D.numChildren; i++) {
            //     self.object3D.entityChildren[i].transform.updateChildTransform();
            // }
            for (const child of self.object3D.entityChildren) {
                child.transform.updateChildTransform();
            }
        }
    }

    /**
     * Rotate the object to look at a world-space target from its current position.
     * @param target world-space point to look at
     * @param up up direction
     */
    public lookTarget(target: Vector3, up: Vector3 = Vector3.UP) {
        this.lookAt(this.transform.worldPosition, target, up);
    }

    /**
     * Current object's gaze position (global) (modified by its own global transformation)
     * @param pos Own position (global)
     * @param target Location of the target (global)
     * @param up up direction
     */
    public lookAt(pos: Vector3, target: Vector3, up: Vector3 = Vector3.UP) {
        this._targetPos ||= new Vector3();

        this._targetPos.copy(target);

        this.localPosition = pos;

        Matrix4.helpMatrix.lookAt(pos, target, up);

        Matrix4.helpMatrix.invert();

        var prs: Vector3[] = Matrix4.helpMatrix.decompose(Orientation3D.QUATERNION);

        this.localRotQuat = Quaternion.CALCULATION_QUATERNION.copy(prs[1]);
    }

    /**
     * Set this transform's local position/rotation/scale by decomposing a matrix.
     * @param matrix the matrix to decompose
     * @param orientationStyle decomposition style (defaults to euler angles)
     */
    public decomposeFromMatrix(matrix: Matrix4, orientationStyle: string = 'eulerAngles'): this {
        let prs = matrix.decompose(orientationStyle);
        let transform = this.transform;
        transform.localRotQuat.copy(prs[1]);
        transform.localRotQuat = transform.localRotQuat;
        transform.localPosition.copy(prs[0]);
        transform.localPosition = transform.localPosition;
        transform.localScale.copy(prs[2]);
        transform.localScale = transform.localScale;
        return this;
    }

    /**
    *
    * Create a new component, copy the properties of the current component, and add it to the target object.
    * @param obj source Object3D
    */
    cloneTo(obj: Object3D) {
        obj.transform.localPosition = this.localPosition;
        obj.transform.localRotation = this.localRotation;
        obj.transform.localScale = this.localScale;
    }

    public set x(value: number) {
        if (this._localPos.x != value) {
            this._localPos.x = value;
            WasmMatrix.setTranslate(this.index, this._localPos.x, this._localPos.y, this._localPos.z);
            this.notifyLocalChange();
            this.onPositionChange?.();

            if (this.eventPositionChange) {
                this.eventDispatcher.dispatchEvent(this.eventPositionChange);
            }
        }
    }
    /**
     *
     * The position of the object relative to its parent X-axis
     */
    public get x(): number {
        return this._localPos.x;
    }

    public set y(value: number) {
        if (this._localPos.y != value) {
            this._localPos.y = value;
            WasmMatrix.setTranslate(this.index, this._localPos.x, this._localPos.y, this._localPos.z);
            this.notifyLocalChange();
            this.onPositionChange?.();

            if (this.eventPositionChange) {
                this.eventDispatcher.dispatchEvent(this.eventPositionChange);
            }
        }
    }
    /**
     *
     * The position of the object relative to its parent Y-axis
     */
    public get y(): number {
        return this._localPos.y;
    }

    public set z(value: number) {
        if (this._localPos.z != value) {
            this._localPos.z = value;
            WasmMatrix.setTranslate(this.index, this._localPos.x, this._localPos.y, this._localPos.z);
            this.notifyLocalChange();
            this.onPositionChange?.();

            if (this.eventPositionChange) {
                this.eventDispatcher.dispatchEvent(this.eventPositionChange);
            }
        }
    }
    /**
     *
     * The position of the object relative to its parent Y-axis
     */
    public get z(): number {
        return this._localPos.z;
    }

    public set scaleX(value: number) {
        if (this._localScale.x != value) {
            this._localScale.x = value;
            WasmMatrix.setScale(this.index, this._localScale.x, this._localScale.y, this._localScale.z);
            this.notifyLocalChange();
            this.onScaleChange?.();

            if (this.eventScaleChange) {
                this.eventDispatcher.dispatchEvent(this.eventScaleChange);
            }
        }
    }
    /**
     *
     * The scale of the object relative to its parent X-axis
     */
    public get scaleX(): number {
        return this._localScale.x;
    }

    public set scaleY(value: number) {
        if (this._localScale.y != value) {
            this._localScale.y = value;
            WasmMatrix.setScale(this.index, this._localScale.x, this._localScale.y, this._localScale.z);
            this.notifyLocalChange();
            this.onScaleChange?.();

            if (this.eventScaleChange) {
                this.eventDispatcher.dispatchEvent(this.eventScaleChange);
            }
        }
    }
    /**
     *
     * The scale of the object relative to its parent Y-axis
     */
    public get scaleY(): number {
        return this._localScale.y;
    }

    public set scaleZ(value: number) {
        if (this._localScale.z != value) {
            this._localScale.z = value;
            WasmMatrix.setScale(this.index, this._localScale.x, this._localScale.y, this._localScale.z);
            this.notifyLocalChange();
            this.onScaleChange?.();

            if (this.eventScaleChange) {
                this.eventDispatcher.dispatchEvent(this.eventScaleChange);
            }
        }
    }

    /**
     *
     * The scale of the object relative to its parent Z-axis
     */
    public get scaleZ(): number {
        return this._localScale.z;
    }

    public set rotationX(value: number) {
        if (this._localRot.x != value) {
            this._localRot.x = value;
            Quaternion.HELP_1.setFromEuler(this._localRot.x, this._localRot.y, this._localRot.z);
            this._applyLocalRotation(this._localRot, Quaternion.HELP_1);
            this.onRotationChange?.();

            if (this.eventRotationChange) {
                this.eventDispatcher.dispatchEvent(this.eventRotationChange);
            }
        }
    }
    /**
     *
     * The rotation of the object relative to its parent X-axis
     */
    public get rotationX(): number {
        return this._localRot.x;
    }

    public set rotationY(value: number) {
        if (this._localRot.y != value) {
            this._localRot.y = value;
            Quaternion.HELP_1.setFromEuler(this._localRot.x, this._localRot.y, this._localRot.z);
            this._applyLocalRotation(this._localRot, Quaternion.HELP_1);
            this.onRotationChange?.();

            if (this.eventRotationChange) {
                this.eventDispatcher.dispatchEvent(this.eventRotationChange);
            }
        }
    }
    /**
     *
     * The rotation of the object relative to its parent Y-axis
     */
    public get rotationY(): number {
        return this._localRot.y;
    }

    public set rotationZ(value: number) {
        if (this._localRot.z != value) {
            this._localRot.z = value;
            Quaternion.HELP_1.setFromEuler(this._localRot.x, this._localRot.y, this._localRot.z);
            this._applyLocalRotation(this._localRot, Quaternion.HELP_1);
            this.onRotationChange?.();

            if (this.eventRotationChange) {
                this.eventDispatcher.dispatchEvent(this.eventRotationChange);
            }
        }
    }
    /**
     *
     * The rotation of the object relative to its parent Z-axis
     */
    public get rotationZ(): number {
        return this._localRot.z;
    }
    /**
     *
     * world position
     */
    public get worldPosition(): Vector3 {
        if (this.localChange) {
            this.updateWorldMatrix();
        }
        return this._worldMatrix.position;
    }

    public set localPosition(v: Vector3) {
        if (this.onPositionChange) {
            if (this._localPos.x != v.x || this._localPos.y != v.y || this._localPos.z != v.z) {
                this.onPositionChange(this._localPos, v);
            }
        }
        this._localPos.copy(v);
        WasmMatrix.setTranslate(this.index, v.x, v.y, v.z);
        this.notifyLocalChange();



        if (this.eventPositionChange) {
            this.eventDispatcher.dispatchEvent(this.eventPositionChange);
        }
        // }
    }
    /**
     *
     * The position of an object relative to its parent
     */
    public get localPosition(): Vector3 {
        return this._localPos;
    }

    public set localRotation(v: Vector3) {
        if (this.onRotationChange) {
            if (this._localRot.x != v.x || this._localRot.y != v.y || this._localRot.z != v.z) {
                this.onRotationChange(this._localRot, v);
            }
        }

        // Keep _localRotQuat in sync — multiple downstream consumers
        // (CCDIK.composeWorldQuat, retargeter, look-at) read
        // localQuaternion to compose world rotations. Without this sync,
        // the quat field stays at its default (0,0,0,1) after Euler-only
        // setup like buildSkeletonPose, and quat-based world rotation
        // composition silently produces wrong results.
        Quaternion.HELP_1.setFromEuler(v.x, v.y, v.z);
        this._applyLocalRotation(v, Quaternion.HELP_1);

        if (this.eventRotationChange) {
            this.eventDispatcher.dispatchEvent(this.eventRotationChange);
        }
        // }
    }

    /**
     *
     * The rotaion vector of an object relative to its parent
     */
    public get localRotation(): Vector3 {
        return this._localRot;
    }

    public set localScale(v: Vector3) {
        // if (this._localScale.x != v.x || this._localScale.y != v.y || this._localScale.z != v.z) {
        WasmMatrix.setScale(this.index, v.x, v.y, v.z);
        this._localScale.copy(v);
        this.notifyLocalChange();
        this.onScaleChange?.();

        if (this.eventScaleChange) {
            this.eventDispatcher.dispatchEvent(this.eventScaleChange);
        }
        // }
    }

    /**
     *
     * The scale of an object relative to its parent
     */
    public get localScale(): Vector3 {
        return this._localScale;
    }


    /** Per-frame continuous scale delta auto-applied by the matrix solver. */
    public get localDetailScale(): Vector3 {
        return this._localDetailScale;
    }

    public set localDetailScale(value: Vector3) {
        this._localDetailScale = value;
        WasmMatrix.setContinueScale(this.index, value.x, value.y, value.z);
    }

    /** Per-frame continuous rotation delta auto-applied by the matrix solver. */
    public get localDetailRot(): Vector3 {
        return this._localDetailRot;
    }

    public set localDetailRot(value: Vector3) {
        this._localDetailRot = value;
        WasmMatrix.setContinueRotation(this.index, value.x, value.y, value.z);
    }

    /** Per-frame continuous translation delta auto-applied by the matrix solver. */
    public get localDetailPos(): Vector3 {
        return this._localDetailPos;
    }
    public set localDetailPos(value: Vector3) {
        this._localDetailPos = value;
        WasmMatrix.setContinueTranslate(this.index, value.x, value.y, value.z);
    }


    /** Detach from the parent before the component is destroyed. */
    public beforeDestroy(force?: boolean) {
        if (this.parent && this.parent.object3D) {
            this.parent.object3D.removeChild(this.object3D);
        }
        super.beforeDestroy(force);
    }

    /** Destroy the transform and free its matrix-table slot. */
    destroy(): void {
        super.destroy();

        // Return this transform's slot to the static Matrix4 table so the next
        // Transform() can reuse it. Without this, `Matrix4.useCount` grows forever.
        if (this._worldMatrix) Matrix4.freeIndex(this._worldMatrix);

        this.scene3D = null;
        this.eventPositionChange = null;
        this.eventRotationChange = null;
        this.eventScaleChange = null;
        this.onPositionChange = null;
        this.onRotationChange = null;
        this.onScaleChange = null;
        this._scene3d = null;
        this._parent = null;
        this._localPos = null;
        this._localRot = null;
        this._localRotQuat = null;
        this._localScale = null;
        this._forward = null;
        this._back = null;
        this._right = null;
        this._left = null;
        this._up = null;
        this._down = null;
        this.localChange = null;
        this._targetPos = null;
    }
}

