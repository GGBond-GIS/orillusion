import type { AnimatorComponent, PropertyAnimationClipState } from "../AnimatorComponent";

export interface MotionPoint {
    /** Clip name to play at this threshold. */
    clipName: string;
    /** Parameter value at which this motion fully dominates the mix. */
    threshold: number;
}

/**
 * BlendTree1D — linear blend across N motion thresholds based on one parameter.
 *
 * Drives the AnimatorComponent's per-clip weights so that, e.g., as `speed`
 * goes from 0 to 1, the active mix shifts from idle → walk → run smoothly.
 * No new render path is needed; we reuse the existing weighted-clip mix in
 * AnimatorComponent.updateSkeletonAnimMix.
 *
 * @group Animation
 */
export class BlendTree1D {
    private _points: MotionPoint[];
    private _value: number = 0;

    constructor(points: MotionPoint[]) {
        // Sort ascending by threshold so the segment lookup is monotonic.
        this._points = [...points].sort((a, b) => a.threshold - b.threshold);
        if (this._points.length < 2) {
            throw new Error('BlendTree1D requires at least 2 motion points');
        }
    }

    /** Set the parameter value. Out-of-range values clamp to the endpoints. */
    public setValue(v: number): void { this._value = v; }
    public getValue(): number { return this._value; }

    /**
     * Apply the blend: zero out every clip's weight, then write the two-point
     * lerp weights for the segment containing `value`.
     */
    public apply(animator: AnimatorComponent): void {
        const v = this._value;

        // Zero all participating clips first so old segments fade away cleanly.
        for (const p of this._points) {
            const cs = animator.getAnimationClipState(p.clipName);
            if (cs) cs.weight = 0;
        }

        const pts = this._points;
        if (v <= pts[0].threshold) {
            const cs = animator.getAnimationClipState(pts[0].clipName);
            if (cs) cs.weight = 1;
            return;
        }
        if (v >= pts[pts.length - 1].threshold) {
            const cs = animator.getAnimationClipState(pts[pts.length - 1].clipName);
            if (cs) cs.weight = 1;
            return;
        }

        for (let i = 1; i < pts.length; i++) {
            const left = pts[i - 1];
            const right = pts[i];
            if (v < left.threshold || v > right.threshold) continue;

            const span = right.threshold - left.threshold;
            const t = span > 1e-6 ? (v - left.threshold) / span : 0;
            const lws: PropertyAnimationClipState | null = animator.getAnimationClipState(left.clipName);
            const rws: PropertyAnimationClipState | null = animator.getAnimationClipState(right.clipName);
            if (lws) lws.weight = 1 - t;
            if (rws) rws.weight = t;
            return;
        }
    }
}
