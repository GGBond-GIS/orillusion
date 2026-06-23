import { Quaternion } from "../../../math/Quaternion";
import { Vector3 } from "../../../math/Vector3";
import type { AnimatorComponent } from "../AnimatorComponent";
import type { Object3D } from "../../../core/entities/Object3D";

export interface TwoBoneIKConfig {
    name: string;
    /** Bone names: [root (hip), middle (knee), end (ankle)]. */
    chain: [string, string, string];
    /** IK target (Vector3 or Object3D whose worldPosition is read each frame). */
    target: Vector3 | Object3D;
    /** Optional pole hint to fix the bend plane. */
    pole?: Vector3 | Object3D;
    /** [0,1] blend between the original pose and the IK-solved pose. */
    weight: number;
}

/**
 * Analytic Two-Bone IK solver.
 *
 * Given a 3-joint chain [hip, knee, ankle] and a world-space target, computes
 * the hip and knee local rotations so the ankle reaches the target. Uses the
 * law of cosines on the bone-length triangle, then an extra hip rotation
 * to align the chain with the target direction. A "pole" reference point
 * fixes the bend plane (knee direction) — without one the solver picks an
 * arbitrary plane that may flip when the chain crosses its axis.
 *
 * Runs CPU-side after layer mix in AnimatorComponent.onUpdate. IK chains are
 * tiny (≤4 bones) so the cost is negligible.
 *
 * Limits:
 *  - Doesn't handle hierarchies where chain[0]'s parent has non-identity
 *    rotation that we don't iterate through. For human rigs (root → hip)
 *    this is usually fine.
 *  - Assumes uniform unit scale on the chain.
 *
 * @group Animation
 */
export class TwoBoneIK {
    public name: string;
    public chain: [string, string, string];
    public target: Vector3 | Object3D;
    public pole?: Vector3 | Object3D;
    public weight: number;

    private _origRootQ = new Quaternion();
    private _origMidQ = new Quaternion();
    private _aPos = new Vector3();
    private _bPos = new Vector3();
    private _cPos = new Vector3();
    private _tPos = new Vector3();
    private _bendAxis = new Vector3();
    private _midDelta = new Quaternion();
    private _rootDelta = new Quaternion();
    private _swingAxis = new Vector3();
    private _curDir = new Vector3();
    private _tgtDir = new Vector3();
    private _midParentInvW = new Quaternion();
    private _rootParentInvW = new Quaternion();
    private _midWorldNew = new Quaternion();
    private _midLocalNew = new Quaternion();
    private _rootWorldNew = new Quaternion();
    private _rootLocalNew = new Quaternion();
    private _blendQ = new Quaternion();

    constructor(cfg: TwoBoneIKConfig) {
        this.name = cfg.name;
        this.chain = cfg.chain;
        this.target = cfg.target;
        this.pole = cfg.pole;
        this.weight = cfg.weight;
    }

