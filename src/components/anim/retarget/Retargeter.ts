import { Quaternion } from "../../../math/Quaternion";
import { Vector3 } from "../../../math/Vector3";
import type { AnimatorComponent } from "../AnimatorComponent";
import type { PrefabAvatarData } from "../../../loader/parser/prefab/prefabData/PrefabAvatarData";

export interface RetargeterConfig {
    /** Optional explicit source-bone-name → target-bone-name mapping. */
    nameMap?: Map<string, string> | { [src: string]: string };
    /** Bone names on the source that should be ignored. */
    excludeSourceBones?: Set<string>;
    /**
     * When true (default), run the bind-frame-delta retarget
     * (`desired = bindWorld_T * inv(bindWorld_S) * currentWorld_S`)
     * with bind worlds FK'd over each rig's Character + boneData
     * chain. When false, just copy each source bone's
     * `localQuaternion` straight onto the target — only correct for
     * same-rig retargeting where target's bind matches source's
     * exactly AND no Character-level rotation differences exist.
     */
    useRestOffset?: boolean;
    /**
     * If true, the hip (root joint) position is locked to the target's
     * bind pose — root motion (jumps, walks, crouches) is dropped.
     * Default false: the source hip's position delta is replayed on
     * the target, scaled by `heightScale`.
     */
    preserveHipPosition?: boolean;
    /**
     * Multiplier applied to the hip translation delta before writing
     * it onto the target. Use the height ratio (target rig height /
     * source rig height) when the two rigs are different sizes —
     * otherwise a 0.5m source jump on a 1.8m rig produces an over- or
     * under-jump on a 1.6m target. Default 1.0 (no scaling).
     */
    heightScale?: number;
    /**
     * When true (default), auto-rotate target's Character node at
     * `buildMapping` so its bind hip world matches source's — target
     * ends up facing source's world direction in TPose. Set false
     * for duet scenes where you want target to face its own authored
     * direction.
     */
    alignTPoseFacing?: boolean;
    /**
     * Bone-name prefixes to strip during fuzzy name matching, in
     * priority order. Defaults to `['mixamorig:', 'Armature|']` which
     * covers the standard Mixamo and Blender exporter conventions.
     * Set to `[]` to require exact (case-insensitive) name match —
     * useful when bones are already canonicalized or when prefix
     * stripping would create ambiguous matches between rigs that
     * legitimately share a prefix as part of the name. Comparisons
     * are case-insensitive and the first matching prefix wins; only
     * one prefix is removed per bone name.
     */
    bonePrefixes?: string[];
}

interface ResolvedPair {
    srcName: string;
    tgtName: string;
}

/**
 * Animation retargeting utility — copies per-bone rotations (and the
 * hip's translation, optionally) from a source AnimatorComponent to a
 * target AnimatorComponent each frame.
 *
 * **Rotation channel — per-bone world offset + Character
 * pre-alignment.** Per retargeted bone we apply
 *
 *   target_world[bone] = sourceCurrentWorld[bone] * offset[bone]
 *   target.localQ      = inv(targetParentCurrentWorld) * target_world
 *
 * with `offset[bone] = inv(bindWorldS[srcBone]) * bindWorldT[tgtBone]`
 * cached at `buildMapping` from each rig's bind-pose world rotations
 * (FK over `bindLocal * Character`).
 *
 * At TPose this collapses to `target_world == bindWorldT[bone]` —
 * target's bone sits at its own authored bind world, so the per-bone
 * skin matrix `target_world * inv(bindWorldT)` is identity, **no mesh
 * distortion at any joint**. During motion the skin matrix becomes
 * `sourceCurrentWorld * inv(bindWorldS)` — i.e. source's own
 * world-space delta from its bind — so target replays source's
 * anatomical motion regardless of how each rig's bind localQ is
 * authored.
 *
 * Naive world copy without offsets (`target_world = sourceCurW`
 * directly) was tried and produced a ~180° skin-matrix rotation at
 * the foot joint when source's and target's foot bind worlds differ
 * by a half-turn (Michelle's foot bind world ≈ 180° around an
 * out-and-down axis; Soldier's ≈ +90°X) — the soles flipped upward.
 * The per-bone offset above is the only formula that handles
 * arbitrary bind orientation differences cleanly.
 *
 * **Bind-facing pre-alignment (`alignTPoseFacing`, default on).**
 * Mixamo Michelle's Character holds `rotationX = +90°`, Soldier's
 * `-90°`, leaving their TPose hip worlds 180°Y apart. At
 * `buildMapping` we capture `Q_align = bindWorldS_root *
 * inv(bindWorldT_root)` and pre-multiply it onto target's Character
 * localQuaternion (in place). This rotates target's whole skeleton
 * uniformly in world so its bind hip world matches source's, then
 * the per-bone offsets are computed from the post-rotation
 * bindWorldT values. Set `alignTPoseFacing: false` for duet scenes
 * where you want target to face its own authored direction.
 *
 * **Translation channel — hip position only, with optional height
 * scaling:
 *
 *   delta_charLocal_S = sourceHip.localPosition - bindHipLocal_S
 *   delta_world       = rootRot_S * delta_charLocal_S
 *   delta_charLocal_T = inv(rootRot_T) * delta_world
 *   targetHip.localPosition = bindHipLocal_T + delta_charLocal_T * heightScale
 *
 * Children bones never receive position updates — Mixamo characters
 * have different bone-segment lengths, and forcing source positions
 * onto target bones distorts the mesh shape. The hip is the one bone
 * where translation is meaningful: it carries root motion (jumps,
 * walks, crouches), and scaling its delta by the rig height ratio
 * keeps Soldier from "flying" or "sinking" relative to a taller
 * Michelle.
 *
 * Bone resolution between the two rigs:
 *   1. explicit `nameMap` in the config (highest priority)
 *   2. exact (case-insensitive) name match, with the prefixes listed
 *      in `bonePrefixes` stripped (default `['mixamorig:', 'Armature|']`
 *      covers Mixamo + Blender exporters; override per-rig as needed)
 *
 * @group Animation
 */
