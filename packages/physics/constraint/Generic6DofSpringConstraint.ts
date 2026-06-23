import { Vector3 } from '@orillusion/core';
import { Ammo, Physics } from '../Physics';
import { TempPhyMath } from '../utils/TempPhyMath';
import { ConstraintBase } from './ConstraintBase';

/**
 * Generic six-degree-of-freedom constraint with spring behavior.
 */
export class Generic6DofSpringConstraint extends ConstraintBase<Ammo.btGeneric6DofSpringConstraint> {
    private _linearLowerLimit: Vector3 = new Vector3(-1e30, -1e30, -1e30);
    private _linearUpperLimit: Vector3 = new Vector3(1e30, 1e30, 1e30);
    private _angularLowerLimit: Vector3 = new Vector3(-Math.PI, -Math.PI, -Math.PI);
    private _angularUpperLimit: Vector3 = new Vector3(Math.PI, Math.PI, Math.PI);

    // Cached constraint configuration parameters
    private _springParams: { index: number, onOff: boolean }[] = [];
    private _stiffnessParams: { index: number, stiffness: number }[] = [];
    private _dampingParams: { index: number, damping: number }[] = [];
    private _equilibriumPointParams: { index?: number, val?: number }[] = [];

    /**
     * default: `-1e30, -1e30, -1e30`
     */
    public get linearLowerLimit(): Vector3 {
        return this._linearLowerLimit;
    }
    public set linearLowerLimit(value: Vector3) {
        this._linearLowerLimit.copy(value);
        this._constraint?.setLinearLowerLimit(TempPhyMath.toBtVec(value));
    }

    /**
     * default: `1e30, 1e30, 1e30`
     */
    public get linearUpperLimit(): Vector3 {
        return this._linearUpperLimit;
    }
    public set linearUpperLimit(value: Vector3) {
        this._linearUpperLimit.copy(value);
        this._constraint?.setLinearUpperLimit(TempPhyMath.toBtVec(value));
    }

    /**
     * default: `-Math.PI, -Math.PI, -Math.PI`
     */
    public get angularLowerLimit(): Vector3 {
        return this._angularLowerLimit;
    }
    public set angularLowerLimit(value: Vector3) {
        this._angularLowerLimit.copy(value);
        this._constraint?.setAngularLowerLimit(TempPhyMath.toBtVec(value));
    }

    /**
     * default: `Math.PI, Math.PI, Math.PI`
     */
    public get angularUpperLimit(): Vector3 {
        return this._angularUpperLimit;
    }
    public set angularUpperLimit(value: Vector3) {
        this._angularUpperLimit.copy(value);
        this._constraint?.setAngularUpperLimit(TempPhyMath.toBtVec(value));
    }

    /**
     * Enable or disable the spring on a given axis.
     * @param index Spring index
     * @param onOff Whether to enable it
     */
    public enableSpring(index: number, onOff: boolean): void {
        if (this._constraint) {
            this._constraint.enableSpring(index, onOff);
        } else {
            this._springParams.push({ index, onOff });
        }
    }

    /**
     * Set the stiffness of the spring.
     * @param index Spring index
     * @param stiffness Stiffness value
     */
    public setStiffness(index: number, stiffness: number): void {
        if (this._constraint) {
            this._constraint.setStiffness(index, stiffness);
        } else {
            this._stiffnessParams.push({ index, stiffness });
        }
    }

    /**
     * Set the damping of the spring.
     * @param index Spring index
     * @param damping Damping value
     */
    public setDamping(index: number, damping: number): void {
        if (this._constraint) {
            this._constraint.setDamping(index, damping);
        } else {
            this._dampingParams.push({ index, damping });
        }
    }

    /**
     * Set the equilibrium point of the spring.
     *
     * @param index Spring index (optional). If omitted, the equilibrium points of all springs are reset.
     * @param val Equilibrium-point value (optional). If provided, the specified spring's equilibrium point is set to this value.
     *
     * - With no arguments, resets the equilibrium points of all springs.
     * - With only `index`, sets the equilibrium point of the specified spring (the value is determined internally).
     * - With both `index` and `val`, sets the equilibrium point of the specified spring to `val`.
     */
    public setEquilibriumPoint(index?: number, val?: number): void {
        if (this._constraint) {
            if (index == undefined) {
                this._constraint.setEquilibriumPoint();
            } else if (val == undefined) {
                this._constraint.setEquilibriumPoint(index);
            } else {
                this._constraint.setEquilibriumPoint(index, val);
            }
        } else {
            this._equilibriumPointParams.push({ index, val });
        }
    }

    /**
     * Whether to use the linear reference frame.
     * Default `true`
     */
    public useLinearFrameReferenceFrame: boolean = true;

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

            this._constraint = new Ammo.btGeneric6DofSpringConstraint(selfBody, targetBody, frameInA, frameInB, this.useLinearFrameReferenceFrame);
            Ammo.destroy(frameInB);
        } else {
            this._constraint = new Ammo.btGeneric6DofSpringConstraint(selfBody, frameInA, this.useLinearFrameReferenceFrame);
        }

        this.setConstraint()
    }

    private setConstraint() {

        // Apply linear and angular limits
        this._constraint.setLinearLowerLimit(TempPhyMath.toBtVec(this._linearLowerLimit));
        this._constraint.setLinearUpperLimit(TempPhyMath.toBtVec(this._linearUpperLimit));
        this._constraint.setAngularLowerLimit(TempPhyMath.toBtVec(this._angularLowerLimit));
        this._constraint.setAngularUpperLimit(TempPhyMath.toBtVec(this._angularUpperLimit));

        // Apply cached spring parameters
        this._springParams.forEach(param => this._constraint.enableSpring(param.index, param.onOff));
        this._stiffnessParams.forEach(param => this._constraint.setStiffness(param.index, param.stiffness));
        this._dampingParams.forEach(param => this._constraint.setDamping(param.index, param.damping));
        this._equilibriumPointParams.forEach(param => this.setEquilibriumPoint(param.index, param.val));

        // Clear the cache
        this._springParams = [];
        this._stiffnessParams = [];
        this._dampingParams = [];
        this._equilibriumPointParams = [];
    }
}
