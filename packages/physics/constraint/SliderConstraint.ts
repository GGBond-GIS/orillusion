import { Ammo, Physics } from '../Physics';
import { TempPhyMath } from '../utils/TempPhyMath';
import { ConstraintBase } from './ConstraintBase';

/**
 * Slider joint constraint
 */
export class SliderConstraint extends ConstraintBase<Ammo.btSliderConstraint> {
    private _lowerLinLimit: number = -1e30;
    private _upperLinLimit: number = 1e30;
    private _lowerAngLimit: number = -Math.PI;
    private _upperAngLimit: number = Math.PI;
    private _poweredLinMotor: boolean = false;
    private _maxLinMotorForce: number = 0;
    private _targetLinMotorVelocity: number = 0;

    /**
     * Whether to use the linear reference frame.
     * Default value `true`
     */
    public useLinearReferenceFrame: boolean = true;

    protected createConstraint(selfBody: Ammo.btRigidBody, targetBody: Ammo.btRigidBody | null): void {
        const pivotInA = TempPhyMath.toBtVec(this.pivotSelf);
        const rotInA = TempPhyMath.toBtQua(this.rotationSelf);

        const frameInA = Physics.TEMP_TRANSFORM;
        frameInA.setIdentity();
        frameInA.setOrigin(pivotInA);
        frameInA.setRotation(rotInA);

        if (targetBody) {
            const pivotInB = TempPhyMath.toBtVec(this.pivotTarget, TempPhyMath.tmpVecB);
            const rotInB = TempPhyMath.toBtQua(this.rotationTarget, TempPhyMath.tmpQuaB);
            const frameInB = new Ammo.btTransform();
            frameInB.setIdentity();
            frameInB.setOrigin(pivotInB);
            frameInB.setRotation(rotInB);
            this._constraint = new Ammo.btSliderConstraint(selfBody, targetBody, frameInA, frameInB, this.useLinearReferenceFrame);
            Ammo.destroy(frameInB);
        } else {
            this._constraint = new Ammo.btSliderConstraint(selfBody, frameInA, this.useLinearReferenceFrame);
        }

        this._constraint.setLowerLinLimit(this._lowerLinLimit);
        this._constraint.setUpperLinLimit(this._upperLinLimit);
        this._constraint.setLowerAngLimit(this._lowerAngLimit);
        this._constraint.setUpperAngLimit(this._upperAngLimit);

        this._constraint.setPoweredLinMotor(this._poweredLinMotor);
        this._constraint.setMaxLinMotorForce(this._maxLinMotorForce);
        this._constraint.setTargetLinMotorVelocity(this._targetLinMotorVelocity);
    }

    /**
     * Lower limit of linear motion.
     * Default value `-1e30` means no limit
     */
    public get lowerLinLimit(): number {
        return this._lowerLinLimit;
    }
    public set lowerLinLimit(value: number) {
        this._lowerLinLimit = value;
        this._constraint?.setLowerLinLimit(value);
    }

    /**
     * Upper limit of linear motion.
     * Default value `1e30` means no limit
     */
    public get upperLinLimit(): number {
        return this._upperLinLimit;
    }
    public set upperLinLimit(value: number) {
        this._upperLinLimit = value;
        this._constraint?.setUpperLinLimit(value);
    }

    /**
     * Lower limit of angular motion.
     * Default value `-Math.PI`
     */
    public get lowerAngLimit(): number {
        return this._lowerAngLimit;
    }
    public set lowerAngLimit(value: number) {
        this._lowerAngLimit = value;
        this._constraint?.setLowerAngLimit(value);
    }

    /**
     * Upper limit of angular motion.
     * Default value `Math.PI`
     */
    public get upperAngLimit(): number {
        return this._upperAngLimit;
    }
    public set upperAngLimit(value: number) {
        this._upperAngLimit = value;
        this._constraint?.setUpperAngLimit(value);
    }

    /**
     * Whether to enable the linear motor.
     * Default value `false`
     */
    public get poweredLinMotor(): boolean {
        return this._poweredLinMotor;
    }
    public set poweredLinMotor(value: boolean) {
        this._poweredLinMotor = value;
        this._constraint?.setPoweredLinMotor(value)
    }

    /**
     * Maximum force of the linear motor.
     * Default value `0`
     */
    public get maxLinMotorForce(): number {
        return this._maxLinMotorForce;
    }
    public set maxLinMotorForce(value: number) {
        this._maxLinMotorForce = value;
        this._constraint?.setMaxLinMotorForce(value)
    }

    /**
     * Target velocity of the linear motor.
     * Default value `0`
     */
    public get targetLinMotorVelocity(): number {
        return this._targetLinMotorVelocity;
    }
    public set targetLinMotorVelocity(value: number) {
        this._targetLinMotorVelocity = value;
        this._constraint?.setTargetLinMotorVelocity(value)
    }
}
