import { Physics, Ammo } from '../Physics';

type Callback = (contactPoint: Ammo.btManifoldPoint, bodyA: Ammo.btRigidBody, bodyB: Ammo.btRigidBody) => void;

/**
 * Collision processing utility
 */
export class ContactProcessedUtil {
    private static callbacks: Map<number, Callback> = new Map();
    private static ignoredPointers: Set<number> = new Set();
    private static contactProcessedCallbackPointer: number | null = null;

    /**
     * Register a collision event.
     * @param pointer Pointer to the physics object
     * @param callback Event callback
     */
    public static registerCollisionCallback(pointer: number, callback: Callback): void {
        if (pointer == null) return;

        ContactProcessedUtil.callbacks.set(pointer, callback);
        if (ContactProcessedUtil.callbacks.size === 1) {
            // First registered callback: register the contact-processed callback
            ContactProcessedUtil.registerContactProcessedCallback();
        }
    }

    /**
     * Unregister a collision event.
     * @param pointer Pointer to the physics object
     */
    public static unregisterCollisionCallback(pointer: number): void {
        ContactProcessedUtil.callbacks.delete(pointer);
        if (ContactProcessedUtil.callbacks.size === 0) {
            // Last callback unregistered: disable the contact-processed callback
            ContactProcessedUtil.unregisterContactProcessedCallback();
        }
    }

    /**
     * Register the global contact-processed callback.
     */
    private static registerContactProcessedCallback(): void {
        if (ContactProcessedUtil.contactProcessedCallbackPointer === null) {
            ContactProcessedUtil.contactProcessedCallbackPointer = Ammo.addFunction(ContactProcessedUtil.contactProcessedCallback);
            Physics.world.setContactProcessedCallback(ContactProcessedUtil.contactProcessedCallbackPointer);
        }
    }

    /**
     * Unregister the global contact-processed callback.
     */
    private static unregisterContactProcessedCallback(): void {
        if (ContactProcessedUtil.contactProcessedCallbackPointer !== null) {
            Physics.world.setContactProcessedCallback(null); // Disable the callback
            ContactProcessedUtil.contactProcessedCallbackPointer = null;
        }
    }

    /**
     * Add a pointer to the ignored set. Once added, no collision event will be triggered when any object collides with the object referenced by this pointer.
     * @param pointer Pointer to the physics object
     */
    public static addIgnoredPointer(pointer: number): void {
        if (pointer != null) {
            ContactProcessedUtil.ignoredPointers.add(pointer);
        }
    }

    /**
     * Remove a pointer from the ignored set.
     * @param pointer Pointer to the physics object
     */
    public static removeIgnoredPointer(pointer: number): void {
        ContactProcessedUtil.ignoredPointers.delete(pointer);
    }

    /**
     * Check whether the pointer is in the ignored set.
     * @param pointer Pointer to the physics object
     */
    public static isIgnored(pointer: number): boolean {
        return ContactProcessedUtil.ignoredPointers.has(pointer);
    }

    /**
     * Check whether the pointer has a registered collision event.
     * @param pointer Pointer to the physics object
     */
    public static isCollision(pointer: number): boolean {
        return ContactProcessedUtil.callbacks.has(pointer);
    }

    /**
     * Global contact (collision) event callback.
     */
    private static contactProcessedCallback(cpPtr: number, colObj0WrapPtr: number, colObj1WrapPtr: number): number {
        // Check whether the pair should be ignored
        if (ContactProcessedUtil.ignoredPointers.has(colObj0WrapPtr) || ContactProcessedUtil.ignoredPointers.has(colObj1WrapPtr)) {
            return 0;
        }

        // Look up the registered events via the collision-object wrapper pointers
        const callbackA = ContactProcessedUtil.callbacks.get(colObj0WrapPtr);
        const callbackB = ContactProcessedUtil.callbacks.get(colObj1WrapPtr);

        // Skip collision pairs where neither side has a registered event
        if (callbackA || callbackB) {
            // Pointer conversion
            const cp = Ammo.wrapPointer(cpPtr, Ammo.btManifoldPoint);
            const bodyA = Ammo.wrapPointer(colObj0WrapPtr, Ammo.btRigidBody);
            const bodyB = Ammo.wrapPointer(colObj1WrapPtr, Ammo.btRigidBody);

            callbackA?.(cp, bodyA, bodyB);
            callbackB?.(cp, bodyB, bodyA);
        }

        return 0; // Returning 0 indicates this collision has been handled
    }

    /**
     * Perform a one-shot collision test.
     * If bodyB is provided, tests whether bodyA collides with bodyB.
     * Otherwise, tests whether bodyA collides with any other rigid body.
     * @param bodyA - The first rigid body.
     * @param bodyB - (Optional) The second rigid body.
     * @returns An object with collision information if a collision occurred; otherwise null.
     */
    public static performCollisionTest(bodyA: Ammo.btRigidBody, bodyB?: Ammo.btRigidBody) {
        const callback = new Ammo.ConcreteContactResultCallback();
        let collisionDetected: {
            cpPtr: number,
            colObj0Wrap: Ammo.btCollisionObjectWrapper,
            colObj1Wrap: Ammo.btCollisionObjectWrapper,
            partId0: number,
            index0: number,
            partId1: number,
            index1: number
        } | null = null;

        callback.addSingleResult = (cp, colObj0Wrap, partId0, index0, colObj1Wrap, partId1, index1) => {
            let collisionObjectWrapperA = Ammo.wrapPointer(colObj0Wrap as unknown as number, Ammo.btCollisionObjectWrapper)
            let collisionObjectWrapperB = Ammo.wrapPointer(colObj1Wrap as unknown as number, Ammo.btCollisionObjectWrapper)
            collisionDetected = {
                cpPtr: cp as unknown as number,
                colObj0Wrap: collisionObjectWrapperA,
                colObj1Wrap: collisionObjectWrapperB,
                partId0,
                index0,
                partId1,
                index1
            };

            return 0;
        };

        if (bodyB) {
            Physics.world.contactPairTest(bodyA, bodyB, callback);
        } else {
            Physics.world.contactTest(bodyA, callback);
        }

        Ammo.destroy(callback);

        return collisionDetected;
    }

    /**
     * Collision check: determines whether two rigid bodies are currently colliding.
     * @param bodyA
     * @param bodyB
     * @returns boolean
     */
    public static checkCollision(bodyA: Ammo.btRigidBody, bodyB: Ammo.btRigidBody): boolean {
        const dispatcher = Physics.world.getDispatcher();
        const manifoldCount = dispatcher.getNumManifolds();
        for (let i = 0; i < manifoldCount; i++) {
            const manifold = dispatcher.getManifoldByIndexInternal(i);
            const rbA = Ammo.castObject(manifold.getBody0(), Ammo.btRigidBody);
            const rbB = Ammo.castObject(manifold.getBody1(), Ammo.btRigidBody);
            if ((rbA === bodyA && rbB === bodyB) || (rbA === bodyB && rbB === bodyA)) {
                return true;
            }
        }
        return false;
    }

}