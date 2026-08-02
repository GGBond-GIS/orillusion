import { PingPong, RepeatSE } from './MathUtil';
import { FrameCache } from './enum/FrameCache';
import { WrapTimeMode } from './enum/WrapTimeMode';
import { Keyframe } from './enum/Keyframe';

/**
 * Animation Curve 
 * has frame list data 
 * @group Math
 */
export class AnimationCurve {
    private _totalTime: number = 1;

    private _cache: FrameCache = new FrameCache();

    private _cacheOut: { lhsIndex: number; rhsIndex: number } = {
        lhsIndex: 0,
        rhsIndex: 0,
    };

    private _InvalidateCache: boolean = false;

    /** Ordered list of keyframes defining this curve. */
    public curve: Keyframe[] = [];

    /** Serialized format version of this curve. */
    public serializedVersion: number;

    /** Wrap mode applied for times before the first keyframe. */
    public preWarpMode: number;

    /** Wrap mode applied for times after the last keyframe. */
    public postWarpMode: number;

    /** Euler rotation order associated with this curve. */
    public rotationOrder: number;

    /**
     * Last computed left/right keyframe indices from the most recent lookup.
     */
    public get cacheOut(): { lhsIndex: number; rhsIndex: number } {
        return this._cacheOut;
    }

    constructor(frames?: Keyframe[], preWarpMode: WrapTimeMode = WrapTimeMode.Repeat, postWarpMode: WrapTimeMode = WrapTimeMode.Repeat) {
        if (frames) for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            this.addKeyFrame(frame);
        }
        this.preWarpMode = preWarpMode;
        this.postWarpMode = postWarpMode;
    }

    /**
     * return this curve use total time
     */
    public get totalTime() {
        return this._totalTime;
    }

    /**
     * get curve first keframe time
     */
    public get first(): Keyframe {
        return this.curve[0];
    }

    /**
     * get curve last keyframe time
     */
    public get last(): Keyframe {
        return this.curve[this.curve.length - 1];
    }

    /**
     * add keyFrame to curve keyframe last and calcTotalTime
     * @param keyFrame {@link Keyframe}  sea: one key frame data
     */
    public addKeyFrame(keyFrame: Keyframe) {
        if (this.curve.indexOf(keyFrame) == -1) {
            this.curve.push(keyFrame);
        }
        this.calcTotalTime();
    }

    /**
     * remove keyframe from this curve
     * @param keyFrame {@link Keyframe} 
     */
    public removeKeyFrame(keyFrame: Keyframe) {
        let index = this.curve.indexOf(keyFrame);
        if (index != -1) {
            this.curve.splice(index, 1);
        }

        this.calcTotalTime();
    }

    /**
     * calculate keyframe list in to timeline
     * @param cache {@link FrameCache} 
     * @param lhsIndex left frame index 
     * @param rhsIndex right frame index
     * @param timeOffset offset time default 0.0
     */
    public calculateCacheData(cache: FrameCache, lhsIndex: number, rhsIndex: number, timeOffset: number = 0) {
        let m_Curve = this.curve;
        let lhs = m_Curve[lhsIndex];
        let rhs = m_Curve[rhsIndex];
        //	DebugAssertIf (timeOffset < -0.001F || timeOffset - 0.001F > rhs.time - lhs.time);
        cache.index = lhsIndex;
        cache.time = lhs.time + timeOffset;
        cache.timeEnd = rhs.time + timeOffset;
        cache.index = lhsIndex;

        let dx, length;
        let dy;
        let m1, m2, d1, d2;

        dx = rhs.time - lhs.time;
        dx = Math.max(dx, 0.0001);
        dy = rhs.value - lhs.value;
        length = 1.0 / (dx * dx);

        m1 = lhs.outSlope;
        m2 = rhs.inSlope;
        d1 = m1 * dx;
        d2 = m2 * dx;

        cache.coeff[0] = ((d1 + d2 - dy - dy) * length) / dx;
        cache.coeff[1] = (dy + dy + dy - d1 - d1 - d2) * length;
        cache.coeff[2] = m1;
        cache.coeff[3] = lhs.value;
        this.setupStepped(cache.coeff, lhs, rhs);
    }

    /**
     * get caculate frames value 
     * @param time 
     * @returns 
     */
    public getValue(time: number): number {
        time = this.wrapTime(time);

        this.findCurve(time, this._cacheOut);

        this.calculateCacheData(this._cache, this._cacheOut.lhsIndex, this._cacheOut.rhsIndex, 0);

        return this.evaluateCache(this._cache, time);
    }

    /**
     * get caculate frames extent
     * @param time 
     * @returns 
     */
    public getCurveFramesExtent(time: number): { lhsIndex: number; rhsIndex: number; time: number } {
        time = this.wrapTime(time);

        this.findCurve(time, this._cacheOut);

        return { lhsIndex: this._cacheOut.lhsIndex, rhsIndex: this._cacheOut.rhsIndex, time: time };
    }

    /**
     * get has Keyframe list count
     * @returns  int 
     */
    public getKeyCount(): number {
        return this.curve.length;
    }

    /**
     * Get a Keyframe Data by Index
     * @param index must int 
     * @returns Keyframe {@link Keyframe}
     */
    public getKey(index: number): Keyframe {
        return this.curve[index];
    }

    /**
     * Deserialize this curve from raw asset data (Unity-style field names).
     * @param data source object containing wrap modes and keyframes
     * @returns this curve
     */
    public unSerialized(data: any): this {
        this.preWarpMode = data['m_PreInfinity'];
        this.postWarpMode = data['m_PostInfinity'];
        this.rotationOrder = data['m_RotationOrder'];

        let len = data['m_Curve'].length;
        for (let i = 0; i < len; i++) {
            this.curve[i] = new Keyframe();
            this.curve[i].unSerialized(data['m_Curve'][i.toString()]);
        }
        this.calcTotalTime();
        return this;
    }

    /**
     * Deserialize this curve from an alternate data layout (preWrapMode/keys fields).
     * @param data source object containing wrap modes and keyframes
     * @returns this curve
     */
    public unSerialized2(data: Object): this {
        this.preWarpMode = data['preWrapMode'];
        this.postWarpMode = data['postWrapMode'];

        let keyFrames = data['keyFrames'] || data['keys'];
        let len = keyFrames.length;
        for (let i = 0; i < len; i++) {
            this.curve[i] = new Keyframe();
            this.curve[i].unSerialized2(keyFrames[i.toString()]);
        }
        this.calcTotalTime();
        return this;
    }

    /**
     * Wrap a time value into the curve range according to the pre/post wrap modes.
     * @param curveT input time
     * @returns wrapped time within the curve bounds
     */
    public wrapTime(curveT: number) {
        let m_Curve = this.curve;
        let begTime = m_Curve[0].time;
        let endTime = m_Curve[m_Curve.length - 1].time;

        if (curveT < begTime) {
            if (this.preWarpMode == WrapTimeMode.Clamp) curveT = begTime;
            else if (this.preWarpMode == WrapTimeMode.PingPong) curveT = PingPong(curveT, begTime, endTime);
            else curveT = RepeatSE(curveT, begTime, endTime);
        } else if (curveT > endTime) {
            if (this.postWarpMode == WrapTimeMode.Clamp) curveT = endTime;
            else if (this.postWarpMode == WrapTimeMode.PingPong) curveT = PingPong(curveT, begTime, endTime);
            else curveT = RepeatSE(curveT, begTime, endTime);
        }
        return curveT;
    }

    private evaluateCache(cache: FrameCache, curveT: number): number {
        let t = curveT - cache.time;
        let output = t * (t * (t * cache.coeff[0] + cache.coeff[1]) + cache.coeff[2]) + cache.coeff[3];
        return output;
    }

    private findCurve(time: number, out: { lhsIndex: number; rhsIndex: number }) {
        let frames = this.curve;
        const n = frames.length;
        // Empty / single keyframe: collapse both sides to index 0.
        if (n <= 1) {
            out.lhsIndex = 0;
            out.rhsIndex = 0;
            return;
        }
        // Time at or before the first keyframe: clamp to [0, 1).
        if (time <= frames[0].time) {
            out.lhsIndex = 0;
            out.rhsIndex = 1;
            return;
        }
        // Time at or after the last keyframe: clamp to [n-2, n-1].
        // Without this branch, when `time === frames[last].time` the loop
        // below (which uses `right.time > time` strict-greater) leaves
        // `out` unmodified — falling back to the previous call's cached
        // indices, or the initial {0, 0} (i.e. lhs === rhs → divide-by-zero
        // when the caller does `(time - kL.time) / (kR.time - kL.time)`,
        // producing NaN quaternions). This struck `AnimationLayer` static
        // poses where `layer.time` is pinned to `lastKeyTime`.
        const last = n - 1;
        if (time >= frames[last].time) {
            out.lhsIndex = last - 1;
            out.rhsIndex = last;
            return;
        }
        // Interior search.
        for (let i = 1; i < n; i++) {
            let left = frames[i - 1];
            let right = frames[i];
            if (left.time <= time && right.time > time) {
                out.lhsIndex = i - 1;
                out.rhsIndex = i;
                return;
            }
        }
    }

    private setupStepped(coeff: number[], lhs: Keyframe, rhs: Keyframe) {
        if (isNaN(lhs.outSlope) || isNaN(rhs.inSlope)) {
            coeff[0] = 0.0;
            coeff[1] = 0.0;
            coeff[2] = 0.0;
            coeff[3] = lhs.value;
        }
    }

    private invalidateCache() {
        this._InvalidateCache = true;
    }

    private calcTotalTime() {
        let maxTime = 0;
        for (let curve of this.curve) {
            if (curve) {
                maxTime = Math.max(maxTime, curve.time);
            } else {
                console.error(curve);
            }
        }
        this._totalTime = maxTime;
    }

    /**
     * Scale the value and tangents of every keyframe in the curve, then invalidate its cache.
     * @param curve curve to scale
     * @param scale multiplier applied to each keyframe value and slope
     */
    public static scaleCurveValue(curve: AnimationCurve, scale: number) {
        if (!curve._InvalidateCache) {
            for (let i = 0; i < curve.curve.length; i++) {
                let c = curve.curve[i];
                c.value *= scale;
                c.inSlope *= scale;
                c.outSlope *= scale;
            }
        }
        curve.invalidateCache();
    }
}
