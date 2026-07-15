import { Vector3 } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { ConstraintBase } from './ConstraintBase';
import { TempPhyMath } from '../utils/TempPhyMath';

/**
 * Slider (prismatic) joint — 1 linear DOF along `axis`.
 *
 * Mirrors `@orillusion/physics`'s `SliderConstraint`.
 */
export class SliderJoint extends ConstraintBase<RAPIER.PrismaticImpulseJoint> {
    public anchorSelf: Vector3 = new Vector3();
    public anchorTarget: Vector3 = new Vector3();
    public axis: Vector3 = Vector3.X_AXIS.clone();

    private _limits: [number, number] | null = null;
    private _motor: { targetVel: number; factor: number } | null = null;

    protected buildJointData(): RAPIER.JointData {
        return RAPIER.JointData.prismatic(
            TempPhyMath.toRVec(this.anchorSelf, TempPhyMath.tmpVecA),
            TempPhyMath.toRVec(this.anchorTarget, TempPhyMath.tmpVecB),
            TempPhyMath.toRVec(this.axis, TempPhyMath.tmpVecC),
        );
    }

    protected afterStart(): void {
        if (this._limits) this._joint.setLimits(this._limits[0], this._limits[1]);
        if (this._motor) this._joint.configureMotorVelocity(this._motor.targetVel, this._motor.factor);
    }

    public setLimit(low: number, high: number): void {
        this._limits = [low, high];
        this._joint?.setLimits(low, high);
    }

    public setMotor(targetVel: number, factor: number = 1): void {
        this._motor = { targetVel, factor };
        this._joint?.configureMotorVelocity(targetVel, factor);
    }
}
