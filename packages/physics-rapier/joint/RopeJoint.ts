import { Vector3 } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { ConstraintBase } from './ConstraintBase';
import { TempPhyMath } from '../utils/TempPhyMath';

/**
 * Rope joint — bodies cannot drift further apart than `length`, but may
 * approach freely. Rapier-specific (not present in ammo plugin).
 */
export class RopeJoint extends ConstraintBase<RAPIER.ImpulseJoint> {
    public anchorSelf: Vector3 = new Vector3();
    public anchorTarget: Vector3 = new Vector3();
    public length: number = 1;

    protected buildJointData(): RAPIER.JointData {
        return RAPIER.JointData.rope(
            this.length,
            TempPhyMath.toRVec(this.anchorSelf, TempPhyMath.tmpVecA),
            TempPhyMath.toRVec(this.anchorTarget, TempPhyMath.tmpVecB),
        );
    }
}
