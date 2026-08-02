import { ColliderComponent } from "../../components/ColliderComponent";
import { ComponentBase } from "../../components/ComponentBase";
import { MeshRenderer } from "../../components/renderer/MeshRenderer";
import { BoxColliderShape } from "../../components/shape/BoxColliderShape";
import { HitInfo } from "../../components/shape/ColliderShape";
import { View3D } from "../../core/View3D";
import { Object3D } from "../../core/entities/Object3D";
import { MouseCode } from "../../event/MouseCode";
import { PointerEvent3D } from "../../event/eventConst/PointerEvent3D";
import { GPUCompareFunction } from "../../gfx/graphics/webGpu/WebGPUConst";
import { UnLitMaterial } from "../../materials/UnLitMaterial";
import { Color } from "../../math/Color";
import { Matrix4 } from "../../math/Matrix4";
import { Vector3 } from "../../math/Vector3";
import { BoxGeometry } from "../../shape/BoxGeometry";
import { TransformAxisEnum } from "./TransformAxisEnum";
import { Object3DTransformTools } from "./Object3DTransformTools";
import { TransformSpaceMode } from "./TransformSpaceMode";

/**
 * Base component for the transform gizmo controllers (translation, rotation,
 * scale). Manages the per-axis handle objects, materials and colliders, and
 * drives the shared pick/drag interaction loop, delegating the actual
 * transform math to subclass overrides.
 * @group Util
 */
export class TransformControllerBaseComponent extends ComponentBase {
    protected mAxis: Object3D[];
    protected mAxisColor: Color[];
    protected mContainer: Object3D;
    protected mAxisMaterial: UnLitMaterial[];
    protected mAxisCollider: ColliderComponent[];


    constructor() {
        super();
        this._enable = false;
        this.mAxis = new Array<Object3D>(TransformAxisEnum.MAX);
        this.mAxisColor = new Array<Color>(TransformAxisEnum.MAX);
        this.mAxisMaterial = new Array<UnLitMaterial>(TransformAxisEnum.MAX);
        this.mAxisCollider = new Array<ColliderComponent>(TransformAxisEnum.MAX);


    }

    /** The object currently controlled by the owning gizmo. */
    public get target(): Object3D {
        return (this.object3D as Object3DTransformTools).target;
    }

    /** The gizmo's X-axis root object. */
    public get mX(): Object3D {
        return (this.object3D as Object3DTransformTools).mXObj;
    }

    /** The gizmo's Y-axis object. */
    public get mY(): Object3D {
        return (this.object3D as Object3DTransformTools).mYObj;
    }

    /** The gizmo's Z-axis object. */
    public get mZ(): Object3D {
        return (this.object3D as Object3DTransformTools).mZObj;
    }

    /** The active transform space (local or global) from the owning gizmo. */
    public get transformSpaceMode(): TransformSpaceMode {
        return (this.object3D as Object3DTransformTools).transformSpaceMode;
    }

    /** Build the per-axis handle objects, materials and colliders. */
    public init(param?: any): void {
        this.mContainer = new Object3D();

        let xAxisMaterial = new UnLitMaterial();
        xAxisMaterial.baseColor = new Color(1, 0, 0);
        xAxisMaterial.depthCompare = GPUCompareFunction.always;
        this.mAxisColor[TransformAxisEnum.X] = xAxisMaterial.baseColor;
        this.mAxisMaterial[TransformAxisEnum.X] = xAxisMaterial;

        let yAxisMaterial = new UnLitMaterial();
        yAxisMaterial.baseColor = new Color(0, 1, 0);
        yAxisMaterial.depthCompare = GPUCompareFunction.always;
        this.mAxisColor[TransformAxisEnum.Y] = yAxisMaterial.baseColor;
        this.mAxisMaterial[TransformAxisEnum.Y] = yAxisMaterial;

        let zAxisMaterial = new UnLitMaterial();
        zAxisMaterial.baseColor = new Color(0, 0, 1);
        zAxisMaterial.depthCompare = GPUCompareFunction.always;
        this.mAxisColor[TransformAxisEnum.Z] = zAxisMaterial.baseColor;
        this.mAxisMaterial[TransformAxisEnum.Z] = zAxisMaterial;

        let axisX = this.createCustomAxis(TransformAxisEnum.X);
        let axisY = this.createCustomAxis(TransformAxisEnum.Y);
        let axisZ = this.createCustomAxis(TransformAxisEnum.Z);

        this.mContainer.addChild(this.mAxis[TransformAxisEnum.X] = axisX);
        this.mContainer.addChild(this.mAxis[TransformAxisEnum.Y] = axisY);
        this.mContainer.addChild(this.mAxis[TransformAxisEnum.Z] = axisZ);

        this.mAxisCollider[TransformAxisEnum.X] = axisX.getComponent(ColliderComponent);
        this.mAxisCollider[TransformAxisEnum.Y] = axisY.getComponent(ColliderComponent);
        this.mAxisCollider[TransformAxisEnum.Z] = axisZ.getComponent(ColliderComponent);
    }

    /** Component lifecycle start hook. */
    public start(): void {
        // this.object3D.addChild(this.mContainer);
    }

