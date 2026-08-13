import { Camera3D } from '../core/Camera3D';
import { MouseCode } from '../event/MouseCode';
import { CEventDispatcher } from '../event/CEventDispatcher';
import { Ray } from '../math/Ray';
import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { PickCompute } from './picker/PickCompute';
import { Raycaster } from './Raycaster';
import { RaycastHit } from './RaycastHit';
import { ColliderComponent } from '../components/ColliderComponent';
import { View3D } from '../core/View3D';
import { Object3D } from '../core/entities/Object3D';
import { PointerEvent3D } from '../event/eventConst/PointerEvent3D';
import { HitInfo } from '../components/shape/ColliderShape';
import { ComponentCollect } from '..';

/**
 * Management and triggering for picking 3D objects
 * @group IO
 */
export class PickFire extends CEventDispatcher {
    /**
     * The ray used to pick 3D objects
     */
    public ray: Ray;

    /**
     * whether it's touching
     */
    public isTouching: boolean = false;
    private _mouseCode: MouseCode;

    private _pickEvent: PointerEvent3D;
    private _outEvent: PointerEvent3D;
    private _overEvent: PointerEvent3D;
    private _upEvent: PointerEvent3D;
    private _downEvent: PointerEvent3D;
    private _mouseMove: PointerEvent3D;
    private _pickCompute: PickCompute;
    private _raycaster: Raycaster;

    //Recently Objects, picked by mousedown
    private _lastDownTarget: Object3D;

    /**
     * a map records the association information between meshID(matrix id) and ColliderComponent
     */
    public mouseEnableMap: Map<number, ColliderComponent>;
    private _view: View3D;

    /**
     * full raycast results of the latest pick in `ray` mode,
     * consistent with three.js `Raycaster` Intersection
     */
    private _rayHits: RaycastHit[] = [];

    constructor(view: View3D) {
        super();
        this._view = view;
        this.init();
    }

    /**
     * Initialize the pickup initiator and call it internally during engine initialization
     */
    private init(): void {
        this.ray = new Ray();
        this._raycaster = new Raycaster();
        this.mouseEnableMap = new Map<number, ColliderComponent>();

        this._pickEvent = new PointerEvent3D(PointerEvent3D.PICK_CLICK);
        this._outEvent = new PointerEvent3D(PointerEvent3D.PICK_OUT);
        this._overEvent = new PointerEvent3D(PointerEvent3D.PICK_OVER);
        this._mouseMove = new PointerEvent3D(PointerEvent3D.PICK_MOVE);
        this._upEvent = new PointerEvent3D(PointerEvent3D.PICK_UP);
        this._downEvent = new PointerEvent3D(PointerEvent3D.PICK_DOWN);
    }

    private _inputSystem() {
        // Multi-instance: prefer the input system owned by the view's
        // engine. Fall back to the legacy static accessor so single-
        // instance usage keeps working.
        const owner = (this._view as any)?.engine3D;
        return owner?.inputSystem;
    }

    /**
    * start this manager
    */
    public start() {
        const input = this._inputSystem();
        if (!input) return;
        const pick = this._view.engine3D.setting.pick;
        if (pick.enable) {
            input.addEventListener(PointerEvent3D.POINTER_DOWN, this.onTouchStart, this);
            input.addEventListener(PointerEvent3D.POINTER_UP, this.onTouchEnd, this);
            input.addEventListener(PointerEvent3D.POINTER_CLICK, this.onTouchOnce, this);
            input.addEventListener(PointerEvent3D.POINTER_RIGHT_CLICK, this.onTouchOnce, this);
            input.addEventListener(PointerEvent3D.POINTER_MOVE, this.onTouchMove, this);
        }

        if (pick.mode == `pixel`) {
            this._pickCompute = new PickCompute();
            this._pickCompute.init(this._view);
        }
    }


    /**
     * stop this manager
     */
    public stop() {
        const input = this._inputSystem();
        if (!input) return;
        input.removeEventListener(PointerEvent3D.POINTER_DOWN, this.onTouchStart, this);
        input.removeEventListener(PointerEvent3D.POINTER_UP, this.onTouchEnd, this);
        input.removeEventListener(PointerEvent3D.POINTER_CLICK, this.onTouchOnce, this);
        input.removeEventListener(PointerEvent3D.POINTER_RIGHT_CLICK, this.onTouchOnce, this);
        input.removeEventListener(PointerEvent3D.POINTER_MOVE, this.onTouchMove, this);
    }

