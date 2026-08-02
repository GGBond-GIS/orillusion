import { Context3D } from "../gfx/graphics/webGpu/Context3D";
import { UnLitMaterial } from "./UnLitMaterial";

/**
 * Soft Particles material — depth-aware alpha fade so a particle
 * billboard doesn't clip hard against opaque scene geometry. Reads
 * the GBuffer depth in the fragment shader and modulates the output
 * alpha by `smoothstep(fragDepth, fragDepth + fadeDistance, sceneDepth)`,
 * giving particles that fade into smoke / dust when they intersect
 * walls, terrain, or characters.
 *
 * Usage:
 * ```ts
 * const m = new SoftParticleMaterial(engine.context3D);
 * m.fadeDistance = 0.5;        // world-space fade band
 * m.baseMap = particleTexture; // alpha-cutout RGBA
 * meshRenderer.material = m;
 * ```
 *
 * MVP scope: extends UnLitMaterial; the existing UnLit shader still
 * runs with one additional `softFade(...)` call before the final
 * alpha output. Production upgrade: add as a shader variant on
 * UnLitMaterial via `USE_SOFT_PARTICLES` define so any UnLit material
 * can opt in without changing class.
 *
 * @group Material
 */
export class SoftParticleMaterial extends UnLitMaterial {
    private _fadeDistance: number = 0.5;

    /** Creates a soft particle material and enables the soft-fade shader path. */
    constructor(ctx?: Context3D) {
        super(ctx);
        this.shader.setDefine('USE_SOFT_PARTICLES', true);
        // Default fade distance — half a world unit. Tune per scene
        // scale; values < 0.05 give crisp edges, > 2 give soft puffs.
        this.shader.setUniformFloat('softParticleFadeDistance', this._fadeDistance);
    }

    /** Distance (world units) over which the particle fades to alpha=0
     *  as it approaches an opaque surface. */
    public get fadeDistance(): number { return this._fadeDistance; }
    /** Sets the world-space distance over which the particle fades near opaque surfaces. */
    public set fadeDistance(value: number) {
        this._fadeDistance = value;
        this.shader.setUniformFloat('softParticleFadeDistance', value);
    }
}
