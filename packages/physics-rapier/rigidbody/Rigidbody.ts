import { ComponentBase, Vector3, Quaternion } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../Physics';
import { TempPhyMath } from '../utils/TempPhyMath';
import { BodyType } from './RigidbodyEnum';
import { ChildShape } from '../shape/CollisionShapeUtil';

export type ContactCallback = (other: Rigidbody) => void;

/**
 * Rigidbody Component (Rapier backend).
 *
 * Public API mirrors `@orillusion/physics`'s `Rigidbody` where semantics line
 * up. Rapier-only switches (`lockTranslations`, `enableCcd`) replace ammo's
 * matrix-style `setLinearFactor / setCcdMotionThreshold + sweptSphereRadius`.
 *
 * @group Components
 */
export class Rigidbody extends ComponentBase {
    private _initResolve!: () => void;
    private _initializationPromise: Promise<void> = new Promise<void>(r => this._initResolve = r);
    private _bodyInited: boolean = false;

    private _body: RAPIER.RigidBody;
    private _colliders: RAPIER.Collider[] = [];
    private _shapes: RAPIER.ColliderDesc[] = [];

    private _bodyType: BodyType = BodyType.Dynamic;
    private _mass: number = 1;
    private _restitution: number = 0.5;
    private _friction: number = 0.5;
    private _linearDamping: number = 0;
    private _angularDamping: number = 0;
    private _gravityScale: number = 1;
    private _ccd: boolean = false;
    private _userIndex: number;

    /**
     * Whether this body is a sensor (no contact response, fires triggerEnter/Exit).
     * Must be set BEFORE `start()`.
     */
    public isSensor: boolean = false;

    /**
     * Whether contact / trigger events are emitted. Must be set BEFORE
     * `start()`. Off by default for performance.
     */
    public enableEvents: boolean = false;

    /** Fires once when contact between two non-sensor bodies begins. */
    public onContactBegin?: ContactCallback;
    /** Fires every frame while contact persists (after `onContactBegin`). */
    public onContactStay?: ContactCallback;
    /** Fires once when contact ends. */
    public onContactEnd?: ContactCallback;
    /** Fires once when a non-sensor body enters this sensor. */
    public onTriggerEnter?: ContactCallback;
    /** Fires once when a non-sensor body leaves this sensor. */
    public onTriggerExit?: ContactCallback;

    /** @internal */
    public _activeContacts: Set<Rigidbody> = new Set();

    public start(): void {
        if (!Physics.isInited) {
            throw new Error('Rigidbody.start: Physics has not been initialized. Call `await Physics.init()` first.');
        }
        if (this._shapes.length === 0) {
            throw new Error('Rigidbody.start: `shape` is required. Build one via `CollisionShapeUtil`.');
        }

        // Treat mass = 0 as Static when bodyType is Dynamic, matching ammo
        // plugin convention. Don't apply this to KinematicPosition /
        // KinematicVelocity — those are explicit choices the user wants
        // honoured even with mass 0 (kinematic bodies have no meaningful mass).
        const isStatic = this._bodyType === BodyType.Static ||
            (this._bodyType === BodyType.Dynamic && this._mass === 0);

        let bodyDesc: RAPIER.RigidBodyDesc;
        if (isStatic) {
            bodyDesc = RAPIER.RigidBodyDesc.fixed();
        } else if (this._bodyType === BodyType.KinematicPosition) {
            bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        } else if (this._bodyType === BodyType.KinematicVelocity) {
            bodyDesc = RAPIER.RigidBodyDesc.kinematicVelocityBased();
        } else {
            bodyDesc = RAPIER.RigidBodyDesc.dynamic();
        }

        const pos = this.transform.localPosition;
        const rot = this.transform.localRotQuat;
        bodyDesc
            .setTranslation(pos.x, pos.y, pos.z)
            .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
            .setLinearDamping(this._linearDamping)
            .setAngularDamping(this._angularDamping)
            .setGravityScale(this._gravityScale)
            .setCcdEnabled(this._ccd);

        if (this._userIndex != null) bodyDesc.setUserData(this._userIndex);

        this._body = Physics.world.createRigidBody(bodyDesc);

        // Distribute mass across compound colliders.
        const massPer = isStatic ? 0 : this._mass / this._shapes.length;

        for (const desc of this._shapes) {
            if (massPer > 0) desc.setMass(massPer);
            desc.setRestitution(this._restitution).setFriction(this._friction);
            if (this.isSensor) desc.setSensor(true);
            if (this.enableEvents) desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

            const collider = Physics.world.createCollider(desc, this._body);
            this._colliders.push(collider);
        }

        // Register handle → rb mapping for event dispatch.
        Physics._registerRigidbody(this);

        this._bodyInited = true;
        this._initResolve();
    }

