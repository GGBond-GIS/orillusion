/**
 * Tonemap Setting — final HDR→LDR curve applied after every other
 * post-effect, just before the swapchain receives the frame. Defaults
 * to ACES Filmic, paired with an sRGB output color space — the standard
 * HDR-to-display pairing.
 *
 * @group Setting
 */
export type TonemapSetting = {
    /** Master switch. When false, the post is still attached but
     *  acts as a straight passthrough — useful for A/B comparisons. */
    enable: boolean;
    /** Linear scale multiplied onto the HDR color before the curve.
     *  1.0 is the neutral default (no exposure compensation). */
    exposure: number;
    /** Curve selector. 'ACES' applies the Filmic Narkowicz fit;
     *  'None' is straight passthrough (same effect as enable=false
     *  but keeps exposure scaling). */
    mode: 'ACES' | 'None';
};
