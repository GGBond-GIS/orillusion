import { PingPong, RepeatSE, swap } from './MathUtil';
import { FrameCache } from './enum/FrameCache';
import { WrapTimeMode } from './enum/WrapTimeMode';
import { Keyframe } from './enum/Keyframe';
import { AnimationCurve, BytesArray, KeyframeT, Quaternion, Vector2, Vector3, Vector4 } from '..';

export type CurveValueT = number | Vector2 | Vector3 | Vector4 | Quaternion;
/**
 * Animation Curve 
 * has frame list data 
 * @group Math
 */
export class AnimationCurveT {
    /** Target node path this curve animates. */
    public path: string;
    /** Animated attribute name. */
    public attribute: string;
    /** Attribute split into its component property names. */
    public propertys: string[];
    /** Wrap mode applied for times before the first keyframe. */
    public preInfinity: number;
    /** Wrap mode applied for times after the last keyframe. */
    public postInfinity: number;
    /** Euler rotation order associated with this curve. */
    public rotationOrder: number;
    /** Per-channel scalar animation curves. */
    public m_curves: AnimationCurve[];
    private k: number = 0;

    private _cacheValue: any;
    private _kValue: CurveValueT;

    constructor(k: number = 1) {
        this.k = k;
        this.m_curves = [];
        this.check();
    }

    private check() {
        for (let i = 0; i < this.k; i++) {
            this.m_curves[i] ||= new AnimationCurve();
        }
        switch (this.k) {
            case 1:
                this._cacheValue = 0;
                break;
            case 2:
                this._cacheValue = new Vector2();
                break;
            case 3:
                this._cacheValue = new Vector3();
                break;
            case 4:
                this._cacheValue = new Vector4();
                break;
            default:
                break;
        }
    }

    /**
     * return this curve use total time
     */
    public get totalTime() {
        return this.m_curves[0].totalTime;
    }

    /**
     * add keyFrame to curve keyframe last and calcTotalTime
     * @param keyFrame {@link Keyframe}  sea: one key frame data
     */
    public addKeyFrame(keyFrame: KeyframeT) {
        for (let i = 0; i < this.k; i++) {
            this.m_curves[i].addKeyFrame(keyFrame.getK(i));
        }
    }

    /**
     * remove keyframe from this curve
     * @param keyFrame {@link Keyframe} 
     */
    public removeKeyFrame(keyFrame: KeyframeT) {
        for (let i = 0; i < this.k; i++) {
            this.m_curves[i].removeKeyFrame(keyFrame.getK(i));
        }
    }

    /**
     * get caculate frames value 
     * @param time 
     * @returns 
     */
    public getValue(time: number): CurveValueT {
        switch (this.k) {
            case 1:
                this._cacheValue = this.m_curves[0].getValue(time);
                break;
            case 2:
                this._cacheValue.x = this.m_curves[0].getValue(time);
                this._cacheValue.y = this.m_curves[1].getValue(time);
                break;
            case 3:
                this._cacheValue.x = this.m_curves[0].getValue(time);
                this._cacheValue.y = this.m_curves[1].getValue(time);
                this._cacheValue.z = this.m_curves[2].getValue(time);
                break;
            case 4:
                const extent = this.m_curves[0].getCurveFramesExtent(time);
                const lhsIndex = extent.lhsIndex;
                const rhsIndex = extent.rhsIndex;
                time = extent.time;

                let kL = this.m_curves[0].getKey(lhsIndex);
                let kR = this.m_curves[0].getKey(rhsIndex);

                // Same-frame case (single keyframe / time clamped to a
                // keyframe / lhs===rhs from findCurve): just take the lhs
                // sample. Without this guard the divide below is 0 / 0 →
                // NaN quaternion → downstream `multiply` and `slerp` all
                // propagate NaN, blowing up the animation/layer stack.
                if (lhsIndex === rhsIndex || kR.time === kL.time) {
                    this._cacheValue.x = this.m_curves[0].getKey(lhsIndex).value;
                    this._cacheValue.y = this.m_curves[1].getKey(lhsIndex).value;
                    this._cacheValue.z = this.m_curves[2].getKey(lhsIndex).value;
                    this._cacheValue.w = this.m_curves[3].getKey(lhsIndex).value;
                    break;
                }

                // NOTE: do NOT modulo `time` by `totalTime` here.
                // `extent.time` already came out of `wrapTime` so it's
                // inside the curve's [first, last] range. The modulo
                // would map `time === lastKey.time` (== totalTime when
                // firstKey is 0; or even when not — `calcTotalTime` uses
                // max key time) back to 0, which then computes
                // `t = (0 - kL.time) / span` as a NEGATIVE number.
                // slerp(t<0) extrapolates beyond kL, producing the
                // INVERSE rotation (e.g. sad_pose's forward bend
                // becomes a backward arch — the regression that struck
                // when the static-pose path pinned `layer.time =
                // layer._lastKeyTime`). `findCurve` already clamped
                // lhs/rhs at the lastKey boundary, so just compute t
                // straight from the wrapped time.
                let t = (time - kL.time) / (kR.time - kL.time);
                if (t < 0) t = 0; else if (t > 1) t = 1;

                Quaternion.HELP_0.set(
                    this.m_curves[0].getKey(lhsIndex).value,
                    this.m_curves[1].getKey(lhsIndex).value,
                    this.m_curves[2].getKey(lhsIndex).value,
                    this.m_curves[3].getKey(lhsIndex).value
                );

                Quaternion.HELP_1.set(
                    this.m_curves[0].getKey(rhsIndex).value,
                    this.m_curves[1].getKey(rhsIndex).value,
                    this.m_curves[2].getKey(rhsIndex).value,
                    this.m_curves[3].getKey(rhsIndex).value
                );

                Quaternion.HELP_2.slerp(Quaternion.HELP_0, Quaternion.HELP_1, t);
                this._cacheValue.x = Quaternion.HELP_2.x;
                this._cacheValue.y = Quaternion.HELP_2.y;
                this._cacheValue.z = Quaternion.HELP_2.z;
                this._cacheValue.w = Quaternion.HELP_2.w;
                break;
            default:
                break;
        }
        return this._cacheValue;
    }

    /**
     * get has Keyframe list count
     * @returns  int 
     */
    public getKeyCount(): number {
        return this.m_curves[0].getKeyCount();
    }

    /**
     * Get a Keyframe Data by Index
     * @param index must int 
     * @returns Keyframe {@link Keyframe}
     */
    public getKey(index: number): Keyframe[] {
        let list = [];
        for (let i = 0; i < this.k; i++) {
            list.push(this.m_curves[i].getKey(index));
        }
        return list;
    }

    /**
     * Read this multi-channel curve from a binary byte stream.
     * @param bytes source byte array
     */
    public formBytes(bytes: BytesArray) {
        this.path = bytes.readUTF();
        this.k = bytes.readInt32();
        this.check();

        this.attribute = bytes.readUTF();

        this.propertys = this.attribute.split(".");
        this.preInfinity = bytes.readInt32();
        this.postInfinity = bytes.readInt32();
        this.rotationOrder = bytes.readInt32();
        let curvesCount = bytes.readInt32();
        for (let i = 0; i < curvesCount; i++) {
            let keyframe = new KeyframeT(0);
            keyframe.formBytes(bytes);
            this.addKeyFrame(keyframe);
        }
    }
}
