import { Engine3D } from "../../../Engine3D";
import { GeometryBase, LODDescriptor } from "../../../core/geometry/GeometryBase";
import { GeometryVertexType } from "../../../core/geometry/GeometryVertexType";
import { VertexAttributeName } from "../../../core/geometry/VertexAttributeName";
import { BytesArray } from "../../../util/BytesArray";
import { ParserBase } from "../ParserBase";
import { ParserFormat } from "../ParserFormat";
import { PrefabParser } from "./PrefabParser";
import { PrefabAvatarData } from "./prefabData/PrefabAvatarData";


/**
 * Parses avatar (skeleton) blocks from an Orillusion prefab binary stream.
 * Each decoded {@link PrefabAvatarData} is registered with the engine's
 * resource host so meshes and animations can later bind to the skeleton.
 * @group Loader
 */
export class PrefabAvatarParser extends ParserBase {
    static format: ParserFormat = ParserFormat.BIN;
    /**
     * Read every avatar block from the stream and register the resulting
     * {@link PrefabAvatarData} instances on the resource host.
     * @param bytesStream the prefab binary stream positioned at the avatar section.
     * @param prefabParser the owning prefab parser, used for context lookup.
     */
    public static parser(bytesStream: BytesArray, prefabParser: PrefabParser) {
        let avatarCount = bytesStream.readInt32();
        for (let j = 0; j < avatarCount; j++) {
            let prefabAvatarData = new PrefabAvatarData();
            prefabAvatarData.formBytes(bytesStream.readBytesArray());
            Engine3D.resFor(prefabParser.ctx).addObj(prefabAvatarData.name, prefabAvatarData);
        }
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

let MeshVertexAttribute = {
    "Position": VertexAttributeName.position,
    "Normal": VertexAttributeName.normal,
    "Color": VertexAttributeName.color,
    "Tangent": VertexAttributeName.TANGENT,
    "TexCoord0": VertexAttributeName.uv,
    "TexCoord1": VertexAttributeName.TEXCOORD_1,
    "TexCoord2": VertexAttributeName.TEXCOORD_2,
    "TexCoord3": VertexAttributeName.TEXCOORD_2,
    "TexCoord4": VertexAttributeName.TEXCOORD_4,
    "TexCoord5": VertexAttributeName.TEXCOORD_5,
    "TexCoord6": VertexAttributeName.TEXCOORD_6,
    "TexCoord7": VertexAttributeName.TEXCOORD_7,
    "BlendIndices": VertexAttributeName.joints0,
    "BlendWeight": VertexAttributeName.weights0,
}




