/**
 * Settings for VolumetricFogPost (screen-space MVP). See the post
 * class for an explanation of trade-offs vs a froxel grid.
 */
export type VolumetricFogSetting = {
    /** Whether the post pass runs. Toggled by `addPost` / detach. */
    enable: boolean;
    /** Beer-Lambert extinction coefficient per unit distance.
     *  0.0 disables fog absorption. 0.05 is a good baseline. */
    density: number;
    /** Multiplier on accumulated scattering. Punchier values
     *  amplify "god rays" near the sun. 1.0 default. */
    scatteringIntensity: number;
    /** Henyey-Greenstein phase asymmetry [-0.99, 0.99]. Positive =
     *  forward scatter (light shafts visible looking toward sun);
     *  negative = backward; 0 = isotropic. 0.6 is canonical. */
    anisotropy: number;
    /** Cap the ray-march distance in world units. Past this,
     *  transmittance saturates. 100 default. */
    maxDistance: number;
    /** Number of march steps per pixel. 16 (cheap, banded) → 64
     *  (smooth, expensive). 32 default. */
    stepCount: number;
    /** Ambient scattering tint added at every step (independent of
     *  the directional light). Useful for low-key blue night fogs. */
    ambient: { r: number; g: number; b: number };
};
