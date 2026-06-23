import { Ammo, Physics } from '../Physics';
import { TempPhyMath } from '../utils/TempPhyMath'
import { ConstraintBase } from './ConstraintBase';

/**
 * Cone twist constraint
 */
export class ConeTwistConstraint extends ConstraintBase<Ammo.btConeTwistConstraint> {
    private _twistSpan: number = Math.PI;
    private _swingSpan1: number = Math.PI;
    private _swingSpan2: number = Math.PI;

    /**
     * Twist angle limit; the twist range around the X axis.
     * Default value `Math.PI`
     */
    public get twistSpan() {
        return this._twistSpan;
    }
    public set twistSpan(value: number) {
        this._twistSpan = value;
        this._constraint?.setLimit(3, value);
    }

    /**
     * Swing angle limit 1; the swing range around the Y axis.
     * Default value `Math.PI`
     */
    public get swingSpan1() {
        return this._swingSpan1;
    }
    public set swingSpan1(value: number) {
        this._swingSpan1 = value;
        this._constraint?.setLimit(5, value);
    }

    /**
     * Swing angle limit 2; the swing range around the Z axis.
     * Default value `Math.PI`
     */
    public get swingSpan2() {
        return this._swingSpan2;
    }
    public set swingSpan2(value: number) {
        this._swingSpan2 = value;
        this._constraint?.setLimit(4, value);
    }

    protected createConstraint(selfBody: Ammo.btRigidBody, targetBody: Ammo.btRigidBody | null) {
        const frameInA = TempPhyMath.toBtVec(this.pivotSelf);
        const rotInA = TempPhyMath.toBtQua(this.rotationSelf);

        const transformA = Physics.TEMP_TRANSFORM;
        transformA.setIdentity();
        transformA.setOrigin(frameInA);
        transformA.setRotation(rotInA);

        if (targetBody) {
            const frameInB = TempPhyMath.toBtVec(this.pivotTarget, TempPhyMath.tmpVecB);
            const rotInB = TempPhyMath.toBtQua(this.rotationTarget, TempPhyMath.tmpQuaB);
            const transformB = new Ammo.btTransform();
            transformB.setIdentity();
            transformB.setOrigin(frameInB);
            transformB.setRotation(rotInB);

            this._constraint = new Ammo.btConeTwistConstraint(selfBody, targetBody, transformA, transformB);
            Ammo.destroy(transformB);
        } else {
            this._constraint = new Ammo.btConeTwistConstraint(selfBody, transformA);
        }

        //********************************************
        //* The current version of Ammo cannot set softness / bias / relaxation
        //* Index 3 is m_twistSpan axe X
        //* Index 4 is m_swingSpan2 axe Z
        //* Index 5 is m_swingSpan1 axe Y
        //********************************************

        this._constraint.setLimit(3, this.twistSpan);
        this._constraint.setLimit(5, this.swingSpan1);
        this._constraint.setLimit(4, this.swingSpan2);
    }
}
