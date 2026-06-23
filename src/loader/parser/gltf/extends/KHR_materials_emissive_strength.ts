//https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_emissive_strength

import { Engine3D } from "../../../../Engine3D";
import { Context3D } from "../../../../gfx/graphics/webGpu/Context3D";

/**
 * glTF KHR_materials_emissive_strength extension parser. Reads the
 * per-material `emissiveStrength` factor and writes it to the target
 * material's `emissiveIntensity`, promoting the emissive map from the
 * black to the white fallback texture so the strength is visible.
 *
 * @internal
 * @group Loader
 */
export class KHR_materials_emissive_strength {
    public static apply(gltf: any, dmaterial: any, tMaterial: any, ctx?: Context3D) {
        let extensions = dmaterial.extensions;
        if (extensions && extensions[`KHR_materials_emissive_strength`]) {
            tMaterial.emissiveIntensity = extensions[`KHR_materials_emissive_strength`].emissiveStrength;
            if (tMaterial.emissiveMap == Engine3D.resFor(ctx).blackTexture) {
                tMaterial.emissiveMap = Engine3D.resFor(ctx).whiteTexture;
            }
        } else {
            tMaterial.emissiveIntensity = 1;
        }
    }
}
