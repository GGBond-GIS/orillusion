import { ComponentBase, Vector3 } from '@orillusion/core';
import { Ammo, Physics } from '../Physics';
import { TempPhyMath } from '../utils/TempPhyMath';
import { CollisionEventHandler } from './RigidbodyExpansion'
import { CollisionFlags } from './RigidbodyEnum';

/**
 * The GhostTrigger Component represents a non-physical trigger in the physics world.
 * It uses a ghost object to detect overlapping collisions without producing physical responses.
 */
export class GhostTrigger extends ComponentBase {
    private _initResolve!: () => void;
    private _initializationPromise: Promise<void> = new Promise<void>(r => this._initResolve = r);
    private _ghostObject: Ammo.btPairCachingGhostObject;
    private _userIndex: number;
    private _shape: Ammo.btCollisionShape;
    private collisionEventHandler: CollisionEventHandler = new CollisionEventHandler();

    public get shape() {
        return this._shape
    }
    public set shape(value: Ammo.btCollisionShape) {
        this._shape = value;
        if (this._ghostObject) {
            Ammo.destroy(this._ghostObject.getCollisionShape());
            this._ghostObject.setCollisionShape(value);
            // Physics.world.updateSingleAabb(this._ghostObject);  // Update the collision body's state in the world
        }
    }

    public get userIndex() {
        return this._userIndex;
    }

    public set userIndex(value: number) {
        this._userIndex = value;
        this._ghostObject?.setUserIndex(value)
    }

    private _collisionFlags: CollisionFlags = CollisionFlags.NO_CONTACT_RESPONSE;

    /**
     * Gets the collision flags
     */
    public get collisionFlags(): number {
        return this._ghostObject?.getCollisionFlags() ?? this._collisionFlags;
    }

    /**
     * Adds a single collision flag
     */
    public addCollisionFlag(value: CollisionFlags) {
        this._collisionFlags = this.collisionFlags | value;
        this._ghostObject?.setCollisionFlags(this._collisionFlags);
    }
    /**
     * Removes a single collision flag
     */
    public removeCollisionFlag(value: CollisionFlags) {
        this._collisionFlags = this.collisionFlags & ~value;
        this._ghostObject?.setCollisionFlags(this._collisionFlags);
    }

    async start() {

        if (!this._shape) throw new Error('Ghost object need collision shape')

        let position = this.object3D.localPosition;
        let rotation = this.object3D.localRotation;

        this._ghostObject = GhostTrigger.createAndAddGhostObject(this._shape, position, rotation, this._collisionFlags, this._userIndex);


        // Transform updates; ensures the ghost object is synchronized whenever the 3D object's transform changes
        this.transform.onPositionChange = (oldValue: Vector3, newValue: Vector3) => {
            newValue ||= this.transform.localPosition;
            this._ghostObject.getWorldTransform().setOrigin(TempPhyMath.toBtVec(newValue))
        };
        this.transform.onRotationChange = (oldValue: Vector3, newValue: Vector3) => {
            newValue ||= this.transform.localRotation;
            this._ghostObject.getWorldTransform().setRotation(TempPhyMath.eulerToBtQua(newValue))
        };
        this.transform.onScaleChange = (oldValue: Vector3, newValue: Vector3) => {
            newValue ||= this.transform.localScale;
            this._shape.setLocalScaling(TempPhyMath.toBtVec(newValue))
        };

        this._initResolve();

        this.collisionEventHandler.configure(Ammo.getPointer(this._ghostObject));

    }

    /**
     * Creates a ghost object and adds it to the physics world.
     * @param shape - The collision shape.
     * @param position - The position of the ghost object.
     * @param rotation - The rotation of the ghost object.
     * @param collisionFlags - Optional parameter, collision flags; defaults to 4 `NO_CONTACT_RESPONSE`, meaning the object does not participate in collision response but still triggers collision events.
     * @param userIndex - Optional parameter, user index that can serve as an identifier for the physics object.
     * @returns The newly created Ammo.btPairCachingGhostObject.
     */
    public static createAndAddGhostObject(shape: Ammo.btCollisionShape, position: Vector3, rotation: Vector3, collisionFlags?: number, userIndex?: number) {
        let ghostObject = new Ammo.btPairCachingGhostObject();
        let transform = Physics.TEMP_TRANSFORM;
        transform.setIdentity();
        transform.setOrigin(TempPhyMath.toBtVec(position));
        transform.setRotation(TempPhyMath.eulerToBtQua(rotation));
        ghostObject.setWorldTransform(transform);

        // Set shape and properties
        ghostObject.setCollisionShape(shape);
        collisionFlags ??= CollisionFlags.NO_CONTACT_RESPONSE;
        ghostObject.setCollisionFlags(ghostObject.getCollisionFlags() | collisionFlags);

        if (userIndex != null) {
            ghostObject.setUserIndex(userIndex);
        }

        // Add the ghost object to the physics world
        Physics.world.addCollisionObject(ghostObject);

        return ghostObject;
    }

    /**
     * Gets the ghost object
     */
    public get ghostObject() {
        return this._ghostObject;
    }

    /**
     * Asynchronously retrieves the fully initialized ghost object
     */
    public async wait() {
        await this._initializationPromise;
        return this._ghostObject!;
    }

    /**
     * Enable/disable collision callbacks
     */
    public get enableCollisionEvent(): boolean {
        return this.collisionEventHandler.enableCollisionEvent;
    }
    public set enableCollisionEvent(value: boolean) {
        this.collisionEventHandler.enableCollisionEvent = value;

    }

    /**
     * Collision event callback
     */
    public get collisionEvent() {
        return this.collisionEventHandler.collisionEvent;
    }
    public set collisionEvent(callback: (contactPoint: Ammo.btManifoldPoint, selfBody: Ammo.btRigidBody, otherBody: Ammo.btRigidBody) => void) {
        this.collisionEventHandler.collisionEvent = callback;
    }

    public destroy(force?: boolean): void {
        if (this._ghostObject) {
            Physics.world.removeCollisionObject(this._ghostObject);
            Ammo.destroy(this._ghostObject.getCollisionShape());
            Ammo.destroy(this._ghostObject);
            this._ghostObject = null;
        }

        this._shape = null;
        this.transform.onPositionChange = null;
        this.transform.onRotationChange = null;
        this.transform.onScaleChange = null;
        this.collisionEventHandler.destroy();

        super.destroy(force);
    }
}