    /** Attach the handle container and align the gizmo when enabled. */
    public onEnable(view?: View3D) {
        this.object3D.addChild(this.mContainer);
        this.reset();
    }

    /** Detach the handle container when disabled. */
    public onDisable(view?: View3D) {
        this.object3D.removeChild(this.mContainer);
    }

    /** Re-align the gizmo to the target according to the current transform space. */
    public reset() {
        // if (!this.target) {
        //     return;
        // }

        switch (this.transformSpaceMode) {
            case TransformSpaceMode.Local:
                {
                    let targetInvWorldMatrix = Matrix4.help_matrix_0.copy(this.mX.transform.worldMatrix);
                    // targetInvWorldMatrix.invert();

                    let resultTRS = targetInvWorldMatrix.decompose();

                    this.object3D.scaleX = 1.0;
                    this.object3D.scaleY = 1.0;
                    this.object3D.scaleZ = 1.0;
                    // console.warn(`scale(${resultTRS[2].x}, ${resultTRS[2].y}, ${resultTRS[2].z})`);

                    this.object3D.rotationX = resultTRS[1].x;
                    this.object3D.rotationY = resultTRS[1].y;
                    this.object3D.rotationZ = resultTRS[1].z;
                    // console.warn(`rotation(${resultTRS[1].x}, ${resultTRS[1].y}, ${resultTRS[1].z})`);

                    this.object3D.x = resultTRS[0].x;
                    this.object3D.y = resultTRS[0].y;
                    this.object3D.z = resultTRS[0].z;
                }
                break;
            case TransformSpaceMode.Global:
                {
                    this.object3D.scaleX = 1.0;
                    this.object3D.scaleY = 1.0;
                    this.object3D.scaleZ = 1.0;

                    this.object3D.rotationX = 0;
                    this.object3D.rotationY = 0;
                    this.object3D.rotationZ = 0;

                    const pos = this.mX.transform.worldPosition;;
                    this.object3D.x = pos.x;
                    this.object3D.y = pos.y;
                    this.object3D.z = pos.z;
                }
                break;
        }
    }

    protected _input(): any {
        const view = this.transform?.view3D;
        const owner = (view as any)?.engine3D;
        return owner?.inputSystem;
    }

    /** Ray-pick the axis handles under the pointer, returning the closest hit. */
    protected pickAxis(): { intersectPoint?: Vector3; distance: number; obj: Object3D; axis: TransformAxisEnum } {
        const scene3D = this.object3D.transform.scene3D;
        const camera = scene3D.view.camera;
        const input = this._input();
        let ray = camera.screenPointToRay(input.mouseX, input.mouseY);

        let intersect: HitInfo;
        let lastResult: { intersectPoint?: Vector3; distance: number; obj: Object3D; axis: TransformAxisEnum };

        for (let i = 0; i <= TransformAxisEnum.MAX; i++) {
            let collider = this.mAxisCollider[i];
            if (!collider) {
                continue;
            }
            intersect = collider.rayPick(ray);
            if (intersect) {
                if (!lastResult || lastResult.distance > intersect.distance || i == TransformAxisEnum.XYZ) {
                    lastResult = {
                        axis: i,
                        obj: collider.object3D,
                        distance: intersect.distance,
                        intersectPoint: intersect.intersectPoint,
                    }

                    if (i == TransformAxisEnum.XYZ) {
                        break;
                    }
                }
            }
        }
        return lastResult;
    }

    protected currentAxis = TransformAxisEnum.NONE;
    protected beginPoint: Vector3 = new Vector3();
    protected beginMousePos: Vector3 = new Vector3();
    protected currentPoint: Vector3 = new Vector3();
    /** Begin a drag: pick an axis and record the start point. */
    public onMouseDown(e: PointerEvent3D): void {
        if (e.mouseCode != MouseCode.MOUSE_LEFT) {
            return;
        }
        let result = this.pickAxis();
        if (!result) {
            return;
        }
        this.currentAxis = result.axis;
        e.stopImmediatePropagation();

        const scene3D = this.object3D.transform.scene3D;
        const camera = scene3D.view.camera;
        let screenPoint = camera.worldToScreenPoint(this.mX.transform.worldPosition);
        const input = this._input();
        let pos = camera.screenPointToWorld(input.mouseX, input.mouseY, screenPoint.z);
        this.beginPoint.copy(pos);
        this.beginMousePos.x = input.mouseX;
        this.beginMousePos.y = input.mouseY;
    }

