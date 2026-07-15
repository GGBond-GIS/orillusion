import { Engine3D } from "../../Engine3D";
import { Camera3D } from "../../core/Camera3D";
import { Object3D } from "../../core/entities/Object3D";
import { PointerEvent3D } from "../../event/eventConst/PointerEvent3D";
import { Vector3 } from "../../math/Vector3";
import { ComponentBase } from "../ComponentBase";

/**
 * @internal
 * @group CameraController 
 */
export class FirstPersonCameraController extends ComponentBase {
    public focus: Object3D;

    public distance: number = 5;

    private _camera: Camera3D;

    constructor() {
        super();
    }

    private _input(): any {
        const view = this.transform?.view3D;
        const owner = (view as any)?.engine3D;
        return owner?.inputSystem;
    }

    public start() {
        this._camera = this.object3D.getOrAddComponent(Camera3D);
        if (!this._camera) {
            console.error('FirstPersonCameraController need camera');
            return;
        }

        if (!this.focus) {
            console.error('FirstPersonCameraController need target');
            return;
        }
        const input = this._input();
        if (!input) return;
        input.addEventListener(PointerEvent3D.POINTER_WHEEL, this.mouseWheel, this);
        input.addEventListener(PointerEvent3D.POINTER_UP, this.mouseUp, this);
        input.addEventListener(PointerEvent3D.POINTER_DOWN, this.mouseDown, this);
    }

    private mouseDown(e: PointerEvent3D) {
        this._input()?.addEventListener(PointerEvent3D.POINTER_MOVE, this.mouseMove, this);
    }

    private mouseUp(e: PointerEvent3D) {
        this._input()?.removeEventListener(PointerEvent3D.POINTER_MOVE, this.mouseMove, this);
    }

    private mouseMove(e: PointerEvent3D) {
        // this.rotation.y += e.movementX * 0.01;
        // this.rotation.x += e.movementY * 0.01;
        let temp = this.transform.localRotation;
        temp.y += e.movementX * 0.01;
        temp.x += e.movementY * 0.01;
        this.transform.localRotation = temp;
    }

    private mouseWheel(e: PointerEvent3D) {
        this.distance += (this._input()?.wheelDelta ?? 0) * 0.1;
    }

    public onUpdate() {
        let vec = new Vector3();
        Vector3.multiplyScalar(this._camera.transform.forward, this.distance, vec);
        var focusPoint = this.focus.transform.worldPosition;
        // this._camera.transform.localPosition = focusPoint.sub(vec);
        this._camera.transform.localPosition = focusPoint;
    }

    public destroy(force?: boolean): void {
        const input = this._input();
        if (input) {
            input.removeEventListener(PointerEvent3D.POINTER_WHEEL, this.mouseWheel, this);
            input.removeEventListener(PointerEvent3D.POINTER_UP, this.mouseUp, this);
            input.removeEventListener(PointerEvent3D.POINTER_DOWN, this.mouseDown, this);
        }
        super.destroy(force);
    }
}
