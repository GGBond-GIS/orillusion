import { Vector3 } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { ConstraintBase } from './ConstraintBase';
import { TempPhyMath } from '../utils/TempPhyMath';

/**
 * Spherical (ball-and-socket) joint — 3 angular DOFs free, position locked.
 *
 * Replaces both `PointToPointConstraint` and `ConeTwistConstraint` from the
 * ammo plugin (Rapier folds them into one primitive).
 */
export class SphericalJoint extends ConstraintBase<RAPIER.SphericalImpulseJoint> {
    public anchorSelf: Vector3 = new Vector3();
    public anchorTarget: Vector3 = new Vector3();

    protected buildJointData(): RAPIER.JointData {
        return RAPIER.JointData.spherical(
            TempPhyMath.toRVec(this.anchorSelf, TempPhyMath.tmpVecA),
            TempPhyMath.toRVec(this.anchorTarget, TempPhyMath.tmpVecB),
        );
    }
}