export class Retargeter {
    private _source: AnimatorComponent;
    private _target: AnimatorComponent;
    private _nameMap: Map<string, string>;
    private _exclude: Set<string>;
    private _useRestOffset: boolean;
    private _preserveHipPosition: boolean;
    private _heightScale: number;
    private _alignTPoseFacing: boolean;
    private _bonePrefixes: string[];

    private _resolved: ResolvedPair[] | null = null;
    /** target boneName → source boneName, for quick reverse lookup in apply(). */
    private _tgtToSrc: Map<string, string> = new Map();
    /** source bone bind worldQ (FK starting from source Character rotation). */
    private _bindWorldS: Map<string, Quaternion> = new Map();
    /**
     * target bone bind worldQ (FK starting from target Character
     * rotation, AFTER any auto-rotation `alignTPoseFacing` applied).
     */
    private _bindWorldT: Map<string, Quaternion> = new Map();
    /**
     * Per-bone world-space retarget offset cache (keyed by *target*
     * bone name): `inv(bindWorldS[srcBone]) * bindWorldT[tgtBone]`.
     * Applied as `target_world = sourceCurrentWorld * offset[bone]`,
     * so at TPose target stays at its own bind world (no mesh
     * distortion at any bone) and during motion source's world delta
     * from bind drives target.
     */
    private _offset: Map<string, Quaternion> = new Map();
    /** source rig root (Character node) rotation captured at buildMapping. */
    private _rootRotS = new Quaternion();
    /** target rig root (Character node) rotation captured at buildMapping. */
    private _rootRotT = new Quaternion();
    /** Hip pair name + bind localPosition for the position channel. */
    private _hipSrcName: string | null = null;
    private _hipTgtName: string | null = null;
    private _bindHipLocalPosS = new Vector3();
    private _bindHipLocalPosT = new Vector3();
    /** scratch reusable quaternions/vectors to avoid per-frame GC pressure. */
    private _scratchInvParentT = new Quaternion();
    private _scratchInvRootRotT = new Quaternion();
    private _scratchOut = new Quaternion();
    private _scratchHipDelta = new Vector3();
    private _scratchHipPos = new Vector3();
    /** per-bone tracked currentWorldQ during apply(); reused, cleared each call. */
    private _currentWorldS: Map<string, Quaternion> = new Map();
    private _currentWorldT: Map<string, Quaternion> = new Map();

