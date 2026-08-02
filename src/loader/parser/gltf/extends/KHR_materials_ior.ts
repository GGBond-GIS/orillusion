// https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_ior

import { LitMaterial } from '../../../../materials/LitMaterial';

/**
 * glTF KHR_materials_ior extension parser. Reads the per-material
 * `ior` factor (default 1.5) and writes it to `LitMaterial.ior`, which
 * the fragment shader uses for Fresnel term + refraction (when combined
 * with KHR_materials_transmission).
 *
 * @internal
 * @group Loader
 */
export class KHR_materials_ior {
    public static apply(_gltf: any, dmaterial: any, tMaterial: any) {
        const extensions = dmaterial.extensions;
        if (!extensions || !extensions[`KHR_materials_ior`]) return;
        const ext = extensions[`KHR_materials_ior`];
        const ior = typeof ext[`ior`] === 'number' ? ext[`ior`] : 1.5;
        dmaterial.ior = ior;
        if (tMaterial instanceof LitMaterial) {
            tMaterial.ior = ior;
        }
    }
}
