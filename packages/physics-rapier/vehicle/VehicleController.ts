import { ComponentBase, Vector3 } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../Physics';
import { TempPhyMath } from '../utils/TempPhyMath';
import { Rigidbody } from '../rigidbody/Rigidbody';

export interface WheelOptions {
    /** Wheel attach point on chassis (chassis-local). */
    chassisConnection: Vector3;
    /** Suspension direction in chassis-local space. Typically -Y (down). */
    suspensionDirection?: Vector3;
    /** Wheel rolling axle direction in chassis-local space. Typically +X. */
    axleDirection?: Vector3;
    /** Resting suspension length. */
    suspensionRestLength: number;
    /** Wheel radius. */
    radius: number;
    /** Suspension stiffness coefficient. Default 30. */
    stiffness?: number;
    /** Damping when compressing the suspension. Default 0.83. */
    dampingCompression?: number;
    /** Damping when relaxing the suspension. Default 0.88. */
    dampingRelaxation?: number;
    /** Tire friction coefficient (longitudinal). Default 1000. */
    frictionSlip?: number;
    /** Side-slip friction stiffness. Default 1. */
    sideFrictionStiffness?: number;
}

/**
 * Vehicle controller — Rapier-only. Replaces the bare `btRaycastVehicle`
 * usage in the ammo plugin's car sample.
 *
 * This component must be added to the same Object3D as a `Rigidbody`
 * (the chassis); it auto-discovers the chassis body via `wait()`.
 *
 * @group Components
 */
export class VehicleController extends ComponentBase {
    private _initResolve!: () => void;
    private _initializationPromise: Promise<void> = new Promise<void>(r => this._initResolve = r);

    private _controller: RAPIER.DynamicRayCastVehicleController;
    private _vehicleInited: boolean = false;
    private _pendingWheels: WheelOptions[] = [];

    /** Up axis index (0=X, 1=Y, 2=Z). Default 1 (+Y). */
    public indexUpAxis: number = 1;
    /** Forward axis index (0=X, 1=Y, 2=Z). Default 2 (+Z). */
    public indexForwardAxis: number = 2;

    public async start(): Promise<void> {
        if (!Physics.isInited) throw new Error('VehicleController.start: Physics not initialized.');

        const chassisRb = this.object3D.getComponent(Rigidbody);
        if (!chassisRb) throw new Error('VehicleController.start: this Object3D has no Rigidbody (chassis) component.');
        const chassisBody = await chassisRb.wait();

        this._controller = Physics.world.createVehicleController(chassisBody);
        this._controller.indexUpAxis = this.indexUpAxis;
        // Note: Rapier exposes the forward axis setter under the typo'd name `setIndexForwardAxis`.
        (this._controller as any).setIndexForwardAxis = this.indexForwardAxis;

        // Apply queued wheels.
        for (const w of this._pendingWheels) this._addWheelInternal(w);
        this._pendingWheels = [];

        Physics.addPreStep(this._preStep);
        this._vehicleInited = true;
        this._initResolve();
    }

    public destroy(force?: boolean): void {
        Physics.removePreStep(this._preStep);
        if (this._controller && Physics.world) Physics.world.removeVehicleController(this._controller);
        this._controller = null;
        this._vehicleInited = false;
        super.destroy(force);
    }

    private _preStep = (dt: number) => {
        if (this._vehicleInited) this._controller.updateVehicle(dt);
    };

    /** Append a wheel. Can be called pre- or post-start. */
    public addWheel(opts: WheelOptions): void {
        if (this._vehicleInited) {
            this._addWheelInternal(opts);
        } else {
            this._pendingWheels.push(opts);
        }
    }

    private _addWheelInternal(w: WheelOptions): void {
        const dir = w.suspensionDirection ?? new Vector3(0, -1, 0);
        const axle = w.axleDirection ?? new Vector3(1, 0, 0);
        this._controller.addWheel(
            TempPhyMath.toRVec(w.chassisConnection, TempPhyMath.tmpVecA),
            TempPhyMath.toRVec(dir, TempPhyMath.tmpVecB),
            TempPhyMath.toRVec(axle, TempPhyMath.tmpVecC),
            w.suspensionRestLength,
            w.radius,
        );
        const i = this._controller.numWheels() - 1;
        if (w.stiffness != null) this._controller.setWheelSuspensionStiffness(i, w.stiffness);
        if (w.dampingCompression != null) this._controller.setWheelSuspensionCompression(i, w.dampingCompression);
        if (w.dampingRelaxation != null) this._controller.setWheelSuspensionRelaxation(i, w.dampingRelaxation);
        if (w.frictionSlip != null) this._controller.setWheelFrictionSlip(i, w.frictionSlip);
        if (w.sideFrictionStiffness != null) this._controller.setWheelSideFrictionStiffness(i, w.sideFrictionStiffness);
    }

    public setEngineForce(force: number, wheelIdx: number): void {
        this._controller?.setWheelEngineForce(wheelIdx, force);
    }

    public setBrake(brake: number, wheelIdx: number): void {
        this._controller?.setWheelBrake(wheelIdx, brake);
    }

    public setSteering(angle: number, wheelIdx: number): void {
        this._controller?.setWheelSteering(wheelIdx, angle);
    }

    public numWheels(): number {
        return this._controller?.numWheels() ?? 0;
    }

    public wheelInContact(i: number): boolean {
        return this._controller?.wheelIsInContact(i) ?? false;
    }

    public wheelChassisConnectionPoint(i: number): Vector3 | null {
        const v = this._controller?.wheelChassisConnectionPointCs(i);
        return v ? new Vector3(v.x, v.y, v.z) : null;
    }

    /** Current vehicle speed in km/h. Mirrors ammo's `getCurrentSpeedKmHour`. */
    public currentSpeedKmHour(): number {
        return this._controller ? this._controller.currentVehicleSpeed() * 3.6 : 0;
    }

    public async wait(): Promise<void> { await this._initializationPromise; }

    public get native(): RAPIER.DynamicRayCastVehicleController { return this._controller; }
}
