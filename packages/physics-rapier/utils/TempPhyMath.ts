import { Vector3, Quaternion } from '@orillusion/core';

/**
 * Rapier Vec3 (POJO) — does not require destroy.
 */
export interface RVec3 { x: number; y: number; z: number; }

/**
 * Rapier Quat (POJO) — does not require destroy.
 */
export interface RQuat { x: number; y: number; z: number; w: number; }

/**
 * Math conversion helpers between engine `Vector3 / Quaternion` and Rapier
 * plain `{x, y, z, [w]}` objects. Provides reusable scratch objects.
 *
 * Unlike the ammo plugin's `TempPhyMath`, Rapier values are POJOs and do
 * NOT need to be destroyed manually.
 */
export class TempPhyMath {
    public static readonly tmpVecA: RVec3 = { x: 0, y: 0, z: 0 };
    public static readonly tmpVecB: RVec3 = { x: 0, y: 0, z: 0 };
    public static readonly tmpVecC: RVec3 = { x: 0, y: 0, z: 0 };
    public static readonly tmpVecD: RVec3 = { x: 0, y: 0, z: 0 };
    public static readonly tmpQuaA: RQuat = { x: 0, y: 0, z: 0, w: 1 };
    public static readonly tmpQuaB: RQuat = { x: 0, y: 0, z: 0, w: 1 };

    /**
     * Vector3 → Rapier Vec3.
     */
    public static toRVec(vec: Vector3, target?: RVec3): RVec3 {
        target ||= this.tmpVecA;
        target.x = vec.x;
        target.y = vec.y;
        target.z = vec.z;
        return target;
    }

    /**
     * Quaternion → Rapier Quat.
     */
    public static toRQuat(qua: Quaternion, target?: RQuat): RQuat {
        target ||= this.tmpQuaA;
        target.x = qua.x;
        target.y = qua.y;
        target.z = qua.z;
        target.w = qua.w;
        return target;
    }

    /**
     * Set Rapier Vec3 from raw scalars.
     */
    public static setRVec(x: number, y: number, z: number, target?: RVec3): RVec3 {
        target ||= this.tmpVecA;
        target.x = x;
        target.y = y;
        target.z = z;
        return target;
    }

    /**
     * Set Rapier Quat from raw scalars.
     */
    public static setRQuat(x: number, y: number, z: number, w: number, target?: RQuat): RQuat {
        target ||= this.tmpQuaA;
        target.x = x;
        target.y = y;
        target.z = z;
        target.w = w;
        return target;
    }

    /**
     * Rapier Vec3 → Vector3.
     */
    public static fromRVec(rv: RVec3, vec?: Vector3): Vector3 {
        vec ||= new Vector3();
        vec.set(rv.x, rv.y, rv.z);
        return vec;
    }

    /**
     * Rapier Quat → Quaternion.
     */
    public static fromRQuat(rq: RQuat, qua?: Quaternion): Quaternion {
        qua ||= new Quaternion();
        qua.set(rq.x, rq.y, rq.z, rq.w);
        return qua;
    }

    /**
     * Sets the given Rapier Vec3 to (0, 0, 0).
     */
    public static zeroRVec(target?: RVec3): RVec3 {
        return this.setRVec(0, 0, 0, target);
    }

    /**
     * Sets the given Rapier Quat to (0, 0, 0, 1).
     */
    public static resetRQuat(target?: RQuat): RQuat {
        return this.setRQuat(0, 0, 0, 1, target);
    }
}
