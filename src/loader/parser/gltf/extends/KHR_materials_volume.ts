// https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_volume

import { Color } from '../../../../math/Color';
import { LitMaterial } from '../../../../materials/LitMaterial';

/**
 * glTF KHR_materials_volume extension parser. Reads:
 * - `thicknessFactor` (default 0, in world units)
 * - `thicknessTexture` (optional; G channel scales thicknessFactor)
 * - `attenuationDistance` (default infinity; world units before radiance
 *    is attenuated to 1/e)
 * - `attenuationColor` (default [1,1,1]; RGB tint of absorbed light)
 *
 * Volume models the finite thickness of a transmissive material. Used
 * with KHR_materials_transmission for colored glass / thick water.
 *
 * @internal
 * @group Loader
 */
export class KHR_materials_volume {
    public static apply(_gltf: any, dmaterial: any, tMaterial: any) {
        const extensions = dmaterial.extensions;
        if (!extensions || !extensions[`KHR_materials_volume`]) return;
        const ext = extensions[`KHR_materials_volume`];

        const thickness = typeof ext[`thicknessFactor`] === 'number' ? ext[`thicknessFactor`] : 0;
        const attenDist = typeof ext[`attenuationDistance`] === 'number' ? ext[`attenuationDistance`] : Number.POSITIVE_INFINITY;
        const attenColorArr = Array.isArray(ext[`attenuationColor`]) ? ext[`attenuationColor`] : [1, 1, 1];
        const attenColor = new Color(attenColorArr[0] ?? 1, attenColorArr[1] ?? 1, attenColorArr[2] ?? 1, 1);

        dmaterial.thicknessFactor = thickness;
        dmaterial.attenuationDistance = attenDist;
        dmaterial.attenuationColor = attenColor;

        if (tMaterial instanceof LitMaterial) {
            (tMaterial as any).thicknessFactor = thickness;
            // Pass Infinity through — shaders guard with
            // `attenuationDistance > 1e18 ? no attenuation : ...`. Using
            // a sentinel (rather than clamping to a large finite value)
            // keeps the branch cheap and avoids subtle bias.
            (tMaterial as any).attenuationDistance = attenDist;
            (tMaterial as any).attenuationColor = attenColor;
        }

        if (ext[`thicknessTexture`]) {
            dmaterial.thicknessTexture = ext[`thicknessTexture`];
            // The async parser (GLTFSubParserMaterial.parse) already
            // resolved thicknessTexture into a real Texture and stashed
            // it on dmaterial — bind it here, mirroring
            // KHR_materials_transmission.apply's transmissionMap wiring.
            if (dmaterial.thicknessTextureResolved && tMaterial instanceof LitMaterial) {
                (tMaterial as LitMaterial).thicknessMap = dmaterial.thicknessTextureResolved;
            }
        }
    }
}
