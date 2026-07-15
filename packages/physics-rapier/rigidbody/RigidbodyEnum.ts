/**
 * Rigid body kind. Mirrors Rapier's RigidBodyType but exposes a simpler enum.
 */
export enum BodyType {
    /** Affected by forces and collisions. */
    Dynamic,
    /** Immovable. Equivalent to ammo plugin's `mass = 0`. */
    Static,
    /** Driven by user-set transform; velocity is auto-computed from delta. */
    KinematicPosition,
    /** Driven by user-set velocity. */
    KinematicVelocity,
}