    /**
     * Pull body pose into the owner Object3D. Called by `Physics.update` AFTER
     * `world.step` so the transform reflects the post-step pose in the SAME
     * frame's render. Doing this in `onUpdate` (which runs BEFORE the render-
     * loop callback) would render the pre-step pose and lag visuals one frame
     * behind physics — visible during kinematic drag where the body chases
     * mouse-set `setNextKinematicTranslation` targets every frame.
     */
    public _syncTransformFromBody(force: boolean = false): void {
        if (!this._bodyInited) return;
        // Sleeping bodies don't move under integration, so skipping saves work
        // — but external pose changes (Physics.restore, manual setTranslation)
        // need `force=true` to push the new pose through. Also: a body that
        // was promoted to kinematic at runtime (e.g. by PhysicsDragger) can
        // remain flagged as sleeping while Rapier still interpolates it to
        // setNextKinematicTranslation targets — don't skip those either.
        if (!force && this._body.isSleeping()) {
            const nt = this._body.bodyType();
            if (nt !== RAPIER.RigidBodyType.KinematicPositionBased &&
                nt !== RAPIER.RigidBodyType.KinematicVelocityBased) return;
        }
        if (this._bodyType === BodyType.Static || this._mass === 0) return;

        const t = this._body.translation();
        const r = this._body.rotation();
        this.transform.localPosition = Vector3.HELP_0.set(t.x, t.y, t.z);
        this.transform.localRotQuat = Quaternion.HELP_0.set(r.x, r.y, r.z, r.w);
    }

    public onUpdate(): void {
        // Sync moved to `_syncTransformFromBody`, invoked by `Physics.update`
        // post-step so renders show the current physics pose.
    }

    public destroy(force?: boolean): void {
        if (this._bodyInited) Physics._unregisterRigidbody(this);
        if (this._body && Physics.world) Physics.world.removeRigidBody(this._body);
        this._body = null;
        this._colliders = [];
        this._activeContacts.clear();
        this._bodyInited = false;
        super.destroy(force);
    }

    /**
     * @internal Swap in fresh body/collider wrappers after `Physics.restore()`
     * rebuilds the world. Handles are preserved across snapshots, so the new
     * wrappers describe the same logical entities — only their JS proxies
     * needed refreshing.
     */
    public _rebind(body: RAPIER.RigidBody, colliders: RAPIER.Collider[]): void {
        this._body = body;
        this._colliders = colliders;
        this._activeContacts.clear();
        // Push the restored pose into the Object3D immediately. The new body
        // may be sleeping at a position different from whatever the visual
        // currently shows; without this, the next post-step sync would skip
        // the body (sleeping fast-path) and the visual would stay stale.
        this._syncTransformFromBody(true);
    }

    /** @internal Detach this component from the physics world (used when restore drops the body). */
    public _detach(): void {
        this._body = null;
        this._colliders = [];
        this._activeContacts.clear();
        this._bodyInited = false;
    }

    public async wait(): Promise<RAPIER.RigidBody> {
        await this._initializationPromise;
        return this._body;
    }

    public get bodyInited(): boolean { return this._bodyInited; }

    /** Escape hatch to the native Rapier RigidBody. Opts out of cross-backend portability. */
    public get native(): RAPIER.RigidBody { return this._body; }

    public get colliders(): RAPIER.Collider[] { return this._colliders; }

    /**
     * Collider descriptor used to build the body. Accepts a single shape, a
     * compound (`ChildShape[]`) or a flat array of `ColliderDesc`.
     * Set BEFORE `start()`.
     */
    public get shape(): RAPIER.ColliderDesc | RAPIER.ColliderDesc[] {
        return this._shapes.length === 1 ? this._shapes[0] : this._shapes;
    }
    public set shape(value: RAPIER.ColliderDesc | RAPIER.ColliderDesc[] | ChildShape[]) {
        if (Array.isArray(value)) {
            // Could be ChildShape[] or ColliderDesc[]
            const arr = value as Array<RAPIER.ColliderDesc | ChildShape>;
            this._shapes = arr.map(item => {
                if ((item as ChildShape).shape) return (item as ChildShape).shape;
                return item as RAPIER.ColliderDesc;
            });
        } else {
            this._shapes = [value];
        }
    }

    public get bodyType(): BodyType { return this._bodyType; }
    public set bodyType(value: BodyType) {
        this._bodyType = value;
        if (this._body) {
            const t = value === BodyType.Static ? RAPIER.RigidBodyType.Fixed
                : value === BodyType.KinematicPosition ? RAPIER.RigidBodyType.KinematicPositionBased
                : value === BodyType.KinematicVelocity ? RAPIER.RigidBodyType.KinematicVelocityBased
                : RAPIER.RigidBodyType.Dynamic;
            this._body.setBodyType(t, true);
        }
    }

