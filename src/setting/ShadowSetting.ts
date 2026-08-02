
/**
 * Shadow setting
 * @group Setting
 */
export type ShadowSetting = {
    debug: any,
    /**
     * enable
     */
    enable: boolean;
    /**
     *
     */
    needUpdate: boolean;
    /**
     * update shadown automatic
     */
    autoUpdate: boolean;

    /**
     * frequency for shadows update
     */
    updateFrameRate: number;

    /**
     * Shadow sampling mode.
     *
     * - `'HARD'`: single-tap hardware compare, sharp 1-texel edges.
     *   Cheapest. Default.
     * - `'PCF'`: 3×3 tent-weighted PCF (~5×5 effective via the
     *   hardware comparison sampler's 2×2 filtering). Mild softness,
     *   uniform across the shadow map regardless of receiver depth.
     * - `'SOFT'`: **Percentage-Closer Soft Shadows (PCSS)** — the
     *   16-tap blocker search + similar-triangles penumbra estimate +
     *   16-tap Poisson PCF. Produces "contact hardening": sharp
     *   directly under occluders, progressively softer as receiver-to-
     *   blocker distance grows. The most expensive of the three but
     *   the only one that captures distance-dependent softness.
     *   Per-light `softness` (light.size in shadow-map texels) overrides
     *   the global `shadowSoft` knob.
     */
    type: `PCF` | `HARD` | `SOFT`;
    // /**
    //  * Shadow quality
    //  */
    // shadowQuality: number;
    /**
     * shadow mapping Size
     */
    shadowSize: number;
    /**
     * Shadow softness
     */
    shadowSoft: number;
    /**
     * Directional PCF kernel radius multiplier. 1.0 = exactly one shadow
     * texel per sample step (3x3 tap spacing). Values > 1 widen the
     * kernel for softer edges at the cost of possible peter-panning;
     * values < 1 tighten it and give sharper but more aliased edges.
     * Live-tunable — the value is rewritten to globalUniform every frame.
     * Default 1.0.
     */
    pcfKernelScale?: number;
    /**
     * Point shadow mapping size
     */
    pointShadowSize: number;
    /**
     * Blend Shadow(0-1)
     */
    csmMargin: number;
    /**
     * scattering csm Area Exponent for each level
     */
    csmScatteringExp: number;
    /**
     * scale csm Area of all level
     */
    csmAreaScale: number;
    // /**
    //  * Shadow near section
    //  */
    // shadowNear: number;
    // /**
    //  * Shadow Far Section
    //  */
    // shadowFar: number;

    /**
     * max shadow map number
     */
    maxShadowMapNum: number;

    /**
     * max shadow map width
     */
    maxShadowMapWidth: number;

    /**
     * max shadow map height
     */
    maxShadowMapHeight: number;

    /**
     * max cascades for csm
     */
    maxCascades: number;

    /**
     * shadow bound, the area of shadow map projection,
     * the larger the value, the more area the shadow map covers,
     * but the lower the quality.
     * The smaller the value, the higher the quality,
     * but the smaller the area covered by the shadow map.
     * It is recommended to set this value according to the
     * scene size and light distance.
     */
    shadowBound: number;

    /**
     * Opt-in static-shadow caching.
     *
     * When `true`, the shadow-cast pass splits into two phases per frame:
     *   1. If the per-light static layer is dirty (light moved, or the scene
     *      explicitly marked dirty), rebuild it by drawing only renderers
     *      with `shadowCacheMode === 'static'`. Result stored in a cached
     *      depth texture.
     *   2. Every frame: copy the cached static depth into the live shadow
     *      map and draw renderers with `shadowCacheMode === 'dynamic'` on
     *      top (load-op preserves the copied depth, allowing correct
     *      occlusion resolution between static and dynamic geometry).
     *
     * When `false` (default), all renderers are treated as dynamic and the
     * pipeline behaves exactly like before — no cached layer, no extra
     * copies. Safe default for backwards compatibility.
     *
     * Only `'auto'` / `'static'` / `'dynamic'` tags on `RenderNode.shadowCacheMode`
     * are consulted when this flag is on; `'auto'` counts as dynamic.
     */
    enableStaticCache?: boolean;

    /** Contact Shadows — short screen-space ray-march along the dominant
     *  directional light. Adds the close-contact darkness CSM can't
     *  resolve (object-on-floor, fingers-on-table). Enable by adding
     *  ContactShadowPost to the post chain; this sub-tree controls
     *  the shader parameters. */
    contactShadow?: {
        enable: boolean;
        /** Number of ray-march steps. 12-24 is the visual sweet-spot. */
        maxStepCount: number;
        /** World-space ray length. Smaller = tighter contact-only shadow. */
        maxDistance: number;
        /** Depth-difference window that counts as "occluded". Bigger
         *  catches more contact but smears under thin geometry. */
        thickness: number;
        /** Bias along the surface normal to avoid self-shadow acne. */
        bias: number;
        /** [0,1] strength. */
        intensity: number;
    };
};