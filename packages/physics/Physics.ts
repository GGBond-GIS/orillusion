import Ammo from '@orillusion/ammo';
import { Vector3, Time, BoundingBox, Object3D, Quaternion, View3D } from '@orillusion/core';
import { ContactProcessedUtil } from './utils/ContactProcessedUtil';
import { RigidBodyUtil } from './utils/RigidBodyUtil';
import { TempPhyMath } from './utils/TempPhyMath';
import { Rigidbody } from './rigidbody/Rigidbody';
import { PhysicsDebugDrawer } from './visualDebug/PhysicsDebugDrawer';
import { DebugDrawerOptions } from './visualDebug/DebugDrawModeEnum';
import { PhysicsDragger } from './utils/PhysicsDragger'

class _Physics {
    private _world: Ammo.btDiscreteDynamicsWorld | Ammo.btSoftRigidDynamicsWorld;
    private _isInited: boolean = false;
    private _isStop: boolean = false;
    private _gravity: Vector3 = new Vector3(0, -9.8, 0);
    private _worldInfo: Ammo.btSoftBodyWorldInfo | null = null;
    private _debugDrawer: PhysicsDebugDrawer;
    private _physicsDragger: PhysicsDragger;
    private _physicBound: BoundingBox;
    private _destroyObjectBeyondBounds: boolean;

    public readonly contactProcessedUtil = ContactProcessedUtil;
    public readonly rigidBodyUtil = RigidBodyUtil;

    public maxSubSteps: number = 10;
    public fixedTimeStep: number = 1 / 60;

    /**
     * Physics debug drawer
     */
    public get debugDrawer() {
        if (!this._debugDrawer) {
            console.warn('To enable debugging, configure with: Physics.initDebugDrawer');
        }
        return this._debugDrawer;
    }

    /**
     * Physics dragger
     */
    public get physicsDragger() {
        if (!this._physicsDragger) {
            console.warn('To enable the dragger, call Physics.enableDragger(view) after Physics.init().');
        }
        return this._physicsDragger;
    }

    public TEMP_TRANSFORM: Ammo.btTransform; // Temp cache, save results from body.getWorldTransform()

    /**
     * Initialize the physics engine and related configuration.
     *
     * @param options - Initialization options object.
     * @param options.useSoftBody - Whether to enable soft body simulation.
     * @param options.useDrag - Whether to enable rigid body dragging.
     * @param options.physicBound - Physics bounds, default range: 2000 2000 2000. Rigid bodies that exit the bounds will be destroyed.
     * @param options.destroyObjectBeyondBounds - Whether to destroy the 3D object when it exits the bounds. Defaults to `false`, which only destroys the rigid body.
     */
    public async init(options: { useSoftBody?: boolean, physicBound?: Vector3, destroyObjectBeyondBounds?: boolean } = {}) {
        await Ammo.bind(window)(Ammo);

        TempPhyMath.init();

        this.TEMP_TRANSFORM = new Ammo.btTransform();
        this.initWorld(options.useSoftBody);

        this._isInited = true;
        this._destroyObjectBeyondBounds = options.destroyObjectBeyondBounds;
        this._physicBound = new BoundingBox(new Vector3(), options.physicBound || new Vector3(2000, 2000, 2000));
    }

    /**
     * Enable the rigid body dragger and bind it to the given View. Must be called after Physics.init and before rendering starts.
     */
    public enableDragger(view: View3D) {
        this._physicsDragger = new PhysicsDragger(view);
    }

    /**
     * Initialize the physics debug drawer
     *
     * @param {Graphic3D} graphic3D - Type: `Graphic3D` A graphic object used to draw lines.
     * @param {DebugDrawerOptions} [options] - Debug draw options used to configure the physics debug drawer. {@link DebugDrawerOptions}
     */
    public initDebugDrawer(graphic3D: Object3D, options?: DebugDrawerOptions) {
        this._debugDrawer = new PhysicsDebugDrawer(this.world, graphic3D, options);
    }

