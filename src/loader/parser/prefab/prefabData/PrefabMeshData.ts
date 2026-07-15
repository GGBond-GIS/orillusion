import { Matrix4 } from "../../../..";
import { BlendShapeData } from "./BlendShapeData";

/**
 * Internal data carrier for a decoded mesh: vertex/index buffers, attribute
 * layout and optional skeleton bindings and blend-shape data.
 * @internal
 */
export class PrefabMeshData {
    public name: string;
    public meshName: string;
    public meshID: string;
    public vertexCount: number;
    public vertexStrip: number;
    public vertexBuffer: Float32Array;
    public indices: Uint16Array | Uint32Array;

    public attributes: { attribute: string, dim: number, pos: number }[];

    public bones: string[];
    public bindPose: Matrix4[];
    public blendShapeData: BlendShapeData;
}