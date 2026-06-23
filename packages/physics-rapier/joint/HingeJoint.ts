import { Vector3 } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { ConstraintBase } from './ConstraintBase';
import { TempPhyMath } from '../utils/TempPhyMath';

/**
 * Hinge (revolute) joint — 1 angular DOF around `axis`.
 *
 * Mirrors `@orillusion/physics`'s `HingeConstraint` symbol and method names.
 */
export class HingeJoint extends ConstraintBase<RAPIER.RevoluteImpulseJoint> {
    /** Anchor point on body A (own Object3D's Rigidbody), in local space. */
    public anchorSelf: Vector3 = new Vector3();
    /** Anchor point on body B (`connectedBody`), in local space. */
    public anchorTarget: Vector3 = new Vector3();
    /** Hinge axis, defaults to world up. */
    public axis: Vector3 = Vector3.UP.clone();

    private _limits: [number, number] | null = null;
    private _motor: { targetVel: number; factor: number } | null = null;

    protected buildJointData(): RAPIER.JointData {
        return RAPIER.JointData.revolute(
            TempPhyMath.toRVec(this.anchorSelf, TempPhyMath.tmpVecA),
            TempPhyMath.toRVec(this.anchorTarget, TempPhyMath.tmpVecB),
            TempPhyMath.toRVec(this.axis, TempPhyMath.tmpVecC),
        );
    }

    protected afterStart(): void {
        if (this._limits) this._joint.setLimits(this._limits[0], this._limits[1]);
        if (this._motor) this._joint.configureMotorVelocity(this._motor.targetVel, this._motor.factor);
    }

    /** Set rotation limits (radians). */
    public setLimit(low: number, high: number): void {
        this._limits = [low, high];
        this._joint?.setLimits(low, high);
    }

    /**
     * Configure the angular motor for velocity control.
     * @param targetVel - Target angular velocity (rad/s).
     * @param factor - Damping/strength factor.
     */
    public setMotor(targetVel: number, factor: number = 1): void {
        this._motor = { targetVel, factor };
        this._joint?.configureMotorVelocity(targetVel, factor);
    }
}
