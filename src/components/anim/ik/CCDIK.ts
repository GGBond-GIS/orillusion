import { Quaternion } from "../../../math/Quaternion";
import { Vector3 } from "../../../math/Vector3";
import { Matrix4 } from "../../../math/Matrix4";
import type { AnimatorComponent } from "../AnimatorComponent";
import type { Object3D } from "../../../core/entities/Object3D";

/** Euler order for `rotationMin`/`rotationMax` clamp (matches Matrix4.getEuler). */
export type CCDIKEulerOrder = 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'YZX' | 'XZY';

/**
 * One link in an IK chain — bone reference plus optional joint constraints.
 *
 * The chain is `[root, ..., effector]` (root→tip). The last link is the
 * end-effector: its constraints are ignored because CCD never rotates the
 * tip (the tip is dragged by its parent).
 *
 * Two constraint families, applied in order each iteration after the
 * bone's localQuat is updated:
 *
 *   1. **Hinge** (`hingeAxis` + `minAngle`/`maxAngle`)
 *      Forces the joint to rotate ONLY around `hingeAxis` (in the bone's
 *      parent-local frame). Removes the swing component, keeps only twist
 *      around the axis, and clamps the twist angle to [minAngle, maxAngle].
 *      Use this for the elbow / knee — anatomically a 1-DOF hinge that
 *      bends in one direction. Without it, CCD will solve "reverse-bent
 *      elbow" or "self-rotating forearm" poses that violate human anatomy.
 *
 *   2. **Per-axis Euler limit** (`rotationMin` / `rotationMax`)
 *      Clamps each Euler component of the bone's local rotation to a box.
 *      Use this for shoulders / hips — ball joints that have *some*
 *      freedom but can't bend backwards arbitrarily.
 *
 *      Compatibility knobs:
 *        - `eulerOrder` (default `'XYZ'`, the common IK-rig convention) —
 *          picks which Euler decomposition is used. Different orders give
 *          different "valid" boxes for the same quaternion.
 *        - `radians` (default `false`) — values are degrees by default
 *          (Orillusion convention); set `true` to interpret as radians
 *          (the common IK-rig convention, so external IK configs can be
 *          pasted in unchanged).
 *
 * Hinge takes precedence: when `hingeAxis` is set, the Euler box is
 * ignored (a 1-DOF hinge is already strictly less free than any 3-axis
 * box).
 */
export interface CCDIKLink {
    /** Bone name (must match a joint in the AnimatorComponent's avatar). */
    boneName: string;
    /** Bone-local hinge axis (unit vector) — forces 1-DOF rotation around this axis. */
    hingeAxis?: Vector3;
    /** Min twist angle around `hingeAxis` (radians). Required if `hingeAxis` is set. */
    minAngle?: number;
    /** Max twist angle around `hingeAxis` (radians). Required if `hingeAxis` is set. */
    maxAngle?: number;
    /** Per-axis Euler lower bound applied to the bone's local rotation. */
    rotationMin?: Vector3;
    /** Per-axis Euler upper bound applied to the bone's local rotation. */
    rotationMax?: Vector3;
    /** Euler order for `rotationMin`/`rotationMax`. Default `'XYZ'` (common IK-rig convention). */
    eulerOrder?: CCDIKEulerOrder;
    /** If true, `rotationMin`/`rotationMax` are radians (common IK-rig convention). Default false (degrees). */
    radians?: boolean;
}

export interface CCDIKConfig {
    name: string;
    /**
     * End-effector bone name. CCD measures distance from THIS bone's
     * worldPosition to `target`, and never rotates this bone (its
     * position is dragged by its parent in the chain). Matches the
     * standard CCD solver `effector` field for config compatibility.
     */
    effector: string;
    /**
     * Joints to rotate, in **tip→root** order (closest to effector first),
     * matching the standard CCD solver `links` ordering. Each link carries
     * its own `boneName` and per-bone constraints.
     */
    links: CCDIKLink[];
    /**
     * Target position. Typically an Object3D — the bone (or dummy bone
     * like `target_hand_l`) whose worldPosition the effector should
     * reach. Read every frame, so animating the target works naturally.
     */
    target: Vector3 | Object3D;
    /** Number of CCD iterations per frame. Default 6. */
    iterations?: number;
    /** Per-iteration step damping in [0,1]. Default 1.0 (no damping). */
    damping?: number;
    /** Stop early if the tip is within this world-space distance. */
    threshold?: number;
    /** [0,1] blend between original pose and IK-solved pose. */
    weight: number;
}

