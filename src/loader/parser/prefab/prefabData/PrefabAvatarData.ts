import { BytesArray } from "../../../../util/BytesArray";
import { PrefabBoneData } from "./PrefabBoneData";

/**
 * Internal data carrier for a decoded avatar (skeleton): its name, bone list
 * and a name-to-bone lookup map.
 * @internal
 */
export class PrefabAvatarData {
    public name: string;
    public count: number;
    public boneData: PrefabBoneData[];
    public boneMap: Map<string, PrefabBoneData>;
    public formBytes(bytes: BytesArray) {
        this.boneData = [];
        this.boneMap = new Map<string, PrefabBoneData>();

        this.name = bytes.readUTF();
        this.count = bytes.readInt32();
        for (let i = 0; i < this.count; i++) {
            let boneData = new PrefabBoneData();
            boneData.formBytes(bytes.readBytesArray());
            this.boneData[i] = boneData;

            this.boneMap.set(boneData.boneName, boneData);
        }
    }
}