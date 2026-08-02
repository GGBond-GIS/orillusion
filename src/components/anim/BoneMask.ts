/**
 * Bone mask: opt-in set of bone names that an AnimationLayer is allowed to
 * write to. A null/empty mask means "all bones" (the default for layer 0).
 *
 * Implementation: a `Set<string>` of bone names. We could pack into a bitset
 * keyed by bone index for higher-throughput compute paths, but at our current
 * scale (a few hundred Animators × ~80 joints) the Set lookup is already
 * nanoseconds and not a hot path.
 *
 * Subtree helpers — `addSubtree` / `removeSubtree` — walk the bone hierarchy
 * captured in `PrefabAvatarData` so callers can mask "everything below the
 * spine" without enumerating every joint name.
 *
 * @group Animation
 */
import { PrefabAvatarData } from "../../loader/parser/prefab/prefabData/PrefabAvatarData";
import { PrefabBoneData } from "../../loader/parser/prefab/prefabData/PrefabBoneData";

export class BoneMask {
    private _bones: Set<string> = new Set();

    public get bones(): ReadonlySet<string> { return this._bones; }
    public get size(): number { return this._bones.size; }

    public has(boneName: string): boolean { return this._bones.has(boneName); }
    public add(boneName: string): this { this._bones.add(boneName); return this; }
    public addAll(boneNames: Iterable<string>): this { for (const n of boneNames) this._bones.add(n); return this; }
    public remove(boneName: string): this { this._bones.delete(boneName); return this; }
    public clear(): this { this._bones.clear(); return this; }

    /** Add `rootBone` and every descendant (recursively) to the mask. */
    public addSubtree(avatar: PrefabAvatarData, rootBone: string): this {
        const root = avatar.boneMap.get(rootBone);
        if (!root) return this;
        const visit = (b: PrefabBoneData) => {
            this._bones.add(b.boneName);
            for (const child of avatar.boneData) {
                if (child.parentBoneName === b.boneName) visit(child);
            }
        };
        visit(root);
        return this;
    }

    public removeSubtree(avatar: PrefabAvatarData, rootBone: string): this {
        const root = avatar.boneMap.get(rootBone);
        if (!root) return this;
        const visit = (b: PrefabBoneData) => {
            this._bones.delete(b.boneName);
            for (const child of avatar.boneData) {
                if (child.parentBoneName === b.boneName) visit(child);
            }
        };
        visit(root);
        return this;
    }
}