/**
 * Cyclic Coordinate Descent IK (CCDIK).
 *
 * Iteratively rotates each bone in the chain (end-effector toward root) so
 * the chain tip approaches the target. Unlike TwoBoneIK, CCDIK handles
 * arbitrary chain lengths — useful for spines, tails, hair tentacles, or any
 * "look-at" animation that needs to bend through multiple joints.
 *
 * Textbook CCD: for each iteration, walk the chain from tip-1 toward root and
 * at each joint rotate to align the (joint→tip) vector with (joint→target).
 * Convergence is fast for short chains (≤8 bones).
 *
 * @group Animation
 */
export class CCDIK {
    public name: string;
    public effector: string;
    public links: CCDIKLink[];
    public target: Vector3 | Object3D;
    public iterations: number;
    public damping: number;
    public threshold: number;
    public weight: number;

    private _origLocalQs: Quaternion[] = [];
    /**
     * Per-iter best-pose snapshot. Stabilizes the solve when target is
     * outside the chain's reachable set + the Euler/hinge constraints
     * push the chain into different attractors each iter (creating a
     * limit-cycle that visually flickers between 2-3 poses every frame).
     * After all iters we restore the pose with the smallest target
     * distance — solver becomes monotonic-by-output even when the
     * inner sweep is non-monotonic.
     */
    private _bestPoseQs: Quaternion[] = [];
    private _tmpQA = new Quaternion();
    private _tmpQB = new Quaternion();
    private _tmpQDelta = new Quaternion();
    private _tmpV1 = new Vector3();
    private _tmpV2 = new Vector3();
    private _tmpAxis = new Vector3();
    private _tmpTarget = new Vector3();
    private _tmpEuler = new Vector3();
    private _constrainedQ = new Quaternion();

    /** Convenience accessor — full bone name list root→tip (links reversed + effector last). */
    public get chain(): string[] {
        const out: string[] = [];
        for (let i = this.links.length - 1; i >= 0; i--) out.push(this.links[i].boneName);
        out.push(this.effector);
        return out;
    }

    constructor(cfg: CCDIKConfig) {
        this.name = cfg.name;
        this.effector = cfg.effector;
        this.links = cfg.links;
        this.target = cfg.target;
        this.iterations = cfg.iterations ?? 6;
        this.damping = cfg.damping ?? 1.0;
        this.threshold = cfg.threshold ?? 0.5;
        this.weight = cfg.weight;
        // _origLocalQs covers links + effector slot for weight-blending;
        // _bestPoseQs is the stabilization snapshot.
        for (let i = 0; i <= this.links.length; i++) {
            this._origLocalQs.push(new Quaternion());
            this._bestPoseQs.push(new Quaternion());
        }
    }

