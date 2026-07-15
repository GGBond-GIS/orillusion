import { BytesArray, ValueParser } from "../..";

/**
 * @group Math
 */
export class Keyframe {
    /** Serialization format version of this keyframe. */
    public serializedVersion: string = '2';
    /** Time of the keyframe in seconds. */
    public time: number;
    /** Value of the keyframe at its time. */
    public value: number;
    /** Incoming tangent slope. */
    public inSlope: number = 0;
    /** Outgoing tangent slope. */
    public outSlope: number = 0;
    /** Tangent mode flags controlling how slopes are computed. */
    public tangentMode: number = 0;

    /** Weighted mode flags controlling whether in/out weights are used. */
    public weightedMode: number = 0;
    /** Incoming tangent weight. */
    public inWeight: number;
    /** Outgoing tangent weight. */
    public outWeight: number;

    constructor(time: number = 0, value: number = 0) {
        this.time = time;
        this.value = value;
    }

    /** Populate this keyframe from a serialized object using inSlope/outSlope fields. */
    public unSerialized(data: any) {
        this.serializedVersion = data['serializedVersion'];
        this.time = data['time'];
        this.value = data['value'];
        this.tangentMode = data['tangentMode'];
        this.inSlope = data['inSlope'] == 'Infinity' ? NaN : data['inSlope'];
        this.outSlope = data['outSlope'] == 'Infinity' ? NaN : data['outSlope'];
    }

    /** Populate this keyframe from a serialized object using inTangent/outTangent fields. */
    public unSerialized2(data: any) {
        this.serializedVersion = data['serializedVersion'];
        this.time = data['time'];
        this.value = data['value'];
        this.tangentMode = data['tangentMode'];
        this.inSlope = data['inTangent'] == 'Infinity' ? NaN : data['inTangent'];
        this.outSlope = data['outTangent'] == 'Infinity' ? NaN : data['outTangent'];
    }

}