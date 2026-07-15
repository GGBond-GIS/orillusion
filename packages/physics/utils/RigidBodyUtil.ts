import { Vector3, Quaternion, Object3D } from '@orillusion/core';
import { Physics, Ammo } from '../Physics';
import { TempPhyMath } from './TempPhyMath';

/**
 * Provides a set of methods related to AMMO rigid bodies
 */
export class RigidBodyUtil {
    /**
     * Creates an Ammo rigid body.
     * @param object3D - The 3D object.
     * @param shape - The collision shape.
     * @param mass - The mass of the collision body.
     * @param position - Optional parameter, the position of the rigid body; defaults to the 3D object's `localPosition`.
     * @param rotation - Optional parameter, the rotation of the rigid body; defaults to the 3D object's `localRotation`.
     * @returns The newly created Ammo.btRigidBody object.
     */
    public static createRigidBody(object3D: Object3D, shape: Ammo.btCollisionShape, mass: number, position?: Vector3, rotation?: Vector3 | Quaternion): Ammo.btRigidBody {
        position ||= object3D.localPosition;
        rotation ||= object3D.localRotation;

        const transform = Physics.TEMP_TRANSFORM;
        transform.setIdentity();
        transform.setOrigin(TempPhyMath.toBtVec(position));
        let rotQuat = (rotation instanceof Vector3) ? TempPhyMath.eulerToBtQua(rotation) : TempPhyMath.toBtQua(rotation);
        transform.setRotation(rotQuat);

        const motionState = new Ammo.btDefaultMotionState(transform);
        const localInertia = TempPhyMath.zeroBtVec();
        shape.calculateLocalInertia(mass, localInertia);

        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
        const bodyRb = new Ammo.btRigidBody(rbInfo);

        return bodyRb;
    }

    /**
     * Updates the position and rotation of the rigid body.
     * This function applies the new position and rotation to the rigid body.
     * @param bodyRb - The rigid body object.
     * @param position - The new position of the rigid body, expressed as a Vector3.
     * @param rotation - The new rotation of the rigid body, optional; can be a Vector3 representing Euler angles (automatically converted to a quaternion); defaults to a zero quaternion.
     * @param clearFV - Whether to clear forces and velocities, optional; defaults to false.
     */
    public static updateTransform(bodyRb: Ammo.btRigidBody, position: Vector3, rotation: Vector3 | Quaternion, clearFV?: boolean) {
        rotation ||= Quaternion._zero;

        const transform = bodyRb.getWorldTransform();
        transform.setOrigin(TempPhyMath.toBtVec(position));
        let rotQuat = (rotation instanceof Vector3) ? TempPhyMath.eulerToBtQua(rotation) : TempPhyMath.toBtQua(rotation);
        transform.setRotation(rotQuat);

        bodyRb.setWorldTransform(transform);
        bodyRb.getMotionState().setWorldTransform(transform);
        bodyRb.activate();

        if (clearFV) {
            this.clearForcesAndVelocities(bodyRb);
        }
    }

    /**
     * Updates the position of the rigid body
     * @param bodyRb
     * @param value
     */
    public static updatePosition(bodyRb: Ammo.btRigidBody, value: Vector3) {
        if (bodyRb.isKinematicObject()) {
            bodyRb.getMotionState().getWorldTransform(Physics.TEMP_TRANSFORM);
            Physics.TEMP_TRANSFORM.setOrigin(TempPhyMath.toBtVec(value));
            bodyRb.getMotionState().setWorldTransform(Physics.TEMP_TRANSFORM);
        } else {
            bodyRb.getWorldTransform().getOrigin().setValue(value.x, value.y, value.z);
            bodyRb.activate();
        }
    }

    /**
     * Updates the rotation of the rigid body
     * @param bodyRb
     * @param value
     */
    public static updateRotation(bodyRb: Ammo.btRigidBody, value: Vector3) {
        if (bodyRb.isKinematicObject()) {
            bodyRb.getMotionState().getWorldTransform(Physics.TEMP_TRANSFORM);
            Physics.TEMP_TRANSFORM.setRotation(TempPhyMath.eulerToBtQua(value));
            bodyRb.getMotionState().setWorldTransform(Physics.TEMP_TRANSFORM);
        } else {
            bodyRb.getWorldTransform().setRotation(TempPhyMath.eulerToBtQua(value));
            bodyRb.activate();
        }
    }

    /**
     * Updates the scale of the rigid body
     * @param bodyRb
     * @param value
     * @param mass
     */
    public static updateScale(bodyRb: Ammo.btRigidBody, value: Vector3, mass: number) {
        const shape = bodyRb.getCollisionShape();
        shape.setLocalScaling(TempPhyMath.toBtVec(value));
        if (mass > 0) {
            const localInertia = TempPhyMath.zeroBtVec();
            shape.calculateLocalInertia(mass, localInertia);
            bodyRb.setMassProps(mass, localInertia);
            bodyRb.activate();
        }
    }

    /**
     * Clears forces and velocities
     * @param bodyRb
     */
    public static clearForcesAndVelocities(bodyRb: Ammo.btRigidBody) {
        bodyRb.clearForces();
        bodyRb.setLinearVelocity(TempPhyMath.zeroBtVec());
        bodyRb.setAngularVelocity(TempPhyMath.zeroBtVec());
    }

    /**
     * Activates all collision pairs in the physics world
     */
    public static activateCollisionBodies(): void {
        const dispatcher = Physics.world.getDispatcher();
        const numManifolds = dispatcher.getNumManifolds();

        for (let i = 0; i < numManifolds; i++) {
            const manifold = dispatcher.getManifoldByIndexInternal(i);

            const body0 = Ammo.castObject(manifold.getBody0(), Ammo.btRigidBody);
            const body1 = Ammo.castObject(manifold.getBody1(), Ammo.btRigidBody);

            if (body0 && body0.getMotionState()) {
                body0.activate();
            }

            if (body1 && body1.getMotionState()) {
                body1.activate();
            }
        }
    }

    /**
     * Destroys the rigid body along with its motion state and collision shape
     * @param bodyRb
     */
    public static destroyRigidBody(bodyRb: Ammo.btRigidBody): void {
        if (!bodyRb) return console.warn('There is no rigid body');

        Physics.world.removeRigidBody(bodyRb);
        Ammo.destroy(bodyRb.getCollisionShape());
        Ammo.destroy(bodyRb.getMotionState());
        Ammo.destroy(bodyRb);
    }

    /**
     * Destroys a constraint
     * @param constraint
     */
    public static destroyConstraint(constraint: Ammo.btTypedConstraint) {
        if (constraint) {
            Physics.world.removeConstraint(constraint);
            Ammo.destroy(constraint);
            constraint = null;
        }
    }
}
