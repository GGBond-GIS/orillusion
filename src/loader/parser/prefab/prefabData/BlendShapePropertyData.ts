import { BytesArray } from "../../../..";
import { BlendShapeFrameData } from "./BlendShapeFrameData";

/**
 * Internal data carrier for a single blend-shape (morph target), holding its
 * name, index and the position/normal delta lists decoded from the stream.
 * @internal
 */
export class BlendShapePropertyData {
    public shapeName: string;
    public shapeIndex: number;
    public frameCount: number;
    // public blendShapeFrameDatas: BlendShapeFrameData[];
    public blendPositionList: Float32Array = new Float32Array();
    public blendNormalList: Float32Array = new Float32Array();
    public formBytes(byteArray: BytesArray) {
        let bytes = byteArray.readBytesArray();

        this.shapeName = bytes.readUTF();
        this.shapeIndex = bytes.readInt32();
        this.frameCount = bytes.readInt32();

        let len = bytes.readInt32();
        this.blendPositionList = bytes.readFloat32Array(len * 3);

        let len2 = bytes.readInt32();
        this.blendNormalList = bytes.readFloat32Array(len2 * 3);
    }
}