import { Vector3, Quaternion } from '@orillusion/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../Physics';
import { Rigidbody } from '../rigidbody/Rigidbody';

export interface QueryFilter {
    /** Maximum hit distance / time-of-impact. Default Infinity-ish (1e6). */
    maxDistance?: number;
    /** Whether the ray treats colliders as solid (hits start-inside as t=0). */
    solid?: boolean;
    /** Skip a specific Rigidbody (e.g. the caster). */
    excludeRigidbody?: Rigidbody;
    /** Skip a specific Rapier collider. */
    excludeCollider?: RAPIER.Collider;
    /** Ignore sensors. */
    excludeSensors?: boolean;
}

export interface RaycastHit {
    rigidbody: Rigidbody | null;
    collider: RAPIER.Collider;
    /** World-space hit point. */
    point: Vector3;
    /** World-space surface normal at the hit. */
    normal: Vector3;
    /** Time-of-impact along the ray (= distance for unit-length direction). */
    toi: number;
}

export interface ShapeHit {
    rigidbody: Rigidbody | null;
    collider: RAPIER.Collider;
    point: Vector3;
    normal1: Vector3;
    normal2: Vector3;
    toi: number;
}

/**
 * Static physics queries — Rapier-backed.
 *
 * Replaces the missing public query API in `@orillusion/physics`.
 */
export class PhysicsQuery {
    /** Cast a ray and return the closest hit, or `null`. */
    public static raycast(origin: Vector3, direction: Vector3, filter: QueryFilter = {}): RaycastHit | null {
        const ray = new RAPIER.Ray(
            { x: origin.x, y: origin.y, z: origin.z },
            { x: direction.x, y: direction.y, z: direction.z },
        );
        const flags = filter.excludeSensors ? RAPIER.QueryFilterFlags.EXCLUDE_SENSORS : undefined;
        const hit = Physics.world.castRayAndGetNormal(
            ray,
            filter.maxDistance ?? 1e6,
            filter.solid ?? true,
            flags,
            undefined,
            filter.excludeCollider,
            filter.excludeRigidbody?.native ?? undefined,
        );
        if (!hit) return null;

        const point = ray.pointAt(hit.timeOfImpact);
        const rb = Physics._rigidbodyOfHandle(hit.collider.handle) ?? null;
        return {
            rigidbody: rb,
            collider: hit.collider,
            point: new Vector3(point.x, point.y, point.z),
            normal: new Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
            toi: hit.timeOfImpact,
        };
    }

    /** Collect every collider intersected by the ray, up to `maxDistance`. */
    public static raycastAll(origin: Vector3, direction: Vector3, filter: QueryFilter = {}): RaycastHit[] {
        const ray = new RAPIER.Ray(
            { x: origin.x, y: origin.y, z: origin.z },
            { x: direction.x, y: direction.y, z: direction.z },
        );
        const flags = filter.excludeSensors ? RAPIER.QueryFilterFlags.EXCLUDE_SENSORS : undefined;
        const hits: RaycastHit[] = [];
        Physics.world.intersectionsWithRay(
            ray,
            filter.maxDistance ?? 1e6,
            filter.solid ?? true,
            (intersection) => {
                const p = ray.pointAt(intersection.timeOfImpact);
                hits.push({
                    rigidbody: Physics._rigidbodyOfHandle(intersection.collider.handle) ?? null,
                    collider: intersection.collider,
                    point: new Vector3(p.x, p.y, p.z),
                    normal: new Vector3(intersection.normal.x, intersection.normal.y, intersection.normal.z),
                    toi: intersection.timeOfImpact,
                });
                return true;
            },
            flags,
            undefined,
            filter.excludeCollider,
            filter.excludeRigidbody?.native ?? undefined,
        );
        return hits;
    }

    /** Sweep a shape along `velocity` for `maxDistance`, return first hit or null. */
    public static sweep(
        shape: RAPIER.ColliderDesc,
        position: Vector3,
        rotation: Quaternion,
        velocity: Vector3,
        filter: QueryFilter = {},
    ): ShapeHit | null {
        const flags = filter.excludeSensors ? RAPIER.QueryFilterFlags.EXCLUDE_SENSORS : undefined;
        const hit = Physics.world.castShape(
            { x: position.x, y: position.y, z: position.z },
            { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
            { x: velocity.x, y: velocity.y, z: velocity.z },
            shape.shape,
            0, // targetDistance
            filter.maxDistance ?? 1e6,
            true, // stopAtPenetration
            flags,
            undefined,
            filter.excludeCollider,
            filter.excludeRigidbody?.native ?? undefined,
        );
        if (!hit) return null;
        return {
            rigidbody: Physics._rigidbodyOfHandle(hit.collider.handle) ?? null,
            collider: hit.collider,
            point: new Vector3(hit.witness1.x, hit.witness1.y, hit.witness1.z),
            normal1: new Vector3(hit.normal1.x, hit.normal1.y, hit.normal1.z),
            normal2: new Vector3(hit.normal2.x, hit.normal2.y, hit.normal2.z),
            toi: hit.time_of_impact,
        };
    }

    /** Return every collider whose AABB intersects the given shape's AABB. */
    public static overlap(
        shape: RAPIER.ColliderDesc,
        position: Vector3,
        rotation: Quaternion,
        filter: QueryFilter = {},
    ): Rigidbody[] {
        const flags = filter.excludeSensors ? RAPIER.QueryFilterFlags.EXCLUDE_SENSORS : undefined;
        const seen = new Set<Rigidbody>();
        Physics.world.intersectionsWithShape(
            { x: position.x, y: position.y, z: position.z },
            { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
            shape.shape,
            (collider) => {
                const rb = Physics._rigidbodyOfHandle(collider.handle);
                if (rb) seen.add(rb);
                return true;
            },
            flags,
            undefined,
            filter.excludeCollider,
            filter.excludeRigidbody?.native ?? undefined,
        );
        return [...seen];
    }

    /** Project a point onto the closest collider; returns `null` if none. */
    public static closestPoint(point: Vector3, filter: QueryFilter = {}): { rigidbody: Rigidbody | null; collider: RAPIER.Collider; point: Vector3; isInside: boolean } | null {
        const flags = filter.excludeSensors ? RAPIER.QueryFilterFlags.EXCLUDE_SENSORS : undefined;
        const proj = Physics.world.projectPoint(
            { x: point.x, y: point.y, z: point.z },
            filter.solid ?? true,
            flags,
            undefined,
            filter.excludeCollider,
            filter.excludeRigidbody?.native ?? undefined,
        );
        if (!proj) return null;
        return {
            rigidbody: Physics._rigidbodyOfHandle(proj.collider.handle) ?? null,
            collider: proj.collider,
            point: new Vector3(proj.point.x, proj.point.y, proj.point.z),
            isInside: proj.isInside,
        };
    }
}