    public solve(animator: AnimatorComponent): void {
        if (this.weight <= 0) return;

        const root = animator.getJointObject(this.chain[0]);
        const mid = animator.getJointObject(this.chain[1]);
        const end = animator.getJointObject(this.chain[2]);
        if (!root || !mid || !end) return;

        this._origRootQ.copy(root.localQuaternion);
        this._origMidQ.copy(mid.localQuaternion);

        const aWp = root.transform.worldPosition;
        const bWp = mid.transform.worldPosition;
        const cWp = end.transform.worldPosition;
        this._aPos.set(aWp.x, aWp.y, aWp.z);
        this._bPos.set(bWp.x, bWp.y, bWp.z);
        this._cPos.set(cWp.x, cWp.y, cWp.z);
        const tWp = readWorldPos(this.target);
        this._tPos.set(tWp.x, tWp.y, tWp.z);

        const lenAB = Vector3.distance(this._aPos, this._bPos);
        const lenBC = Vector3.distance(this._bPos, this._cPos);
        if (lenAB < 1e-5 || lenBC < 1e-5) return;
        const maxReach = lenAB + lenBC - 1e-4;
        const lenAT = Math.min(Vector3.distance(this._aPos, this._tPos), maxReach);
        const lenAC = Vector3.distance(this._aPos, this._cPos);

        const cosBCurr = clamp((lenAB * lenAB + lenBC * lenBC - lenAC * lenAC) / (2 * lenAB * lenBC), -1, 1);
        const cosATCurr = clamp((lenAB * lenAB + lenAC * lenAC - lenBC * lenBC) / (2 * lenAB * lenAC), -1, 1);
        const cosBDes = clamp((lenAB * lenAB + lenBC * lenBC - lenAT * lenAT) / (2 * lenAB * lenBC), -1, 1);
        const cosATDes = clamp((lenAB * lenAB + lenAT * lenAT - lenBC * lenBC) / (2 * lenAB * lenAT), -1, 1);

        const aBcurr = Math.acos(cosBCurr);
        const aBdes = Math.acos(cosBDes);
        const aTcurr = Math.acos(cosATCurr);
        const aTdes = Math.acos(cosATDes);

        // Bend axis: perpendicular to the chain plane.
        if (this.pole) {
            const polePos = readWorldPos(this.pole);
            const ac = subTo(this._cPos, this._aPos, _vTmp1);
            const ap = subTo(_vTmpPole.set(polePos.x, polePos.y, polePos.z), this._aPos, _vTmp2);
            this._bendAxis.crossVectors(ac, ap);
        } else {
            const ab = subTo(this._bPos, this._aPos, _vTmp1);
            const ac = subTo(this._cPos, this._aPos, _vTmp2);
            this._bendAxis.crossVectors(ab, ac);
        }
        if (this._bendAxis.length < 1e-5) {
            this._bendAxis.set(0, 1, 0);
        } else {
            this._bendAxis.normalize();
        }

        // Mid joint: rotate around bend axis by (aBdes - aBcurr).
        quatFromAxisAngle(this._bendAxis, aBdes - aBcurr, this._midDelta);
        const midParentWorldQ = composeWorldQuat(mid.parent ? (mid.parent.object3D as Object3D) : null, _qTmp1);
        quatInvert(midParentWorldQ, this._midParentInvW);
        const midWorldQ = composeWorldQuat(mid, _qTmp2);
        this._midWorldNew.multiply(this._midDelta, midWorldQ);
        this._midLocalNew.multiply(this._midParentInvW, this._midWorldNew);

        // Root joint: bend around bendAxis by (aTdes - aTcurr), then swing
        // the chain so curDir aligns with tgtDir.
        subTo(this._cPos, this._aPos, this._curDir).normalize();
        subTo(this._tPos, this._aPos, this._tgtDir).normalize();
        this._swingAxis.crossVectors(this._curDir, this._tgtDir);

        const rootBend = quatFromAxisAngle(this._bendAxis, aTdes - aTcurr, _qTmp3);
        let rootSwing: Quaternion;
        if (this._swingAxis.length > 1e-5) {
            this._swingAxis.normalize();
            const swingAngle = Math.acos(clamp(Vector3.dot(this._curDir, this._tgtDir), -1, 1));
            rootSwing = quatFromAxisAngle(this._swingAxis, swingAngle, _qTmp4);
        } else {
            rootSwing = _qIdentity;
        }
        this._rootDelta.multiply(rootSwing, rootBend);
        const rootParentWorldQ = composeWorldQuat(root.parent ? (root.parent.object3D as Object3D) : null, _qTmp1);
        quatInvert(rootParentWorldQ, this._rootParentInvW);
        const rootWorldQ = composeWorldQuat(root, _qTmp2);
        this._rootWorldNew.multiply(this._rootDelta, rootWorldQ);
        this._rootLocalNew.multiply(this._rootParentInvW, this._rootWorldNew);

        // Apply with weight.
        if (this.weight >= 1.0) {
            root.localQuaternion = this._rootLocalNew;
            mid.localQuaternion = this._midLocalNew;
        } else {
            this._blendQ.slerp(this._origRootQ, this._rootLocalNew, this.weight);
            root.localQuaternion = this._blendQ;
            this._blendQ.slerp(this._origMidQ, this._midLocalNew, this.weight);
            mid.localQuaternion = this._blendQ;
        }
    }
}

// ----- helpers (file-local; intentionally not extracted to keep IK module
// independent of the rest of the codebase) -----

const _vTmp1 = new Vector3();
const _vTmp2 = new Vector3();
const _vTmpPole = new Vector3();
const _qTmp1 = new Quaternion();
const _qTmp2 = new Quaternion();
const _qTmp3 = new Quaternion();
const _qTmp4 = new Quaternion();
const _qIdentity = new Quaternion(0, 0, 0, 1);

function readWorldPos(t: Vector3 | Object3D): Vector3 {
    if ((t as Object3D).transform !== undefined) return (t as Object3D).transform.worldPosition;
    return t as Vector3;
}

function clamp(x: number, lo: number, hi: number): number {
    return x < lo ? lo : (x > hi ? hi : x);
}

function subTo(a: Vector3, b: Vector3, out: Vector3): Vector3 {
    out.set(a.x - b.x, a.y - b.y, a.z - b.z);
    return out;
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
