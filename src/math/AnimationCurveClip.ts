import { PingPong, RepeatSE } from './MathUtil';
import { FrameCache } from './enum/FrameCache';
import { WrapTimeMode } from './enum/WrapTimeMode';
import { Keyframe } from './enum/Keyframe';
import { AnimationCurve, AnimationCurveT, BytesArray, KeyframeT } from '..';

/**
 * Animation Curve 
 * has frame list data 
 * @group Math
 */
export class PropertyAnimationClip {
    /** Name of the animation clip. */
    public clipName: string;
    /** Whether the clip loops over time. */
    public loopTime: boolean;
    /** Start time of the clip in seconds. */
    public startTime: number;
    /** Stop time of the clip in seconds. */
    public stopTime: number;
    /** Number of samples per second used when authoring the clip. */
    public sampleRate: number;
    /** Whether the clip drives skeleton position curves. */
    public useSkeletonPos: boolean;
    /** Whether the clip drives skeleton scale curves. */
    public useSkeletonScale: boolean;
    /** Position animation curves keyed by node path. */
    public positionCurves: Map<string, AnimationCurveT> = new Map<string, AnimationCurveT>();
    /** Rotation animation curves keyed by node path. */
    public rotationCurves: Map<string, AnimationCurveT> = new Map<string, AnimationCurveT>();
    /** Scale animation curves keyed by node path. */
    public scaleCurves: Map<string, AnimationCurveT> = new Map<string, AnimationCurveT>();
    /** Float-property animation curves keyed by attribute name. */
    public floatCurves: Map<string, AnimationCurveT> = new Map<string, AnimationCurveT>();

    /** Deserialize the clip and all its curves from the given byte stream. */
    public formBytes(bytes: BytesArray) {
        this.clipName = bytes.readUTF();
        this.loopTime = bytes.readInt32() ? false : true;
        this.startTime = bytes.readFloat32();
        this.stopTime = bytes.readFloat32();
        this.sampleRate = bytes.readInt32();
        this.useSkeletonPos = bytes.readInt32() > 0;
        this.useSkeletonScale = bytes.readInt32() > 0;
        if (this.useSkeletonPos) {
            let positionCurvesCount = bytes.readInt32();
            for (let i = 0; i < positionCurvesCount; i++) {
                let curveData = new AnimationCurveT();
                curveData.formBytes(bytes);
                this.positionCurves.set(curveData.path, curveData);
            }
        }

        let rotationCurvesCount = bytes.readInt32();
        for (let i = 0; i < rotationCurvesCount; i++) {
            let curveData = new AnimationCurveT();
            curveData.formBytes(bytes);
            this.rotationCurves.set(curveData.path, curveData);
        }

        if (this.useSkeletonScale) {
            let scaleCurvesCount = bytes.readInt32();
            for (let i = 0; i < scaleCurvesCount; i++) {
                let curveData = new AnimationCurveT();
                curveData.formBytes(bytes);
                this.scaleCurves.set(curveData.path, curveData);
            }
        }

        let floatCurvesCount = bytes.readInt32();
        for (let i = 0; i < floatCurvesCount; i++) {
            let curveData = new AnimationCurveT();
            curveData.formBytes(bytes);
            this.floatCurves.set(curveData.attribute, curveData);
        }
    }
}
