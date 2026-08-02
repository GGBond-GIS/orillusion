import { Vector3, Quaternion } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { ConstraintBase } from './ConstraintBase';
import { TempPhyMath } from '../utils/TempPhyMath';

/**
 * Fixed joint — locks all 6 DOFs between two bodies. Mirrors
 * `@orillusion/physics`'s `FixedConstraint`.
 */
export class FixedJoint extends ConstraintBase<RAPIER.FixedImpulseJoint> {
    public anchorSelf: Vector3 = new Vector3();
    public anchorTarget: Vector3 = new Vector3();
    public frameSelf: Quaternion = new Quaternion();
    public frameTarget: Quaternion = new Quaternion();

    protected buildJointData(): RAPIER.JointData {
        return RAPIER.JointData.fixed(
            TempPhyMath.toRVec(this.anchorSelf, TempPhyMath.tmpVecA),
            TempPhyMath.toRQuat(this.frameSelf, TempPhyMath.tmpQuaA),
            TempPhyMath.toRVec(this.anchorTarget, TempPhyMath.tmpVecB),
            TempPhyMath.toRQuat(this.frameTarget, TempPhyMath.tmpQuaB),
        );
    }
}
