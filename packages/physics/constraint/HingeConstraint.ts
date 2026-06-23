import { Vector3 } from '@orillusion/core';
import { Ammo, Physics } from '../Physics';
import { TempPhyMath } from '../utils/TempPhyMath';
import { ConstraintBase } from './ConstraintBase';

/**
 * Hinge constraint.
 */
export class HingeConstraint extends ConstraintBase<Ammo.btHingeConstraint> {
    /**
     * Hinge axis direction on this rigid body.
     * Default `Vector3.UP`
     */
    public axisSelf: Vector3 = Vector3.UP;
    /**
     * Hinge axis direction on the target rigid body.
     * Default `Vector3.UP`
     */
    public axisTarget: Vector3 = Vector3.UP;
    /**
     * Whether to use this rigid body's reference frame.
     * Default `true`
     */
    public useReferenceFrameA: boolean = true;
    /**
     * Whether to use the two-bodies-transform overload.
     * If true, the transforms of both rigid bodies are used as the constraint's reference frames.
     * Default `false`
     */
    public useTwoBodiesTransformOverload: boolean = false;

    private _pendingLimits: [number, number, number, number, number?];
    private _pendingMotorConfig: [boolean, number, number];

    /**
     * Get the current limit parameters.
     */
    public get limitInfo() { return this._pendingLimits; }
    /**
     * Get the current motor configuration parameters.
     */
    public get motorConfigInfo() { return this._pendingMotorConfig; }

    /**
     * Set the rotation limits of the hinge constraint.
     * @param low - The minimum hinge angle (lower limit).
     * @param high - The maximum hinge angle (upper limit).
     * @param softness - Softness coefficient indicating how soft the limit is. In the range 0 to 1; 1 means fully rigid.
     * @param biasFactor - Bias factor controlling the strength of the limit's restoring force. Typically in the range 0 to 1.
     * @param relaxationFactor - (Optional) Relaxation factor controlling how quickly the limit recovers. Larger values mean faster recovery.
     */
    public setLimit(low: number, high: number, softness: number, biasFactor: number, relaxationFactor?: number): void {
        this._pendingLimits = [low, high, softness, biasFactor, relaxationFactor];
        this._constraint?.setLimit(...this._pendingLimits);
    };

    /**
     * Enable or disable the angular motor.
     * @param enableMotor - Whether to enable the motor.
     * @param targetVelocity - The motor's target velocity.
     * @param maxMotorImpulse - The motor's maximum impulse.
     */
    public enableAngularMotor(enableMotor: boolean, targetVelocity: number, maxMotorImpulse: number): void {
        this._pendingMotorConfig = [enableMotor, targetVelocity, maxMotorImpulse]
        this._constraint?.enableAngularMotor(...this._pendingMotorConfig)
    };

    protected createConstraint(selfBody: Ammo.btRigidBody, targetBody: Ammo.btRigidBody | null) {
        const constraintType = !targetBody ?
            'SINGLE_BODY_TRANSFORM' : this.useTwoBodiesTransformOverload ?
                'TWO_BODIES_TRANSFORM' : 'TWO_BODIES_PIVOT';

        const pivotInA = TempPhyMath.toBtVec(this.pivotSelf, TempPhyMath.tmpVecA);
        const pivotInB = TempPhyMath.toBtVec(this.pivotTarget, TempPhyMath.tmpVecB);

        switch (constraintType) {
            case 'SINGLE_BODY_TRANSFORM':
                const frameA_single = Physics.TEMP_TRANSFORM;
                frameA_single.setIdentity();
                frameA_single.setOrigin(pivotInA);
                frameA_single.setRotation(TempPhyMath.toBtQua(this.rotationSelf));

                this._constraint = new Ammo.btHingeConstraint(selfBody, frameA_single, this.useReferenceFrameA);
                break;
            case 'TWO_BODIES_TRANSFORM':
                const frameA = Physics.TEMP_TRANSFORM;
                frameA.setIdentity();
                frameA.setOrigin(pivotInA);
                frameA.setRotation(TempPhyMath.toBtQua(this.rotationSelf));

                const frameB = new Ammo.btTransform();
                frameB.setIdentity();
                frameB.setOrigin(pivotInB);
                frameB.setRotation(TempPhyMath.toBtQua(this.rotationTarget, TempPhyMath.tmpQuaB));

                this._constraint = new Ammo.btHingeConstraint(selfBody, targetBody, frameA, frameB, this.useReferenceFrameA);
                Ammo.destroy(frameB);
                break;
            case 'TWO_BODIES_PIVOT':
                const axisSelf = TempPhyMath.toBtVec(this.axisSelf, TempPhyMath.tmpVecC);
                const axisTarget = TempPhyMath.toBtVec(this.axisTarget, TempPhyMath.tmpVecD);

                this._constraint = new Ammo.btHingeConstraint(selfBody, targetBody, pivotInA, pivotInB, axisSelf, axisTarget);
                break;
            default:
                console.error('Invalid constraint type');
                return;
        }

        this._pendingLimits && this.setLimit(...this._pendingLimits)
        this._pendingMotorConfig && this.enableAngularMotor(...this._pendingMotorConfig)
    }
}