    constructor(source: AnimatorComponent, target: AnimatorComponent, cfg: RetargeterConfig) {
        this._source = source;
        this._target = target;
        if (!cfg.nameMap) {
            this._nameMap = new Map();
        } else if (cfg.nameMap instanceof Map) {
            this._nameMap = cfg.nameMap;
        } else {
            this._nameMap = new Map(Object.entries(cfg.nameMap));
        }
        this._exclude = cfg.excludeSourceBones ?? new Set();
        this._useRestOffset = cfg.useRestOffset ?? true;
        this._preserveHipPosition = cfg.preserveHipPosition ?? false;
        this._heightScale = cfg.heightScale ?? 1.0;
        this._alignTPoseFacing = cfg.alignTPoseFacing ?? true;
        this._bonePrefixes = cfg.bonePrefixes ?? ['mixamorig:', 'Armature|'];
    }

    /**
     * Build the source→target bone mapping + capture each rig's
     * Character (root) rotation, target's per-bone bind worldQ, and
     * the hip-pair bind translations. Called lazily on the first
     * `apply()`; can be re-called explicitly if either avatar
     * changes.
     */
    public buildMapping(): void {
        const srcAvatar = this._source.getAvatar();
        const tgtAvatar = this._target.getAvatar();
        if (!srcAvatar || !tgtAvatar) {
            this._resolved = [];
            return;
        }

        const targetNames = new Set<string>();
        for (const b of tgtAvatar.boneData) targetNames.add(b.boneName);

        const out: ResolvedPair[] = [];
        this._tgtToSrc.clear();
        for (const srcBone of srcAvatar.boneData) {
            if (this._exclude.has(srcBone.boneName)) continue;

            const mapped = this._nameMap.get(srcBone.boneName);
            let tgtName: string | null = null;
            if (mapped && targetNames.has(mapped)) {
                tgtName = mapped;
            } else {
                const stripped = this._stripPrefix(srcBone.boneName);
                for (const t of targetNames) {
                    if (t === srcBone.boneName ||
                        t.toLowerCase() === srcBone.boneName.toLowerCase() ||
                        this._stripPrefix(t).toLowerCase() === stripped.toLowerCase()) {
                        tgtName = t;
                        break;
                    }
                }
            }
            if (!tgtName) continue;

            out.push({ srcName: srcBone.boneName, tgtName });
            this._tgtToSrc.set(tgtName, srcBone.boneName);
            targetNames.delete(tgtName);
        }
        this._resolved = out;

        // Capture each rig's Character (skeleton-root) rotation. This
        // is the rotation the sample sets via `sourceRoot.rotationY`
        // etc., NOT necessarily the bind rotation baked into the glTF
        // — the bind may have been overwritten by the sample. Used as
        // the FK starting frame for `currentWorld_S` and `bindWorld_T`,
        // and as the source/target frame for the hip position channel.
        const srcRootBone = srcAvatar.boneData.length > 0
            ? this._source.getJointObject(srcAvatar.boneData[0].boneName) : null;
        const tgtRootBone = tgtAvatar.boneData.length > 0
            ? this._target.getJointObject(out[0]?.tgtName ?? tgtAvatar.boneData[0].boneName) : null;
        // The bone's `parent` is a glTF-loader-side wrapper (Bone /
        // Joint), whose engine-side Object3D is on `.object3D`. The
        // Character node IS that Object3D — that's the one whose
        // localQuaternion gives us the rig's root rotation.
        const srcCharObj = srcRootBone?.parent ? (srcRootBone.parent as any).object3D : null;
        const tgtCharObj = tgtRootBone?.parent ? (tgtRootBone.parent as any).object3D : null;
        if (srcCharObj?.localQuaternion) this._rootRotS.copy(srcCharObj.localQuaternion);
        else this._rootRotS.set(0, 0, 0, 1);
        if (tgtCharObj?.localQuaternion) this._rootRotT.copy(tgtCharObj.localQuaternion);
        else this._rootRotT.set(0, 0, 0, 1);

        // Identify the hip pair (root joint = the source bone with no
        // parent in skeleton) and capture its bind localPosition for
        // both rigs. Without a parentless source bone we leave the hip
        // names null and skip the position channel entirely.
        this._hipSrcName = null;
        this._hipTgtName = null;
        for (const pair of out) {
            const srcBone = srcAvatar.boneMap.get(pair.srcName);
            if (srcBone && (!srcBone.parentBoneName || srcBone.parentBoneName === '')) {
                const tgtBone = tgtAvatar.boneMap.get(pair.tgtName);
                if (tgtBone) {
                    this._hipSrcName = pair.srcName;
                    this._hipTgtName = pair.tgtName;
                    this._bindHipLocalPosS.copy(srcBone.t);
                    this._bindHipLocalPosT.copy(tgtBone.t);
                }
                break;
            }
        }

        if (!this._useRestOffset) return;

        // Pre-compute bind worldQ via FK over the bind-pose local
        // quats for both rigs, using each rig's current Character
        // rotation as the starting frame. boneData is DFS so parents
        // come before children.
        computeBindWorldRotations(srcAvatar, this._rootRotS, this._bindWorldS);
        computeBindWorldRotations(tgtAvatar, this._rootRotT, this._bindWorldT);

        // Auto-rotate target's Character node so its bind hip world
        // matches source's. This is the only way to achieve "target
        // faces source's direction in TPose" without distorting the
        // mesh: the rotation lifts the entire target uniformly in
        // world while leaving every bone's localQ at its authored bind
        // value. After this we update `_rootRotT` and re-FK the bind
        // worlds so the per-bone offsets below see the post-rotation
        // values.
        if (this._alignTPoseFacing && tgtCharObj) {
            const rootSrc = this._hipSrcName ?? out[0]?.srcName;
            const rootTgt = this._hipTgtName ?? out[0]?.tgtName;
            const bindWS = rootSrc ? this._bindWorldS.get(rootSrc) : undefined;
            const bindWT = rootTgt ? this._bindWorldT.get(rootTgt) : undefined;
            if (bindWS && bindWT) {
                // Q_align = bindWS * inv(bindWT) — rotate target's
                // Character by this and its bind hip world becomes bindWS.
                const invBindWT = new Quaternion(-bindWT.x, -bindWT.y, -bindWT.z, bindWT.w);
                const qAlign = new Quaternion();
                qAlign.multiply(bindWS, invBindWT);
                const oldChar = new Quaternion();
                oldChar.copy(tgtCharObj.localQuaternion);
                const newChar = new Quaternion();
                newChar.multiply(qAlign, oldChar);
                tgtCharObj.localQuaternion = newChar;
                this._rootRotT.copy(newChar);
                computeBindWorldRotations(tgtAvatar, this._rootRotT, this._bindWorldT);
            }
        }

        // Pre-compute per-bone world-space offsets:
        //   offset[bone] = inv(bindWorldS[srcBone]) * bindWorldT[tgtBone]
        // Used per frame as
        //   target_world[bone] = sourceCurrentWorld[bone] * offset[bone]
        // At TPose target_world == bindWorldT[bone] → target stays in
        // its own bind, *no* mesh distortion at any bone. During motion
        // the per-bone skin matrix collapses to source's own world
        // delta from its bind — anatomical motion transfers cleanly
        // even when bind world orientations differ across rigs.
        this._offset.clear();
        for (const pair of out) {
            const bws = this._bindWorldS.get(pair.srcName);
            const bwt = this._bindWorldT.get(pair.tgtName);
            if (!bws || !bwt) continue;
            const off = new Quaternion();
            const invBws = new Quaternion(-bws.x, -bws.y, -bws.z, bws.w);
            off.multiply(invBws, bwt);
            this._offset.set(pair.tgtName, off);
        }
    }

