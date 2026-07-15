import { ComponentBase, Vector3, Quaternion } from '@orillusion/core';
import { Ammo, Physics } from '../Physics';
import { Rigidbody } from '../rigidbody/Rigidbody';

/**
 * Constraint base class
 */
export class ConstraintBase<T extends Ammo.btTypedConstraint> extends ComponentBase {
    protected _targetRigidbody: Rigidbody;
    protected _constraint: T;
    private _initResolve!: () => void;
    private _initializationPromise: Promise<void> = new Promise<void>(r => this._initResolve = r);
    private _breakingThreshold: number;

    /**
     * The pivot point for the self body
     * `FrameInA Origin`
     */
    public pivotSelf: Vector3 = new Vector3();
    /**
     * The pivot point for the target body
     * `FrameInB Origin`
     */
    public pivotTarget: Vector3 = new Vector3();
    /**
     * The rotation for the self body
     * `FrameInA Rotation`
     */
    public rotationSelf: Quaternion = new Quaternion();
    /**
     * The rotation for the target body
     * `FrameInB Rotation`
     */
    public rotationTarget: Quaternion = new Quaternion();

    public disableCollisionsBetweenLinkedBodies: boolean = true;

    /**
     * Breaking impulse threshold. The larger the value, the harder the constraint is to break.
     */
    public get breakingThreshold() {
        return this._breakingThreshold;
    }

    public set breakingThreshold(value: number) {
        this._breakingThreshold = value;
        this._constraint?.setBreakingImpulseThreshold(value);
    }

    async start() {
        const selfRb = this.object3D.getComponent(Rigidbody);
        if (!selfRb) {
            throw new Error(`${this.constructor.name} requires a rigidbody on the object.`);
        }

        // Ensure the rigid body has finished initializing
        if (!selfRb.btBodyInited) {
            await selfRb.wait()
        }

        if (this._targetRigidbody && !this._targetRigidbody.btBodyInited) {
            await this._targetRigidbody.wait()
        }

        // Create the constraint
        this.createConstraint(selfRb.btRigidbody, this._targetRigidbody?.btRigidbody);

        if (this._constraint) {
            if (this._breakingThreshold != null) {
                this._constraint.setBreakingImpulseThreshold(this._breakingThreshold);
            }
            Physics.world.addConstraint(this._constraint, this.disableCollisionsBetweenLinkedBodies);
            this._initResolve();
        }
    }

    /**
     * Subclasses implement the specific constraint creation logic
     * @param selfBody
     * @param targetBody
     */
    protected createConstraint(selfBody: Ammo.btRigidBody, targetBody: Ammo.btRigidBody | null) { }

    /**
     * Get the constraint instance
     */
    public get constraint(): T {
        if (!this._constraint) {
            console.warn('Constraint has not been initialized. Please use wait() to get the constraint instance asynchronously.');
        }
        return this._constraint;
    }

    /**
     * Asynchronously retrieve the fully initialized constraint instance
     */
    public async wait(): Promise<T> {
        await this._initializationPromise;
        return this._constraint!;
    }

    /**
     * Reset the constraint: destroy the current constraint instance, recreate it, and return the new constraint instance
     */
    public async resetConstraint(): Promise<T> {
        if (this._constraint) {
            Physics.rigidBodyUtil.destroyConstraint(this._constraint)
            this._constraint = null;

            await this.start();
            return this._constraint!;
        }
        console.warn('No constraint to reset.');
    }

    /**
     * Target rigid body component
     */
    public get targetRigidbody(): Rigidbody {
        return this._targetRigidbody;
    }

    public set targetRigidbody(value: Rigidbody) {
        this._targetRigidbody = value;
    }

    public destroy(force?: boolean): void {
        Physics.rigidBodyUtil.destroyConstraint(this._constraint);
        this._constraint = null;
        this._targetRigidbody = null;
        super.destroy(force);
    }
}
