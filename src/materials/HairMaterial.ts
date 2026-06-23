import { Context3D } from "../gfx/graphics/webGpu/Context3D";
import { LitHairShader } from "../loader/parser/prefab/mats/shader/LitHairShader";
import { Material } from "./Material";

/**
 * Hair material — wraps the existing {@link LitHairShader} (Marschner-
 * inspired hair BSDF with two specular lobes + transmission) into a
 * Material subclass for ergonomic use.
 *
 * The shader pipeline is fully implemented (Hair_shader_op /
 * Hair_shader_tr in `assets/shader/materials/Hair_shader.ts`); this
 * class is just the missing public API entry.
 *
 * For dual-pass alpha (transparent flyaways on top of opaque core),
 * pair with `LitHairShader.create_trPass()` — see comment in that file.
 *
 * @group Material
 */
export class HairMaterial extends Material {
    constructor(_ctx?: Context3D) {
        super();
        this.shader = new LitHairShader();
    }
}
