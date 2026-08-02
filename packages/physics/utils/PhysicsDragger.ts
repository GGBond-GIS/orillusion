import { View3D, PointerEvent3D, Vector3 } from "@orillusion/core";
import { Ammo, Physics } from "../Physics";
import { TempPhyMath } from "./TempPhyMath";
import { CollisionFlags } from "../rigidbody/RigidbodyEnum";

/**
 * The PhysicsDragger class is used to drag 3D objects with the mouse.
 * It uses ray casting in the physics engine to interact with rigid bodies, enabling real-time dragging of objects.
 */
export class PhysicsDragger {
    private _view: View3D;
    private _interactionDepth: number;
    private _rigidBody: Ammo.btRigidBody;
    private _rayStart: Ammo.btVector3;
    private _rayEnd: Ammo.btVector3;
    private _raycastResult: Ammo.ClosestRayResultCallback;
    private _isDragging: boolean = false;
    private _hitPoint: Vector3 = new Vector3();
    private _offset: Vector3 = new Vector3();
    private _enable: boolean = true;

    public get enable(): boolean {
        return this._enable;
    }

    /**
     * Whether to enable the dragging feature
     */
    public set enable(value: boolean) {
        if (this._enable === value) return;
        this._enable = value;
        value ? this.registerEvents() : this.unregisterEvents();
    }

    /**
     * Whether to filter out static rigid body objects. Default value is `true`
     */
    public filterStatic: boolean = true;

    /**
     * Set the ray collision filter group
     */
    public set collisionFilterGroup(value: number) {
        this._raycastResult?.set_m_collisionFilterGroup(value);
    }

    /**
     * Set the ray collision filter mask
     */
    public set collisionFilterMask(value: number) {
        this._raycastResult?.set_m_collisionFilterMask(value);
    }

    constructor(view: View3D) {
        this._view = view;
        this.initRaycast();
        this.registerEvents();
    }

    private get _inputSystem() {
        return this._view?.engine3D?.inputSystem;
    }

    private initRaycast() {
        this._rayStart = new Ammo.btVector3();
        this._rayEnd = new Ammo.btVector3();
        this._raycastResult = new Ammo.ClosestRayResultCallback(this._rayStart, this._rayEnd);
    }

    private registerEvents() {
        const input = this._inputSystem;
        input?.addEventListener(PointerEvent3D.POINTER_DOWN, this.onMouseDown, this);
        input?.addEventListener(PointerEvent3D.POINTER_MOVE, this.onMouseMove, this, null, 20);
        input?.addEventListener(PointerEvent3D.POINTER_UP, this.onMouseUp, this, null, 20);
        input?.addEventListener(PointerEvent3D.POINTER_WHEEL, this.onMouseWheel, this, null, 20);
    }

    private unregisterEvents() {
        const input = this._inputSystem;
        input?.removeEventListener(PointerEvent3D.POINTER_DOWN, this.onMouseDown, this);
        input?.removeEventListener(PointerEvent3D.POINTER_MOVE, this.onMouseMove, this);
        input?.removeEventListener(PointerEvent3D.POINTER_UP, this.onMouseUp, this);
        input?.removeEventListener(PointerEvent3D.POINTER_WHEEL, this.onMouseWheel, this);

        this.resetState();
    }

    private onMouseDown(e: PointerEvent3D) {
        if (!this._enable) return;

        if (e.mouseCode === 0) { // left key
            const camera = this._view.camera;
            let ray = camera.screenPointToRay(e.mouseX, e.mouseY);

            let adjustedDirection = ray.direction.normalize();
            Vector3.add(ray.origin, adjustedDirection.multiplyScalar(1000), ray.origin);
            let endPos = ray.origin;

            this.resetRayCallback(this._raycastResult);
            this.castRay(camera.object3D.localPosition, endPos);

            if (this._isDragging) {
                e.stopImmediatePropagation();
                const worldCoordinates = camera.worldToScreenPoint(this._hitPoint, Vector3.HELP_1);
                this._interactionDepth = worldCoordinates.z;
            }
        }
    }

    private onMouseMove(e: PointerEvent3D) {
        if (!this._enable || !this._isDragging) return;

        e.stopImmediatePropagation();
        this.updateRigidBody();
    }

    private onMouseUp(e: PointerEvent3D) {
        if (!this._enable || !this._isDragging) return;

        if (e.mouseCode === 0) {
            this.resetState();
        }
    }

    private onMouseWheel(e: PointerEvent3D) {
        if (!this._enable || !this._isDragging) return;

        this.updateRigidBody();
    }

    private resetRayCallback(callback: Ammo.ClosestRayResultCallback) {
        callback.set_m_closestHitFraction(1); // Reset the closest hit fraction to its maximum
        callback.set_m_collisionObject(null); // Clear the collision object
    }

    private castRay(cameraPos: Vector3, targetPos: Vector3) {
        this._rayStart.setValue(cameraPos.x, cameraPos.y, cameraPos.z);
        this._rayEnd.setValue(targetPos.x, targetPos.y, targetPos.z);

        this._raycastResult.set_m_rayFromWorld(this._rayStart);
        this._raycastResult.set_m_rayToWorld(this._rayEnd);

        Physics.world.rayTest(this._rayStart, this._rayEnd, this._raycastResult);

        if (this._raycastResult.hasHit()) {
            const collisionObject = this._raycastResult.get_m_collisionObject();
            if (this.filterStatic && collisionObject.isStaticObject()) return;

            this._rigidBody = Ammo.castObject(collisionObject, Ammo.btRigidBody);

            // Intersection point
            TempPhyMath.fromBtVec(this._raycastResult.get_m_hitPointWorld(), this._hitPoint);

            this._rigidBody.setCollisionFlags(this._rigidBody.getCollisionFlags() | CollisionFlags.KINEMATIC_OBJECT);

            // Compute the offset from the selected object's position to the intersection point
            this._rigidBody.getMotionState().getWorldTransform(Physics.TEMP_TRANSFORM);
            let originPos = TempPhyMath.fromBtVec(Physics.TEMP_TRANSFORM.getOrigin(), Vector3.HELP_0);
            Vector3.sub(originPos, this._hitPoint, this._offset);

            this._isDragging = true;
            document.body.style.cursor = 'grab';
        }
    }

    // Update the rigid body position
    private updateRigidBody() {
        const input = this._inputSystem;
        let pos = this._view.camera.screenPointToWorld(input.mouseX, input.mouseY, this._interactionDepth);

        // New position combined with the offset
        Vector3.add(pos, this._offset, pos);
        let newPos = pos;

        // Update the position
        this._rigidBody.getMotionState().getWorldTransform(Physics.TEMP_TRANSFORM);
        Physics.TEMP_TRANSFORM.setOrigin(TempPhyMath.toBtVec(newPos));
        this._rigidBody.getMotionState().setWorldTransform(Physics.TEMP_TRANSFORM);
        this._rigidBody.getWorldTransform().setOrigin(Physics.TEMP_TRANSFORM.getOrigin()); // Ensure the static rigid body's position info is in sync

        this._rigidBody.activate(true);
        document.body.style.cursor = 'grabbing';
    }

    private resetState() {
        if (this._rigidBody) {
            this._rigidBody.setCollisionFlags(this._rigidBody.getCollisionFlags() & ~CollisionFlags.KINEMATIC_OBJECT);
            this._rigidBody.activate(true);
            this._rigidBody = null;
        }

        this._isDragging = false;
        document.body.style.cursor = 'default';
    }

}
