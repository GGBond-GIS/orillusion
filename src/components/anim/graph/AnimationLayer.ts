import { BoneMask } from "../BoneMask";

export enum LayerBlendMode {
    /**
     * Replace the underlying pose with this layer's pose, blended by weight.
     * Out = lerp(base, layer, weight)
     */
    Override = 0,
    /**
     * Add this layer's delta-from-rest on top of the base pose.
     * Out = base + (layer - rest) * weight
     * Useful for facial expressions, breathing, aim offsets.
     */
    Additive = 1,
}

/**
 * AnimationLayer — one layer in a stacked animation pipeline.
 *
 * Layer 0 is the implicit "base" (driven by playAnim/crossFade). Layers 1..N
 * stack on top and may be filtered by a BoneMask so that, for example, an
 * upper-body wave animation can override the base walk on just the upper-body
 * bones while leaving the legs alone.
 *
 * Each layer has its own clip + time so layers can run independent animations
 * at independent speeds. The layer's weight controls how much of its pose is
 * blended in (Override) or added (Additive — base + (layer - rest) * weight).
 *
 * The math is performed by `AnimatorComponent.updateLayers()`, which iterates
 * layers in order and mixes per-bone TRS.
 *
 * @group Animation
 */
export class AnimationLayer {
    public name: string;
    public weight: number;
    public blendMode: LayerBlendMode;
    public mask: BoneMask | null;

    /** Active clip name on this layer. Empty → layer is paused. */
    public clipName: string = '';
    /** Layer-local playback time, in seconds. */
    public time: number = 0;
    /** Layer-local time scale (multiplied into the global timeScale). */
    public timeScale: number = 1.0;
    /** When false, time does not advance. */
    public playing: boolean = true;

    // ----- Internal cache populated by AnimatorComponent.updateLayers() -----
    // ----- on the first frame the layer is processed. Mutable so the     -----
    // ----- AnimatorComponent can update them when clipName changes.      -----

    /** First-keyframe time of the resolved clip (for makeClipAdditive math). */
    public _firstKeyTime: number = 0;
    /** Last-keyframe time of the resolved clip. */
    public _lastKeyTime: number = 0;
    /** Whether the resolved clip is a static pose (short span / 2 keyframes). */
    public _isStaticPose: boolean = false;
    /** Set to true once the layer has been resolved against its clip. */
    public _resolved: boolean = false;

    constructor(
        name: string,
        weight: number = 1.0,
        blendMode: LayerBlendMode = LayerBlendMode.Override,
        mask: BoneMask | null = null,
    ) {
        this.name = name;
        this.weight = weight;
        this.blendMode = blendMode;
        this.mask = mask;
    }
}