    private initWorld(useSoftBody: boolean) {
        const collisionConfiguration = useSoftBody
            ? new Ammo.btSoftBodyRigidBodyCollisionConfiguration()
            : new Ammo.btDefaultCollisionConfiguration();
        const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        const broadphase = new Ammo.btDbvtBroadphase();
        const solver = new Ammo.btSequentialImpulseConstraintSolver();

        if (useSoftBody) {
            const softBodySolver = new Ammo.btDefaultSoftBodySolver();
            this._world = new Ammo.btSoftRigidDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration, softBodySolver);
            this._worldInfo = (this.world as Ammo.btSoftRigidDynamicsWorld).getWorldInfo();
            this._worldInfo.set_m_broadphase(broadphase);
            this._worldInfo.set_m_dispatcher(dispatcher);
            this._worldInfo.set_m_gravity(TempPhyMath.toBtVec(this._gravity));
            this._worldInfo.set_air_density(1.2);
            this._worldInfo.set_water_density(0);
            this._worldInfo.set_water_offset(0);
            this._worldInfo.set_water_normal(TempPhyMath.setBtVec(0, 0, 0));
            this._worldInfo.set_m_maxDisplacement(0.5);
        } else {
            this._world = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
        }

        this._world.setGravity(TempPhyMath.toBtVec(this._gravity));
    }

    /**
     * Physics simulation update
     * @param timeStep - Time step
     * @default Time.delta * 0.001
     */
    public update(timeStep: number = Time.delta * 0.001) {
        if (!this._isInited || this.isStop) return;
        this.world.stepSimulation(timeStep, this.maxSubSteps, this.fixedTimeStep);
        // this.world.stepSimulation(Time.delta, 1, this.fixedTimeStep);

        this._debugDrawer?.update();
    }

    public get world(): Ammo.btDiscreteDynamicsWorld | Ammo.btSoftRigidDynamicsWorld {
        return this._world;
    }

    public get isInited(): boolean {
        return this._isInited;
    }

    public set isStop(value: boolean) {
        this._isStop = value;
    }

    public get isStop() {
        return this._isStop;
    }

    public set gravity(value: Vector3) {
        this._gravity.copy(value);
        this._world?.setGravity(TempPhyMath.toBtVec(value)); // Set rigid body physics gravity
        this._worldInfo?.set_m_gravity(TempPhyMath.toBtVec(value)); // Set soft body physics gravity
    }

    public get gravity(): Vector3 {
        return this._gravity;
    }

    public get worldInfo(): Ammo.btSoftBodyWorldInfo {
        return this._worldInfo;
    }

    public get isSoftBodyWord() {
        return this._world instanceof Ammo.btSoftRigidDynamicsWorld;
    }

    public checkBound(body: Rigidbody) {
        if (body) {
            let wp = body.transform.worldPosition;
            let inside = this._physicBound.containsPoint(wp);
            if (!inside) {
                if (this._destroyObjectBeyondBounds) {
                    body.object3D.destroy();
                } else {
                    body.btRigidbody.activate(false);
                    body.destroy();
                }
            }
        }
    }

    /**
     * Sync the position and rotation of the physics object to the 3D object
     * @param object3D - 3D object
     * @param tm - Physics object transform
     */
    public syncGraphic(object3D: Object3D, tm: Ammo.btTransform): void {
        object3D.localPosition = TempPhyMath.fromBtVec(tm.getOrigin(), Vector3.HELP_0);
        object3D.localQuaternion = TempPhyMath.fromBtQua(tm.getRotation(), Quaternion.HELP_0);
    }
}

/**
 * Only init one physics instance
 * ```ts
 * await Physics.init();  
 * ```
 * @group Plugin
 */
/**
 * @internal
 */
export let Physics = new _Physics();
export { Ammo };