    public get resolvedMapping(): ReadonlyArray<[string, string]> {
        if (this._resolved === null) this.buildMapping();
        return this._resolved!.map(r => [r.srcName, r.tgtName] as [string, string]);
    }

    /**
     * Per-frame retarget. Call from your render loop AFTER the source
     * Animator's own update has run.
     */
    public apply(): void {
        if (this._resolved === null) this.buildMapping();
        if (!this._resolved || this._resolved.length === 0) return;

        if (!this._useRestOffset) {
            for (const pair of this._resolved) {
                const sBone = this._source.getJointObject(pair.srcName);
                const tBone = this._target.getJointObject(pair.tgtName);
                if (sBone && tBone) tBone.localQuaternion = sBone.localQuaternion;
            }
            this._applyHipPosition();
            return;
        }

        const srcAvatar = this._source.getAvatar();
        const tgtAvatar = this._target.getAvatar();
        if (!srcAvatar || !tgtAvatar) return;

        // Step 1: source FK in DFS order to get each source bone's
        // current world rotation.
        const cwS = this._currentWorldS;
        cwS.clear();
        for (const bone of srcAvatar.boneData) {
            const obj = this._source.getJointObject(bone.boneName);
            if (!obj) continue;
            const w = new Quaternion();
            if (bone.parentBoneName && cwS.has(bone.parentBoneName)) {
                w.multiply(cwS.get(bone.parentBoneName)!, obj.localQuaternion);
            } else {
                w.multiply(this._rootRotS, obj.localQuaternion);
            }
            cwS.set(bone.boneName, w);
        }

        // Step 2: target FK in DFS order. For retargeted bones:
        //   target_world[bone] = sourceCurrentWorld[srcBone] * offset[bone]
        //   target.localQ = inv(parentCurrentWorld_T) * target_world
        // The per-bone offset (`inv(bindWorldS) * bindWorldT_aligned`)
        // ensures target stays at its own bind world in TPose (no skin
        // distortion) and gets source's world delta from bind during
        // motion. Non-retargeted bones FK from their existing localQ.
        const cwT = this._currentWorldT;
        cwT.clear();
        for (const bone of tgtAvatar.boneData) {
            const obj = this._target.getJointObject(bone.boneName);
            if (!obj) continue;
            const parent = bone.parentBoneName && cwT.has(bone.parentBoneName)
                ? cwT.get(bone.parentBoneName)!
                : this._rootRotT;
            const srcName = this._tgtToSrc.get(bone.boneName);
            const srcCurW = srcName ? cwS.get(srcName) : undefined;
            const offset = this._offset.get(bone.boneName);
            const w = new Quaternion();
            if (srcCurW && offset) {
                w.multiply(srcCurW, offset);
                this._scratchInvParentT.set(-parent.x, -parent.y, -parent.z, parent.w);
                this._scratchOut.multiply(this._scratchInvParentT, w);
                obj.localQuaternion = this._scratchOut;
            } else {
                w.multiply(parent, obj.localQuaternion);
            }
            cwT.set(bone.boneName, w);
        }

        // Hip translation (root motion).
        this._applyHipPosition();
    }