    public solve(animator: AnimatorComponent): void {
        const _dbg = (this as any)._dbg ?? false;
        if (_dbg) console.log(`[CCDIK ${this.name}] solve() weight=${this.weight}`);
        if (this.weight <= 0) {
            if (_dbg) console.log(`[CCDIK ${this.name}] skip: weight=${this.weight}`);
            return;
        }
        if (this.links.length < 1) {
            if (_dbg) console.log(`[CCDIK ${this.name}] skip: links.length=${this.links.length}`);
            return;
        }

        // Build joints array in **root→tip** order for the iteration loop.
        // Public `links` is tip→root (the common IK convention) — reverse it
        // so the algorithm walks naturally from tip toward root.
        // joints layout: [root-most rotated, ..., tip-most rotated, effector].
        const effectorBone = animator.getJointObject(this.effector);
        if (!effectorBone) {
            if (_dbg) console.log(`[CCDIK ${this.name}] skip: getJointObject('${this.effector}') = null`);
            return;
        }
        const joints: Object3D[] = [];
        for (let i = this.links.length - 1; i >= 0; i--) {
            const j = animator.getJointObject(this.links[i].boneName);
            if (!j) {
                if (_dbg) console.log(`[CCDIK ${this.name}] skip: getJointObject('${this.links[i].boneName}') = null`);
                return;
            }
            joints.push(j);
        }
        joints.push(effectorBone);

        for (let i = 0; i < joints.length; i++) {
            this._origLocalQs[i].copy(joints[i].localQuaternion);
            // Initialize best-pose snapshot to start pose. As iterations
            // proceed we replace this whenever a smaller dist is found.
            this._bestPoseQs[i].copy(joints[i].localQuaternion);
        }

        const tip = effectorBone;
        const tWp = readWorldPos(this.target);
        this._tmpTarget.set(tWp.x, tWp.y, tWp.z);

        if (_dbg) {
            const tipPos0 = tip.transform.worldPosition;
            console.log(`[CCDIK ${this.name}] target=(${this._tmpTarget.x.toFixed(3)},${this._tmpTarget.y.toFixed(3)},${this._tmpTarget.z.toFixed(3)}) effector-before=(${tipPos0.x.toFixed(3)},${tipPos0.y.toFixed(3)},${tipPos0.z.toFixed(3)}) dist=${Math.sqrt(sqDist(tipPos0, this._tmpTarget)).toFixed(3)}`);
        }

        // Track the smallest tip-target distance reached so we can
        // restore that pose at the end. Without this, when target is
        // unreachable + joint constraints clamp the chain, the per-iter
        // sweep oscillates between attractors and produces frame-rate
        // flicker. Initial best is the start dist (so an iter that
        // worsens the pose can never be committed).
        let bestDistSq = sqDist(tip.transform.worldPosition, this._tmpTarget);

        let actualIters = 0;
        for (let iter = 0; iter < this.iterations; iter++) {
            actualIters = iter + 1;
            const tipPos = tip.transform.worldPosition;
            const distSq = sqDist(tipPos, this._tmpTarget);
            if (distSq < this.threshold * this.threshold) break;

            // Walk from tip-1 toward root. Don't rotate the effector itself
            // (joints[length-1]) — its position is determined by its parent.
            for (let bi = joints.length - 2; bi >= 0; bi--) {
                const bone = joints[bi];
                const bWp = bone.transform.worldPosition;
                // Re-read tip every joint: rotating an ancestor earlier
                // in this iter has already moved the effector, and using
                // the pre-iter position causes the chain to over-rotate.
                const tipWp = tip.transform.worldPosition;

                this._tmpV1.set(tipWp.x - bWp.x, tipWp.y - bWp.y, tipWp.z - bWp.z);
                this._tmpV2.set(this._tmpTarget.x - bWp.x, this._tmpTarget.y - bWp.y, this._tmpTarget.z - bWp.z);
                if (this._tmpV1.length < 1e-5 || this._tmpV2.length < 1e-5) continue;
                this._tmpV1.normalize();
                this._tmpV2.normalize();

                this._tmpAxis.crossVectors(this._tmpV1, this._tmpV2);
                if (this._tmpAxis.length < 1e-5) continue;
                this._tmpAxis.normalize();
                const cosA = clamp(Vector3.dot(this._tmpV1, this._tmpV2), -1, 1);
                const angle = Math.acos(cosA) * this.damping;
                if (angle < 1e-4) continue;

                quatFromAxisAngle(this._tmpAxis, angle, this._tmpQDelta);

                // Convert world-delta to bone-local: localNew = parentInvWorld * delta * boneWorld.
                const parentObj = bone.parent ? (bone.parent.object3D as Object3D) : null;
                const parentWorldQ = composeWorldQuat(parentObj, this._tmpQA);
                quatInvert(parentWorldQ, this._tmpQA);
                const boneWorldQ = composeWorldQuat(bone, this._tmpQB);
                this._tmpQB.multiply(this._tmpQDelta, boneWorldQ);
                const newLocal = new Quaternion();
                newLocal.multiply(this._tmpQA, this._tmpQB);

                // Map joints[bi] back to the public links[] index.
                //   joints layout = [links[N-1], links[N-2], ..., links[0], effector]
                //   so links index = links.length - 1 - bi
                const linkIdx = this.links.length - 1 - bi;
                this._applyLinkConstraint(linkIdx, newLocal);

                bone.localQuaternion = newLocal;
            }
            // End of iter: if the chain ended up closer to target than
            // any previous iter's end-state, snapshot it as the best.
            const iterEndDistSq = sqDist(tip.transform.worldPosition, this._tmpTarget);
            if (iterEndDistSq < bestDistSq) {
                bestDistSq = iterEndDistSq;
                for (let i = 0; i < joints.length; i++) {
                    this._bestPoseQs[i].copy(joints[i].localQuaternion);
                }
            }
        }

        // Stabilization: restore the best pose seen across all iters.
        // For reachable targets the last iter usually IS the best, so
        // this is a no-op. For unreachable / constrained targets it
        // collapses the per-iter oscillation into a stable fixed pose.
        for (let i = 0; i < joints.length; i++) {
            joints[i].localQuaternion = this._bestPoseQs[i];
        }

        if (this.weight < 1.0) {
            const blend = new Quaternion();
            for (let i = 0; i < joints.length; i++) {
                const cur = joints[i].localQuaternion;
                blend.slerp(this._origLocalQs[i], cur, this.weight);
                joints[i].localQuaternion = blend;
            }
        }

        if (_dbg) {
            const tipPos1 = tip.transform.worldPosition;
            console.log(`[CCDIK ${this.name}] iters=${actualIters}/${this.iterations} effector-after=(${tipPos1.x.toFixed(3)},${tipPos1.y.toFixed(3)},${tipPos1.z.toFixed(3)}) dist=${Math.sqrt(sqDist(tipPos1, this._tmpTarget)).toFixed(3)}`);
        }
    }

