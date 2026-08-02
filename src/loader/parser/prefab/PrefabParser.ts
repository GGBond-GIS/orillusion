import { Engine3D } from "../../../Engine3D";
import { MeshFilter } from "../../../components/renderer/MeshFilter";
import { SkinnedMeshRenderer } from "../../../components/renderer/SkinnedMeshRenderer";
import { Object3D } from "../../../core/entities/Object3D";
import { GeometryBase } from "../../../core/geometry/GeometryBase";
import { Material } from "../../../materials/Material";
import { Quaternion } from "../../../math/Quaternion";
import { Vector3 } from "../../../math/Vector3";
import { BitmapTexture2D } from "../../../textures/BitmapTexture2D";
import { BytesArray } from "../../../util/BytesArray";
import { GetComponentClass } from "../../../util/SerializeDecoration";
import { ParserBase } from "../ParserBase";
import { ParserFormat } from "../ParserFormat";
import { PrefabAvatarParser } from "./PrefabAvatarParser";
import { PrefabMaterialParser } from "./PrefabMaterialParser";
import { PrefabMeshParser } from "./PrefabMeshParser";
import { PrefabTextureParser } from "./PrefabTextureParser";
import { LitSSSShader } from "./mats/shader/LitSSSShader";
import { LitShader } from "./mats/shader/LitShader";
import { PrefabAvatarData } from "./prefabData/PrefabAvatarData";
import { PrefabNode } from "./prefabData/PrefabNode";
import { ValueParser } from "./prefabData/ValueParser";

LitShader;
LitSSSShader;
/**
 * Top-level parser for the Orillusion prefab (`.prefab`) binary format. It
 * drives the sub-parsers in order (textures, avatars, meshes, materials, node
 * tree) and reconstructs the prefab as a hierarchy of {@link Object3D} nodes
 * with their attached components.
 * @group Loader
 */
export class PrefabParser extends ParserBase {
    /**
     * When true, texture URLs are rewritten to the `webp` variant before loading.
     */
    public static useWebp: boolean = true;
    static format: ParserFormat = ParserFormat.BIN;
    /**
     * Map of decoded avatar (skeleton) data keyed by avatar name.
     */
    public avatarDic: { [name: string]: PrefabAvatarData };
    /**
     * Root node of the decoded prefab hierarchy.
     */
    public nodeData: PrefabNode;
    /**
     * Decode the prefab buffer: parse textures, avatars, meshes, materials and
     * the node tree, then build the resulting {@link Object3D} hierarchy into `data`.
     * @param buffer the raw prefab binary buffer.
     */
    public async parseBuffer(buffer: ArrayBuffer) {
        this.avatarDic = {};

        // Stash ctx for deep-lookup helpers (ValueParser) that can't easily
        // receive it as a parameter through recursive bytecode decoding.
        const prevCtx = ValueParser._currentCtx;
        ValueParser._currentCtx = this.ctx;
        try {
            let bytesStream = new BytesArray(buffer, 0);

            await PrefabTextureParser.parserTexture(bytesStream, this, this.loaderFunctions);

            PrefabAvatarParser.parser(bytesStream, this);

            PrefabMeshParser.parserMeshs(bytesStream, this);

            PrefabMaterialParser.parserMaterial(bytesStream, this);

            this.nodeData = this.parserPrefabNode(bytesStream);

            this.data = this.data = this.parserNodeTree(this.nodeData);
        } finally {
            ValueParser._currentCtx = prevCtx;
        }
    }

    private parserPrefabNode(bytesStream: BytesArray) {
        let rootNodeData = PrefabNode.parser(bytesStream);
        return rootNodeData;
    }

    private parserNodeTree(nodeData: PrefabNode) {
        let root = new Object3D();
        root.localPosition = Vector3.serialize(nodeData.position);
        root.localQuaternion = Quaternion.serialize(nodeData.rotation);
        root.localScale = Vector3.serialize(nodeData.scale);
        root.name = nodeData.name;
        if (nodeData.comDatas) {
            for (let i = 0; i < nodeData.comDatas.length; i++) {
                const comData = nodeData.comDatas[i];
                let com = null;
                let comClass = GetComponentClass(comData.comName);
                if (comClass) {
                    com = root.getOrAddComponent(comClass);
                    for (let j = 0; j < comData.data.length; j++) {
                        const kv = comData.data[j];
                        if (kv.key in com) {
                            com[kv.key] = kv.getValue();
                        }
                    }
                } else {
                    // console.warn("no component", comData.comName);
                }
            }
        }

        if (nodeData.child && nodeData.child.length > 0) {
            for (let j = 0; j < nodeData.child.length; j++) {
                let child = this.parserNodeTree(nodeData.child[j]);
                root.addChild(child);
            }
        }
        return root;
    }

    /**
     * Verify that parsing produced valid data.
     * @returns true when data is present; throws otherwise.
     */
    public verification(): boolean {
        if (this.data) {
            return true;
        }
        throw new Error('verify failed.');
    }
}
