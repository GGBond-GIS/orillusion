import { CurveValueType, ValueParser } from "../../../loader/parser/prefab/prefabData/ValueParser";
import { ValueEnumType } from "../../../loader/parser/prefab/prefabData/ValueType";
import { BytesArray } from "../../../util/BytesArray";
import { Quaternion } from "../../Quaternion";
import { Vector2 } from "../../Vector2";
import { Vector3 } from "../../Vector3";
import { Vector4 } from "../../Vector4";
import { Keyframe } from "../Keyframe";

/**
 * @group Math
 */
export class KeyframeT {
    /** Serialized format version of this keyframe. */
    public serializedVersion: string = '2';
    /** Time of this keyframe. */
    public time: number;
    /** Tangent mode flags for this keyframe. */
    public tangentMode: number = 0;
    /** Weighted mode flags for this keyframe. */
    public weightedMode: number = 0;
    // public value: CurveValueType;
    // public inSlope: CurveValueType;
    // public outSlope: CurveValueType;
    // public inWeight: CurveValueType
    // public outWeight: CurveValueType

    /** Map of channel index to its per-channel keyframe. */
    public propertyKeyFrame: { [k: number]: Keyframe };

    constructor(time: number = 0) {
        this.time = time;
        this.propertyKeyFrame = {};
    }

    /**
     * Get the per-channel keyframe stored at the given channel index.
     * @param k channel index
     * @returns the keyframe for that channel
     */
    public getK(k: number) {
        return this.propertyKeyFrame[k];
    }

    /**
     * Split a multi-component value into per-channel keyframes, writing it to the given property.
     * @param type value type describing the component layout
     * @param value the value to distribute across channels
     * @param property the keyframe property name to assign (e.g. value, inSlope, outSlope)
     */
    public split(type: ValueEnumType, value: CurveValueType, property: string) {
        switch (type) {
            case ValueEnumType.single:
                {
                    let keyFrame = this.getKeyFrame(0);
                    keyFrame[property] = value;
                }
                break;
            case ValueEnumType.float:
                {
                    let keyFrame = this.getKeyFrame(0);
                    keyFrame[property] = value;
                }
                break;
            case ValueEnumType.vector2:
                {
                    let v = value as Vector2;
                    let x_kf = this.getKeyFrame(0);
                    x_kf[property] = v.x;
                    let y_kf = this.getKeyFrame(1);
                    y_kf[property] = v.y;
                }
                break;
            case ValueEnumType.vector3:
                {
                    let v = value as Vector3;
                    let x_kf = this.getKeyFrame(0);
                    x_kf[property] = v.x;
                    let y_kf = this.getKeyFrame(1);
                    y_kf[property] = v.y;
                    let z_kf = this.getKeyFrame(2);
                    z_kf[property] = v.z;
                }
                break;
            case ValueEnumType.vector4:
                {
                    let v = value as Vector4;
                    let x_kf = this.getKeyFrame(0);
                    x_kf[property] = v.x;
                    let y_kf = this.getKeyFrame(1);
                    y_kf[property] = v.y;
                    let z_kf = this.getKeyFrame(2);
                    z_kf[property] = v.z;
                    let w_kf = this.getKeyFrame(3);
                    w_kf[property] = v.w;
                }
                break;
            case ValueEnumType.quaternion:
                {
                    let v = value as Quaternion;
                    let x_kf = this.getKeyFrame(0);
                    x_kf[property] = v.x;
                    let y_kf = this.getKeyFrame(1);
                    y_kf[property] = v.y;
                    let z_kf = this.getKeyFrame(2);
                    z_kf[property] = v.z;
                    let w_kf = this.getKeyFrame(3);
                    w_kf[property] = v.w;
                }
                break;
        }
    }

    private getKeyFrame(k: number): Keyframe {
        let keyFrame = this.propertyKeyFrame[k];
        if (!keyFrame) {
            keyFrame = new Keyframe();
            keyFrame.time = this.time;
            keyFrame.tangentMode = this.tangentMode;
            keyFrame.weightedMode = this.weightedMode;
            this.propertyKeyFrame[k] = keyFrame;
        }

        return keyFrame;
    }

    /**
     * Read this keyframe and its per-channel data from a binary byte stream.
     * @param bytes source byte array
     */
    public formBytes(bytes: BytesArray) {
        this.time = bytes.readFloat32();
        {
            let { t, v } = ValueParser.parser(bytes);
            this.split(t, v, "value");
        }
        {
            let { t, v } = ValueParser.parser(bytes);
            this.split(t, v, "inSlope");
        }
        {
            let { t, v } = ValueParser.parser(bytes);
            this.split(t, v, "outSlope");
        }
        this.tangentMode = bytes.readInt32();
        this.weightedMode = bytes.readInt32();
        {
            let { t, v } = ValueParser.parser(bytes);
            this.split(t, v, "inWeight");
        }
        {
            let { t, v } = ValueParser.parser(bytes);
            this.split(t, v, "outWeight");
        }
    }
}