    /**
     * Apply hinge-axis or Euler-box constraint to `q` in place.
     *
     * Hinge math (when `hingeAxis` is set): swing-twist decomposition
     * around the axis, clamp twist angle to [minAngle, maxAngle], rebuild
     * `q` from clamped twist alone (swing is discarded — the joint is now
     * a clean 1-DOF hinge).
     *
     * Euler-box math (when `rotationMin`/`rotationMax` is set):
     *   1. Decompose `q` into Euler triple under `link.eulerOrder` using
     *      `Matrix4.getEuler` (radians).
     *   2. Convert min/max bounds to radians (if `link.radians` is false,
     *      the values are degrees and need conversion).
     *   3. Clamp componentwise and rebuild `q` from the clamped Euler
     *      under the same order via `_eulerToQuat`.
     */
    private _applyLinkConstraint(linkIndex: number, q: Quaternion): void {
        const link = this.links[linkIndex];
        if (!link) return;

        if (link.hingeAxis) {
            const ax = link.hingeAxis;
            // Swing-twist: twist axis component = (q.xyz · hingeAxis), reject swing.
            const dot = q.x * ax.x + q.y * ax.y + q.z * ax.z;
            // Pure twist quaternion, before normalization: (ax * dot, q.w)
            // Its angle is 2 * atan2(dot, q.w) (signed by axis direction).
            let angle = 2 * Math.atan2(dot, q.w);
            // Wrap to [-π, π]
            if (angle > Math.PI) angle -= 2 * Math.PI;
            else if (angle < -Math.PI) angle += 2 * Math.PI;
            const lo = link.minAngle ?? -Math.PI;
            const hi = link.maxAngle ?? Math.PI;
            angle = clamp(angle, lo, hi);
            const half = angle * 0.5;
            const s = Math.sin(half);
            // Fully overwrite q with the constrained pure-twist quat.
            q.set(ax.x * s, ax.y * s, ax.z * s, Math.cos(half));
            return;
        }

        if (link.rotationMin || link.rotationMax) {
            const order = link.eulerOrder ?? 'XYZ';
            // Matrix4.getEuler with isDegree=false returns radians.
            Matrix4.getEuler(this._tmpEuler, q, false, order);
            const k = link.radians ? 1.0 : Math.PI / 180.0;
            const lo = link.rotationMin;
            const hi = link.rotationMax;
            if (lo) {
                const lx = lo.x * k, ly = lo.y * k, lz = lo.z * k;
                if (this._tmpEuler.x < lx) this._tmpEuler.x = lx;
                if (this._tmpEuler.y < ly) this._tmpEuler.y = ly;
                if (this._tmpEuler.z < lz) this._tmpEuler.z = lz;
            }
            if (hi) {
                const hx = hi.x * k, hy = hi.y * k, hz = hi.z * k;
                if (this._tmpEuler.x > hx) this._tmpEuler.x = hx;
                if (this._tmpEuler.y > hy) this._tmpEuler.y = hy;
                if (this._tmpEuler.z > hz) this._tmpEuler.z = hz;
            }
            _eulerToQuat(this._tmpEuler.x, this._tmpEuler.y, this._tmpEuler.z, order, this._constrainedQ);
            q.copy(this._constrainedQ);
        }
    }
}