    /**
     * Replay the source hip's bind-relative translation delta on the
     * target hip, transformed across the two rigs' Character frames
     * and scaled by `heightScale`. Skipped when `preserveHipPosition`
     * is true or when no hip pair was resolved at buildMapping.
     */
    private _applyHipPosition(): void {
        if (this._preserveHipPosition) return;
        if (!this._hipSrcName || !this._hipTgtName) return;

        const sourceHip = this._source.getJointObject(this._hipSrcName);
        const targetHip = this._target.getJointObject(this._hipTgtName);
        if (!sourceHip || !targetHip) return;

        // delta in source character-local frame.
        const sLocal = sourceHip.localPosition;
        this._scratchHipDelta.set(
            sLocal.x - this._bindHipLocalPosS.x,
            sLocal.y - this._bindHipLocalPosS.y,
            sLocal.z - this._bindHipLocalPosS.z,
        );
        // → world: delta_world = rootRot_S * delta_char_S
        Quaternion.transformVector(this._rootRotS, this._scratchHipDelta, this._scratchHipDelta);
        // → target character-local: delta_char_T = inv(rootRot_T) * delta_world
        this._scratchInvRootRotT.set(-this._rootRotT.x, -this._rootRotT.y, -this._rootRotT.z, this._rootRotT.w);
        Quaternion.transformVector(this._scratchInvRootRotT, this._scratchHipDelta, this._scratchHipDelta);
        // Apply with height scale on top of target's bind hip position.
        this._scratchHipPos.set(
            this._bindHipLocalPosT.x + this._scratchHipDelta.x * this._heightScale,
            this._bindHipLocalPosT.y + this._scratchHipDelta.y * this._heightScale,
            this._bindHipLocalPosT.z + this._scratchHipDelta.z * this._heightScale,
        );
        targetHip.localPosition = this._scratchHipPos;
    }

    /**
     * Strip the first matching prefix in `_bonePrefixes` (case-insensitive)
     * from a bone name. Used for fuzzy cross-rig name matching when no
     * explicit `nameMap` entry is provided.
     */
    private _stripPrefix(name: string): string {
        const lower = name.toLowerCase();
        for (const p of this._bonePrefixes) {
            if (lower.startsWith(p.toLowerCase())) return name.slice(p.length);
        }
        return name;
    }
}

function computeBindWorldRotations(avatar: PrefabAvatarData, rootRot: Quaternion, out: Map<string, Quaternion>): void {
    out.clear();
    for (const bone of avatar.boneData) {
        const local = bone.q;
        const world = new Quaternion();
        if (bone.parentBoneName && out.has(bone.parentBoneName)) {
            const parentWorld = out.get(bone.parentBoneName)!;
            world.multiply(parentWorld, local);
        } else {
            world.multiply(rootRot, local);
        }
        out.set(bone.boneName, world);
    }
}
