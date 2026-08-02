import { View3D, PointerEvent3D, Vector3 } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsQuery } from '../query/PhysicsQuery';

/**
 * Mouse-driven rigid-body dragger.
 *
 * Mirrors `@orillusion/physics`'s `PhysicsDragger`. Implementation differs
 * from the ammo version: rather than juggling collision flags, it switches
 * the body to KinematicPositionBased while dragging, then restores the
 * original type on release.
 */
export class PhysicsDragger {
    private _view: View3D;
    private _enable: boolean = true;

    private _interactionDepth: number;
    private _hitPoint: Vector3 = new Vector3();
    private _offset: Vector3 = new Vector3();
    private _isDragging: boolean = false;

    private _draggedBody: RAPIER.RigidBody | null = null;
    private _originalBodyType: RAPIER.RigidBodyType;
    private _registered: boolean = false;

    public filterStatic: boolean = true;

    constructor(view: View3D) {
        this._view = view;
        this._registerEvents();
    }

    public set enable(value: boolean) {
        if (this._enable === value) return;
        this._enable = value;
        if (value) this._registerEvents(); else this._unregisterEvents();
    }
    public get enable(): boolean { return this._enable; }

    private get _input() { return this._view?.engine3D?.inputSystem; }

    private _registerEvents() {
        if (this._registered) return;
        const input = this._input;
        // `view.engine3D` is only populated by `engine.startRenderView(view)`,
        // so callers that invoke `Physics.enableDragger(view)` before
        // `startRenderView` hit a window where input is unavailable. Retry
        // on the next animation frame until the engine binds the view.
        if (!input) {
            if (typeof requestAnimationFrame !== 'undefined') {
                requestAnimationFrame(() => { if (this._enable) this._registerEvents(); });
            }
            return;
        }
        input.addEventListener(PointerEvent3D.POINTER_DOWN, this._onMouseDown, this);
        input.addEventListener(PointerEvent3D.POINTER_MOVE, this._onMouseMove, this, null, 20);
        input.addEventListener(PointerEvent3D.POINTER_UP, this._onMouseUp, this, null, 20);
        input.addEventListener(PointerEvent3D.POINTER_WHEEL, this._onMouseWheel, this, null, 20);
        this._registered = true;
    }

    private _unregisterEvents() {
        if (!this._registered) { this._resetState(); return; }
        const input = this._input;
        input?.removeEventListener(PointerEvent3D.POINTER_DOWN, this._onMouseDown, this);
        input?.removeEventListener(PointerEvent3D.POINTER_MOVE, this._onMouseMove, this);
        input?.removeEventListener(PointerEvent3D.POINTER_UP, this._onMouseUp, this);
        input?.removeEventListener(PointerEvent3D.POINTER_WHEEL, this._onMouseWheel, this);
        this._registered = false;
        this._resetState();
    }

    private _onMouseDown = (e: PointerEvent3D) => {
        if (!this._enable || e.mouseCode !== 0) return;

        const camera = this._view.camera;
        const ray = camera.screenPointToRay(e.mouseX, e.mouseY);
        const dir = ray.direction.normalize().clone();

        const hit = PhysicsQuery.raycast(camera.object3D.localPosition, dir, { maxDistance: 1000, excludeSensors: true });
        if (!hit) return;
        if (this.filterStatic && hit.collider.parent()?.isFixed()) return;

        const body = hit.collider.parent();
        if (!body) return;

        e.stopImmediatePropagation();

        this._draggedBody = body;
        this._originalBodyType = body.bodyType();
        body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);

        this._hitPoint.copy(hit.point);
        const origin = body.translation();
        this._offset.set(origin.x - this._hitPoint.x, origin.y - this._hitPoint.y, origin.z - this._hitPoint.z);

        const screen = camera.worldToScreenPoint(this._hitPoint, Vector3.HELP_1);
        this._interactionDepth = screen.z;

        this._isDragging = true;
        document.body.style.cursor = 'grab';
    };

    private _onMouseMove = (e: PointerEvent3D) => {
        if (!this._enable || !this._isDragging) return;
        e.stopImmediatePropagation();
        this._updateBody();
    };

    private _onMouseUp = (e: PointerEvent3D) => {
        if (!this._enable || !this._isDragging || e.mouseCode !== 0) return;
        this._resetState();
    };

    private _onMouseWheel = (_e: PointerEvent3D) => {
        if (!this._enable || !this._isDragging) return;
        this._updateBody();
    };

    private _updateBody() {
        if (!this._draggedBody) return;

        const input = this._input;
        const pos = this._view.camera.screenPointToWorld(input.mouseX, input.mouseY, this._interactionDepth);
        const tx = pos.x + this._offset.x;
        const ty = pos.y + this._offset.y;
        const tz = pos.z + this._offset.z;

        this._draggedBody.setNextKinematicTranslation({ x: tx, y: ty, z: tz });
        document.body.style.cursor = 'grabbing';
    }

    private _resetState() {
        if (this._draggedBody) {
            this._draggedBody.setBodyType(this._originalBodyType, true);
            this._draggedBody = null;
        }
        this._isDragging = false;
        document.body.style.cursor = 'default';
    }
}
