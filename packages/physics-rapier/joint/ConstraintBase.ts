import { ComponentBase } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../Physics';
import { Rigidbody } from '../rigidbody/Rigidbody';

/**
 * Shared base for all joint components.
 *
 * Subclasses set `connectedBody` (the second body, with this Object3D's body
 * being the first) and override `buildJointData()` to return a `RAPIER.JointData`.
 */
export abstract class ConstraintBase<T extends RAPIER.ImpulseJoint = RAPIER.ImpulseJoint> extends ComponentBase {
    protected _joint: T;

    /** The other body of the constraint. */
    public connectedBody: Rigidbody;

    /** Whether contacts are computed between the two connected bodies. Default: false. */
    public collisionsEnabled: boolean = false;

    /** Whether to wake up the bodies when the joint is created. Default: true. */
    public wakeUpOnCreate: boolean = true;

    public async start(): Promise<void> {
        if (!Physics.isInited) throw new Error(`${this.constructor.name}.start: Physics not initialized.`);
        if (!this.connectedBody) throw new Error(`${this.constructor.name}.start: connectedBody is required.`);

        const ownRb = this.object3D.getComponent(Rigidbody);
        if (!ownRb) throw new Error(`${this.constructor.name}.start: this Object3D has no Rigidbody component.`);

        const [body1, body2] = await Promise.all([ownRb.wait(), this.connectedBody.wait()]);

        const data = this.buildJointData();
        this._joint = Physics.world.createImpulseJoint(data, body1, body2, this.wakeUpOnCreate) as T;
        if (this.collisionsEnabled) this._joint.setContactsEnabled(true);

        this.afterStart();
    }

    /** Subclasses build their JointData (revolute, fixed, etc.). */
    protected abstract buildJointData(): RAPIER.JointData;

    /** Hook for subclasses to apply per-joint settings (limits, motor) post-creation. */
    protected afterStart(): void { /* override */ }

    public destroy(force?: boolean): void {
        if (this._joint && Physics.world) Physics.world.removeImpulseJoint(this._joint, true);
        this._joint = null;
        super.destroy(force);
    }

    /** Native impulse joint. Touching this opts out of cross-backend portability. */
    public get native(): T { return this._joint; }
}