    public get mass(): number { return this._mass; }
    public set mass(value: number) {
        this._mass = value;
        // Mass cannot be retroactively changed in Rapier 0.14 without rebuilding the body.
    }

    public get restitution(): number { return this._restitution; }
    public set restitution(value: number) {
        this._restitution = value;
        for (const c of this._colliders) c.setRestitution(value);
    }

    public get friction(): number { return this._friction; }
    public set friction(value: number) {
        this._friction = value;
        for (const c of this._colliders) c.setFriction(value);
    }

    public get linearDamping(): number { return this._linearDamping; }
    public set linearDamping(value: number) {
        this._linearDamping = value;
        this._body?.setLinearDamping(value);
    }

    public get angularDamping(): number { return this._angularDamping; }
    public set angularDamping(value: number) {
        this._angularDamping = value;
        this._body?.setAngularDamping(value);
    }

    public get gravityScale(): number { return this._gravityScale; }
    public set gravityScale(value: number) {
        this._gravityScale = value;
        this._body?.setGravityScale(value, true);
    }

    public get userIndex(): number { return this._userIndex; }
    public set userIndex(value: number) {
        this._userIndex = value;
        if (this._body) this._body.userData = value;
    }

    public get linearVelocity(): Vector3 {
        if (!this._body) return new Vector3();
        const v = this._body.linvel();
        return new Vector3(v.x, v.y, v.z);
    }
    public set linearVelocity(value: Vector3) {
        this._body?.setLinvel(TempPhyMath.toRVec(value), true);
    }

    public get angularVelocity(): Vector3 {
        if (!this._body) return new Vector3();
        const v = this._body.angvel();
        return new Vector3(v.x, v.y, v.z);
    }
    public set angularVelocity(value: Vector3) {
        this._body?.setAngvel(TempPhyMath.toRVec(value), true);
    }

    /** Continuous Collision Detection. Replaces ammo's two-knob CCD API. */
    public enableCcd(value: boolean): void {
        this._ccd = value;
        this._body?.enableCcd(value);
    }

    /** Lock translation axes. `true` locks the axis. (Rapier-only) */
    public lockTranslations(x: boolean, y: boolean, z: boolean): void {
        this._body?.setEnabledTranslations(!x, !y, !z, true);
    }

    /** Lock rotation axes. `true` locks the axis. (Rapier-only) */
    public lockRotations(x: boolean, y: boolean, z: boolean): void {
        this._body?.setEnabledRotations(!x, !y, !z, true);
    }

    public applyImpulse(impulse: Vector3, point?: Vector3): void {
        if (!this._body) return;
        if (point) {
            this._body.applyImpulseAtPoint(
                TempPhyMath.toRVec(impulse, TempPhyMath.tmpVecA),
                TempPhyMath.toRVec(point, TempPhyMath.tmpVecB),
                true,
            );
        } else {
            this._body.applyImpulse(TempPhyMath.toRVec(impulse), true);
        }
    }

    public applyTorqueImpulse(torque: Vector3): void {
        this._body?.applyTorqueImpulse(TempPhyMath.toRVec(torque), true);
    }

    public applyForce(force: Vector3, point?: Vector3): void {
        if (!this._body) return;
        if (point) {
            this._body.addForceAtPoint(
                TempPhyMath.toRVec(force, TempPhyMath.tmpVecA),
                TempPhyMath.toRVec(point, TempPhyMath.tmpVecB),
                true,
            );
        } else {
            this._body.addForce(TempPhyMath.toRVec(force), true);
        }
    }

    public clearForcesAndVelocities(): void {
        if (!this._body) return;
        this._body.resetForces(true);
        this._body.resetTorques(true);
        this._body.setLinvel(TempPhyMath.zeroRVec(TempPhyMath.tmpVecA), true);
        this._body.setAngvel(TempPhyMath.zeroRVec(TempPhyMath.tmpVecB), true);
    }

    /** Force pose; mirrors ammo plugin's `Rigidbody.updateTransform`. */
    public updateTransform(position?: Vector3, rotation?: Vector3 | Quaternion, clearFV?: boolean): void {
        if (!this._body) return;
        position ||= this.transform.localPosition;
        this._body.setTranslation(TempPhyMath.toRVec(position, TempPhyMath.tmpVecA), true);

        if (rotation) {
            let q: Quaternion;
            if (rotation instanceof Quaternion) {
                q = rotation;
            } else {
                q = Quaternion.HELP_0;
                q.setFromEuler(rotation.x, rotation.y, rotation.z);
            }
            this._body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        }

        if (clearFV) this.clearForcesAndVelocities();
    }
}