    protected lastMoveObj: Object3D;
    protected lastMoveAxis: TransformAxisEnum;
    /** Highlight handles on hover, or apply the transform while dragging. */
    public onMouseMove(e: PointerEvent3D): void {
        if (this.currentAxis == TransformAxisEnum.NONE) {
            let mat = this.lastMoveObj.getComponent(MeshRenderer).material;
            if (this.lastMoveObj && "baseColor" in mat) {
                mat.baseColor = this.mAxisColor[this.lastMoveAxis];
                this.lastMoveObj = null;
                if (this.lastMoveAxis == TransformAxisEnum.XYZ) {
                    this.mAxis[TransformAxisEnum.X].getComponent(MeshRenderer).material.setUniformColor("baseColor", this.mAxisColor[TransformAxisEnum.X]);
                    this.mAxis[TransformAxisEnum.Y].getComponent(MeshRenderer).material.setUniformColor("baseColor", this.mAxisColor[TransformAxisEnum.Y]);
                    this.mAxis[TransformAxisEnum.Z].getComponent(MeshRenderer).material.setUniformColor("baseColor", this.mAxisColor[TransformAxisEnum.Z]);
                }
                this.lastMoveAxis = TransformAxisEnum.NONE;
            }
            let result = this.pickAxis();
            if (!result) {
                return;
            }

            mat.setUniformColor("baseColor", new Color(1, 1, 1));
            this.lastMoveObj = result.obj;
            this.lastMoveAxis = result.axis;
            if (this.lastMoveAxis == TransformAxisEnum.XYZ) {
                this.mAxis[TransformAxisEnum.X].getComponent(MeshRenderer).material.setUniformColor("baseColor", new Color(1, 1, 1));
                this.mAxis[TransformAxisEnum.Y].getComponent(MeshRenderer).material.setUniformColor("baseColor", new Color(1, 1, 1));
                this.mAxis[TransformAxisEnum.Z].getComponent(MeshRenderer).material.setUniformColor("baseColor", new Color(1, 1, 1));
            }
        } else {
            const scene3D = this.object3D.transform.scene3D;
            const camera = scene3D.view.camera;
            let screenPoint = camera.worldToScreenPoint(this.mX.transform.worldPosition);
            const input = this._input();
            let pos = camera.screenPointToWorld(input.mouseX, input.mouseY, screenPoint.z);

            this.currentPoint.copy(pos);
            let offset = pos.sub(this.beginPoint);

            Vector3.HELP_0.set(input.mouseX, input.mouseY, 0);
            let distance = Vector3.distance(Vector3.HELP_0, this.beginMousePos);
            this.beginMousePos.copy(Vector3.HELP_0);

            switch (this.transformSpaceMode) {
                case TransformSpaceMode.Local:
                    this.applyLocalTransform(this.currentAxis, offset, distance);
                    break;
                case TransformSpaceMode.Global:
                    this.applyGlobalTransform(this.currentAxis, offset, distance);
                    break;
            }

            this.beginPoint.copy(pos);

            this.reset();
        }
    }

    /** End a drag and clear the active axis. */
    public onMouseUp(e: PointerEvent3D): void {
        if (e.mouseCode != MouseCode.MOUSE_LEFT) {
            return;
        }
        this.currentAxis = TransformAxisEnum.NONE;
        this.reset();
    }

    /** Keep the gizmo at a constant screen size and pinned to the target each frame. */
    public onUpdate(view?: View3D) {
        let distance = Vector3.distance(view.camera.transform.worldPosition, this.object3D.transform.worldPosition);
        let scale = distance / 100.0;
        this.mContainer.scaleX = this.mContainer.scaleY = this.mContainer.scaleZ = scale;
        if (this.mX) {
            const pos = this.mX.transform.worldPosition;;
            this.object3D.x = pos.x;
            this.object3D.y = pos.y;
            this.object3D.z = pos.z;
        }
    }

    /** Apply the transform in local space for the active axis. Overridden by subclasses. */
    protected applyLocalTransform(currentAxis: TransformAxisEnum, offset: Vector3, distance: number) {
        console.warn("not imp");
    }

    /** Apply the transform in world space for the active axis. Overridden by subclasses. */
    protected applyGlobalTransform(currentAxis: TransformAxisEnum, offset: Vector3, distance: number) {
        console.warn("not imp");
    }

    /** Build the visual handle for one axis. Overridden by subclasses to add caps/arrows. */
    protected createCustomAxis(axis: TransformAxisEnum): Object3D {
        let axisObj = this.createAxis(axis);

        // let arrowsObj = this.createArrows(axis);
        // axisObj.addChild(arrowsObj);

        return axisObj;
    }

    /** Create the base axis shaft mesh and its box collider. */
    protected createAxis(axis: TransformAxisEnum): Object3D {
        let r = 0, g = 0, b = 0;

        switch (axis) {
            case TransformAxisEnum.X:
                r = 1;
                break;
            case TransformAxisEnum.Y:
                g = 1;
                break;
            case TransformAxisEnum.Z:
                b = 1;
                break;
        }

        let w = 0.4 + r * 20;
        let h = 0.4 + g * 20;
        let d = 0.4 + b * 20;

        let obj = new Object3D();
        obj.x = w * 0.5;
        obj.y = h * 0.5;
        obj.z = d * 0.5;

        let mr = obj.addComponent(MeshRenderer);
        mr.geometry = new BoxGeometry(w, h, d);
        mr.material = this.mAxisMaterial[axis];

        let collider = obj.addComponent(ColliderComponent);
        let boxShape = new BoxColliderShape();
        boxShape.setFromCenterAndSize(new Vector3(0, 0, 0), new Vector3(w + 1, h + 1, d + 1));
        collider.shape = boxShape;
        return obj;
    }
}