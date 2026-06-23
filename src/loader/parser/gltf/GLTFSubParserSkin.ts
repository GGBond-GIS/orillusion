import { GLTF_Info } from "./GLTFInfo";
import { GLTFParser } from "./GLTFParser";
import { GLTFSubParser } from "./GLTFSubParser";
import { GLTFType } from "./GLTFType";

/**
 * Internal glTF sub-parser stage that resolves a glTF skin: it reads the
 * joint list and inverse bind matrices, and derives the skeleton root
 * node (the joints' common root when `skin.skeleton` is omitted).
 *
 * @internal
 */
export class GLTFSubParserSkin {
    protected gltf: GLTF_Info;
    protected subParser: GLTFSubParser;

    constructor(subParser: GLTFSubParser) {
        this.gltf = subParser.gltf;
        this.subParser = subParser;
    }

    public parse(skinId) {
        const skin = this.gltf.skins[skinId];

        if (!skin)
            return this.errorMiss('skin', skinId);

        if (skin.isParsed)
            return skin.dskin;

        const { name, joints, inverseBindMatrices, skeleton } = skin;

        if (!joints)
            return this.errorMiss('skin.joints', skinId);

        skin.isParsed = true;
        skin.dskin = false;
        let dskin = {
            name,
            skeleton: null,
            inverseBindMatrices: null,
            joints,
            defines: [GLTFParser.getJointsNumDefine(joints.length)],
        };

        if (skeleton !== undefined && skeleton !== null) {
            dskin.skeleton = skeleton;
        } else {
            // glTF spec: when skin.skeleton is omitted, the joints' common
            // root is implied. Find it by checking which joint(s) have a
            // parent that is NOT itself in the joints list — those are the
            // top-level joints. If exactly one, that's the skeleton root.
            // Earlier code picked `scene.nodes[last]`, which on Kira's
            // bedroom GLB returned the "window2" furniture node (yielding
            // a 1-joint skeleton with no character bones).
            const jointSet = new Set<number>(joints);
            const parentOf: number[] = new Array(this.gltf.nodes.length).fill(-1);
            for (let i = 0; i < this.gltf.nodes.length; i++) {
                const n = this.gltf.nodes[i];
                if (n.children) {
                    for (const c of n.children) parentOf[c] = i;
                }
            }
            const rootJoints: number[] = [];
            for (const j of joints) {
                if (!jointSet.has(parentOf[j])) rootJoints.push(j);
            }
            let rootNodeId = -1;
            if (rootJoints.length === 1) {
                rootNodeId = rootJoints[0];
            } else if (rootJoints.length > 1) {
                // Multiple top-level joints — walk up from the first joint
                // to find the closest ancestor that is an ancestor of all
                // other root joints. As a pragmatic fallback, pick the first.
                rootNodeId = rootJoints[0];
            }
            if (rootNodeId === -1) {
                // Pre-existing legacy fallback (kept only as last resort).
                for (let i = 0; i < this.gltf.nodes.length; i++) {
                    if (this.gltf.nodes[i].name == 'root') { rootNodeId = i; break; }
                }
                if (rootNodeId === -1) {
                    const scene = this.gltf.scenes[this.gltf.scene];
                    rootNodeId = scene.nodes[scene.nodes.length - 1];
                }
            }
            dskin.skeleton = rootNodeId;
        }
        // dskin.skeleton = skeleton === undefined ? GLTFParser.SCENE_ROOT_SKELETON : skeleton;
        dskin.inverseBindMatrices = GLTFType.IDENTITY_INVERSE_BIND_MATRICES;

        if (inverseBindMatrices !== undefined) {
            const accessor = this.parseAccessor(inverseBindMatrices);
            if (accessor) {
                const array = accessor.data;
                const matrices = [];
                for (let i = 0; i < array.length; i += 16) matrices.push(array.slice(i, i + 16));

                dskin.inverseBindMatrices = matrices;
            } else dskin = null;
        }

        skin.dskin = dskin;
        return skin.dskin;
    }

    private parseAccessor(accessorId) {
        return this.subParser.parseAccessor(accessorId);
    }

    private errorMiss(e, info?) {
        throw new Error(e + info);
    }
}
