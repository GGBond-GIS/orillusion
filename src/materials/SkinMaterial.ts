import { Context3D } from "../gfx/graphics/webGpu/Context3D";
import { Texture } from "../gfx/graphics/webGpu/core/texture/Texture";
import { LitMaterial } from "./LitMaterial";

/**
 * Subsurface scattering skin material — Burley pre-integrated SSS.
 *
 * Produces the soft red-into-shadow reflectance characteristic of skin
 * (and wax / leaves / marble) by sampling a 2D LUT keyed on `(N·L,
 * curvature)`. Curvature is approximated from the normal map's
 * derivative magnitude or supplied via a thickness map.
 *
 * **MVP status — skeleton**: this class extends LitMaterial and
 * exposes the SSS uniforms (subsurfaceColor, subsurfaceRadius,
 * thicknessMap). The shader path that consumes them — namely a
 * `USE_SUBSURFACE` block in `BxDF_frag` that mixes in
 * `texture(sssLUT, vec2(NoL*0.5+0.5, curvature))` — is the next-step
 * deliverable. The LUT pre-integration (Burley 2015 normalized
 * dipole) lives offline in tools/sssLUTGen.
 *
 * Until the shader path lands, the material renders identically to
 * a regular LitMaterial — but the API is stable so client code can
 * be authored against it now.
 *
 * Usage:
 * ```ts
 * const m = new SkinMaterial(engine.context3D);
 * m.subsurfaceColor = new Color(0.95, 0.5, 0.4);
 * m.subsurfaceRadius = 1.5;             // mm; wider radius = softer
 * m.thicknessMap = headThicknessMap;    // 0 = thin (ears), 1 = thick
 * ```
 *
 * @group Material
 */
export class SkinMaterial extends LitMaterial {
    /** Creates the material, enables the subsurface path, and applies default skin uniforms. */
    constructor(ctx?: Context3D) {
        super(ctx);
        this.shader.setDefine('USE_SUBSURFACE', true);
        // Defaults for caucasian skin — adjust per character.
        this.shader.setUniformFloat('subsurfaceRadius', 1.0);
        this.shader.setUniformColor('subsurfaceColor', { r: 1.0, g: 0.4, b: 0.3, a: 1 } as any);
    }

    /** Sets the subsurface scattering radius uniform. */
    public set subsurfaceRadius(value: number) {
        this.shader.setUniformFloat('subsurfaceRadius', value);
    }
    /** Gets the subsurface scattering radius uniform. */
    public get subsurfaceRadius(): number {
        return this.shader.getUniformFloat('subsurfaceRadius');
    }

    /** Sets the thickness map texture and enables the thickness-map shader path. */
    public set thicknessMap(texture: Texture) {
        this.shader.setTexture('thicknessMap', texture);
        this.shader.setDefine('USE_THICKNESS_MAP', true);
    }
    /** Gets the thickness map texture. */
    public get thicknessMap(): Texture {
        return this.shader.getTexture('thicknessMap');
    }
}