// ----- helpers (intentionally duplicated from TwoBoneIK to keep the two
// IK files independent — the IK module is small enough that cross-module
// refactors would cost more clarity than they save) -----

function readWorldPos(t: Vector3 | Object3D): Vector3 {
    if ((t as Object3D).transform !== undefined) return (t as Object3D).transform.worldPosition;
    return t as Vector3;
}

function sqDist(a: Vector3, b: Vector3): number {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
}

function clamp(x: number, lo: number, hi: number): number {
    return x < lo ? lo : (x > hi ? hi : x);
}

function quatFromAxisAngle(axis: Vector3, angle: number, out: Quaternion): Quaternion {
    const half = angle * 0.5;
    const s = Math.sin(half);
    out.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(half));
    return out;
}

function quatInvert(q: Quaternion, out: Quaternion): Quaternion {
    out.set(-q.x, -q.y, -q.z, q.w);
    return out;
}

const _qComposeTmp = new Quaternion();
function composeWorldQuat(obj: Object3D | null, out: Quaternion): Quaternion {
    if (!obj) { out.set(0, 0, 0, 1); return out; }
    const stack: Object3D[] = [];
    let cur: Object3D | null = obj;
    while (cur) {
        stack.push(cur);
        cur = cur.parent ? (cur.parent.object3D as Object3D) : null;
    }
    out.copy(stack[stack.length - 1].localQuaternion);
    for (let i = stack.length - 2; i >= 0; i--) {
        _qComposeTmp.multiply(out, stack[i].localQuaternion);
        out.copy(_qComposeTmp);
    }
    return out;
}

/**
 * Build a quaternion from intrinsic Euler angles (radians) under the
 * given order. Pair this with Matrix4.getEuler to round-trip without drift.
 */
function _eulerToQuat(x: number, y: number, z: number, order: CCDIKEulerOrder, out: Quaternion): Quaternion {
    const c1 = Math.cos(x * 0.5), s1 = Math.sin(x * 0.5);
    const c2 = Math.cos(y * 0.5), s2 = Math.sin(y * 0.5);
    const c3 = Math.cos(z * 0.5), s3 = Math.sin(z * 0.5);
    switch (order) {
        case 'XYZ':
            out.x = s1 * c2 * c3 + c1 * s2 * s3;
            out.y = c1 * s2 * c3 - s1 * c2 * s3;
            out.z = c1 * c2 * s3 + s1 * s2 * c3;
            out.w = c1 * c2 * c3 - s1 * s2 * s3;
            break;
        case 'YXZ':
            out.x = s1 * c2 * c3 + c1 * s2 * s3;
            out.y = c1 * s2 * c3 - s1 * c2 * s3;
            out.z = c1 * c2 * s3 - s1 * s2 * c3;
            out.w = c1 * c2 * c3 + s1 * s2 * s3;
            break;
        case 'ZXY':
            out.x = s1 * c2 * c3 - c1 * s2 * s3;
            out.y = c1 * s2 * c3 + s1 * c2 * s3;
            out.z = c1 * c2 * s3 + s1 * s2 * c3;
            out.w = c1 * c2 * c3 - s1 * s2 * s3;
            break;
        case 'ZYX':
            out.x = s1 * c2 * c3 - c1 * s2 * s3;
            out.y = c1 * s2 * c3 + s1 * c2 * s3;
            out.z = c1 * c2 * s3 - s1 * s2 * c3;
            out.w = c1 * c2 * c3 + s1 * s2 * s3;
            break;
        case 'YZX':
            out.x = s1 * c2 * c3 + c1 * s2 * s3;
            out.y = c1 * s2 * c3 + s1 * c2 * s3;
            out.z = c1 * c2 * s3 - s1 * s2 * c3;
            out.w = c1 * c2 * c3 - s1 * s2 * s3;
            break;
        case 'XZY':
            out.x = s1 * c2 * c3 - c1 * s2 * s3;
            out.y = c1 * s2 * c3 - s1 * c2 * s3;
            out.z = c1 * c2 * s3 + s1 * s2 * c3;
            out.w = c1 * c2 * c3 + s1 * s2 * s3;
            break;
    }
    return out;
}
