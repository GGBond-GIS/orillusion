import { Vector3 } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { ConstraintBase } from './ConstraintBase';
import { TempPhyMath } from '../utils/TempPhyMath';

/**
 * Spring joint — Hooke's law spring connecting two anchors with a rest length.
 * Replaces ammo plugin's `Generic6DofSpringConstraint` for the simple case.
 */
export class SpringJoint extends ConstraintBase<RAPIER.ImpulseJoint> {
    public anchorSelf: Vector3 = new Vector3();
    public anchorTarget: Vector3 = new Vector3();
    public restLength: number = 1;
    public stiffness: number = 100;
    public damping: number = 10;

    protected buildJointData(): RAPIER.JointData {
        return RAPIER.JointData.spring(
            this.restLength,
            this.stiffness,
            this.damping,
            TempPhyMath.toRVec(this.anchorSelf, TempPhyMath.tmpVecA),
            TempPhyMath.toRVec(this.anchorTarget, TempPhyMath.tmpVecB),
        );
    }
}