    /**
     * Resolve the object a hit entry belongs to: the collider's object3D when a
     * collider is attached, otherwise the raw raycast hit object (`ray` mode picks
     * meshes without requiring a ColliderComponent).
     */
    private _eventTarget(hit: HitInfo): Object3D {
        if (!hit) return null;
        if (hit.collider) {
            return hit.collider.object3D;
        }
        return hit.object || null;
    }

    private onTouchStart(e: PointerEvent3D) {
        // console.log(e)
        this.isTouching = true;
        this._mouseCode = e.mouseCode;

        this.pick(this._view.camera);
        let target = this.findNearestObj(this._interestList, this._view.camera);
        let targetObject = this._eventTarget(target);
        this._lastDownTarget = targetObject;
        if (targetObject) {
            Object.assign(this._downEvent, e);
            this._downEvent.type = PointerEvent3D.PICK_DOWN;
            this._downEvent.target = targetObject;
            this._downEvent.data = this.getPickInfo();
            this.dispatchEvent(this._downEvent);

            if (targetObject.containEventListener(PointerEvent3D.PICK_DOWN)) {
                targetObject.dispatchEvent(this._downEvent);
            }
        }

    }

    private onTouchEnd(e: PointerEvent3D) {
        this.isTouching = false;
        this._mouseCode = e.mouseCode;

        this.pick(this._view.camera);
        let target = this.findNearestObj(this._interestList, this._view.camera);
        let targetObject = this._eventTarget(target);
        if (targetObject) {
            Object.assign(this._upEvent, e);
            this._upEvent.type = PointerEvent3D.PICK_UP;
            this._upEvent.target = targetObject;
            this._upEvent.data = this.getPickInfo();
            this.dispatchEvent(this._upEvent);

            if (targetObject.containEventListener(PointerEvent3D.PICK_UP)) {
                targetObject.dispatchEvent(this._upEvent);
            }
        }

    }

    private _lastFocus: Object3D;

    private getPickInfo() {
        if (this._view.engine3D.setting.pick.mode == `pixel`) {
            return {
                worldPos: this._pickCompute.getPickWorldPosition(),
                worldNormal: this._pickCompute.getPickWorldNormal(),
                screenUv: this._pickCompute.getPickScreenUV(),
                meshID: this._pickCompute.getPickMeshID(),
            };
        } else if (this._view.engine3D.setting.pick.mode == `ray`) {
            let hit = this._rayHits[0];
            if (hit) {
                let worldNormal = Vector3.ZERO;
                if (hit.normal) {
                    worldNormal = Matrix4.transformVector(hit.object.transform.worldMatrix, hit.normal, new Vector3());
                    worldNormal.normalize();
                }
                return {
                    worldPos: hit.point,
                    worldNormal: worldNormal,
                    meshID: hit.object.transform.worldMatrix.index,
                    distance: hit.distance,
                    object: hit.object,
                    faceIndex: hit.faceIndex,
                    face: hit.face,
                    uv: hit.uv,
                    uv1: hit.uv1,
                    barycoord: hit.barycoord,
                    normal: hit.normal,
                };
            }
            return {
                worldPos: Vector3.ZERO,
                worldNormal: Vector3.ZERO,
                meshID: -1,
                distance: 0,
            };
        } else {
            let intersection = this._interestList[0];
            if (intersection) {
                return {
                    worldPos: intersection.intersectPoint,
                    worldNormal: intersection.normal,
                    meshID: intersection.collider.transform.worldMatrix.index,
                    distance: intersection.distance,
                };
            }
            return {
                worldPos: Vector3.ZERO,
                worldNormal: Vector3.ZERO,
                meshID: -1,
                distance: 0,
            };
        }
    }

