import { Vector3 } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { ConstraintBase } from './ConstraintBase';
import { TempPhyMath } from '../utils/TempPhyMath';

/**
 * Bit-mask of joint axes to lock. Combine with `|`. Each unset axis remains
 * free; each set axis is locked. Default `LockAll - LinX` would lock 5 axes
 * leaving X translation free.
 */
export const JointAxis = {
    LinX: 1,
    LinY: 2,
    LinZ: 4,
    AngX: 8,
    AngY: 16,
    AngZ: 32,
    LockAll: 1 | 2 | 4 | 8 | 16 | 32,
} as const;

/**
 * Generic 6-DOF joint — pick which axes to lock via `lockedAxes` mask.
 *
 * Replaces `Generic6DofConstraint` and `Generic6DofSpringConstraint` from
 * the ammo plugin (Rapier's `GenericJoint` natively supports both).
 */
export class GenericJoint extends ConstraintBase<RAPIER.GenericImpulseJoint> {
    public anchorSelf: Vector3 = new Vector3();
    public anchorTarget: Vector3 = new Vector3();
    public axis: Vector3 = Vector3.X_AXIS.clone();
    /** Which axes are locked. Default: all 5 except LinX (slider-like). */
    public lockedAxes: number = JointAxis.LinY | JointAxis.LinZ | JointAxis.AngX | JointAxis.AngY | JointAxis.AngZ;

    protected buildJointData(): RAPIER.JointData {
        return RAPIER.JointData.generic(
            TempPhyMath.toRVec(this.anchorSelf, TempPhyMath.tmpVecA),
            TempPhyMath.toRVec(this.anchorTarget, TempPhyMath.tmpVecB),
            TempPhyMath.toRVec(this.axis, TempPhyMath.tmpVecC),
            this.lockedAxes,
        );
    }
}