    private onTouchMove(e: PointerEvent3D) {
        this.isTouching = true;
        this._mouseCode = e.mouseCode;
        this.pick(this._view.camera);
        let target = this.findNearestObj(this._interestList, this._view.camera);
        let targetObject = this._eventTarget(target);
        if (targetObject) {
            Object.assign(this._mouseMove, e);
            this._mouseMove.type = PointerEvent3D.PICK_MOVE;
            this._mouseMove.target = targetObject;
            this._mouseMove.data = this.getPickInfo();
            this.dispatchEvent(this._mouseMove);

            if (targetObject.containEventListener(PointerEvent3D.PICK_MOVE)) {
                targetObject.dispatchEvent(this._mouseMove);
            }
        }

        if (targetObject != this._lastFocus) {
            if (this._lastFocus) {
                Object.assign(this._outEvent, e);
                this._outEvent.type = PointerEvent3D.PICK_OUT;
                this._outEvent.target = this._lastFocus;
                this._outEvent.data = this.getPickInfo();
                this.dispatchEvent(this._outEvent);

                if (this._lastFocus.containEventListener(PointerEvent3D.PICK_OUT)) {
                    this._lastFocus.dispatchEvent(this._outEvent);
                }
            }
            if (targetObject) {
                Object.assign(this._overEvent, e);
                this._overEvent.type = PointerEvent3D.PICK_OVER;
                this._overEvent.target = targetObject;
                this._overEvent.data = this.getPickInfo();
                this.dispatchEvent(this._overEvent);
                if (targetObject.containEventListener(PointerEvent3D.PICK_OVER)) {
                    targetObject.dispatchEvent(this._overEvent);
                }
            }
        }
        this._lastFocus = targetObject;
    }

    private onTouchOnce(e: PointerEvent3D) {
        this.isTouching = true;
        this._mouseCode = e.mouseCode;
        this.pick(this._view.camera);
        let target = this.findNearestObj(this._interestList, this._view.camera);
        let targetObject = this._eventTarget(target);
        if (targetObject) {
            let info = this.getPickInfo();
            Object.assign(this._pickEvent, e);
            this._pickEvent.type = PointerEvent3D.PICK_CLICK;
            this._pickEvent.target = targetObject;
            this._pickEvent.data = info;
            this.dispatchEvent(this._pickEvent);

            if (targetObject === this._lastDownTarget && targetObject.containEventListener(PointerEvent3D.PICK_CLICK)) {
                targetObject.dispatchEvent(this._pickEvent);
            }
        }

        this._lastDownTarget = null;
    }

    private findNearestObj(list: HitInfo[], camera: Camera3D): HitInfo {
        // let target: ColliderComponent = null;
        // let minDistance: number = Number.MAX_VALUE;
        // for (const item of list) {
        //     let curDistance = Vector3.distance(item.object3D.transform.worldPosition, camera.transform.worldPosition);
        //     if (curDistance < minDistance) {
        //         target = item;
        //         minDistance = curDistance;
        //     }
        // }
        list.sort((a, b) => {
            return a.distance > b.distance ? 1 : -1;
        });

        return list[0];
    }

    private _interestList: HitInfo[] = [];

    private pick(camera: Camera3D) {
        this._interestList.length = 0;
        const mode = this._view.engine3D.setting.pick.mode;
        if (mode == `pixel`) {
            this._pickCompute.compute(this._view);
            let meshID = this._pickCompute.getPickMeshID();
            let iterator = this.mouseEnableMap.get(meshID);
            if (iterator) {
                let position = this._pickCompute.getPickWorldPosition();
                let distance = Vector3.distance(position, this.ray.origin);
                this._interestList.push({ distance: distance, collider: iterator, intersectPoint: position });
            }
        } else if (mode == `bound`) {
            const input = this._inputSystem();
            this.ray = camera.screenPointToRay(input.mouseX, input.mouseY);
            let intersect: HitInfo;
            let colliders = ComponentCollect.componentsEnablePickerList.get(this._view);;
            if (colliders) {
                for (const item of colliders) {
                    let collider = item[0];
                    if (collider.enable) {
                        intersect = collider.rayPick(this.ray);
                        if (intersect) {
                            intersect.collider = collider;
                            this._interestList.push(intersect);
                        }
                    }

                }
            }
        } else if (mode == `ray`) {
            const input = this._inputSystem();
            this.ray = camera.screenPointToRay(input.mouseX, input.mouseY);
            this._raycaster.set(this.ray);
            this._rayHits = this._raycaster.intersectObject(this._view.scene, true);
            for (const hit of this._rayHits) {
                let collider = hit.object.getComponent(ColliderComponent);
                this._interestList.push({
                    distance: hit.distance,
                    intersectPoint: hit.point,
                    normal: hit.normal,
                    collider: collider,
                    object: hit.object,
                });
            }
        }
    }
}

// /**
//  * @internal
//  */
// export let pickFire: PickFire = new PickFire();
