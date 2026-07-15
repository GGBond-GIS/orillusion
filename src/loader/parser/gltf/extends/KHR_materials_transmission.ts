// https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_transmission

import { LitMaterial } from '../../../../materials/LitMaterial';

/**
 * glTF KHR_materials_transmission extension parser. Reads:
 * - `transmissionFactor` (default 0)
 * - `transmissionTexture` (optional; R channel scales transmissionFactor)
 *
 * Transmission routes light through the surface (glass, water, clear
 * plastic) — the fragment shader samples the pre-refraction scene color
 * pyramid produced by {@link SceneColorPyramidFeature} and folds the
 * transmitted radiance into the opaque output with
 * `alpha = 1 - transmissionFactor * transmissionTexture.r`.
 *
 * @internal
 * @group Loader
 */
export class KHR_materials_transmission {
    public static apply(_gltf: any, dmaterial: any, tMaterial: any) {
        const extensions = dmaterial.extensions;
        if (!extensions || !extensions[`KHR_materials_transmission`]) return;
        const ext = extensions[`KHR_materials_transmission`];
        const factor = typeof ext[`transmissionFactor`] === 'number' ? ext[`transmissionFactor`] : 0;
        dmaterial.transmissionFactor = factor;

        if (tMaterial instanceof LitMaterial) {
            (tMaterial as any).transmissionFactor = factor;
            // The async parser (GLTFSubParserMaterial.parse) already
            // resolved transmissionTexture into a real Texture and
            // stashed it on dmaterial. Bind it here — the setter flips
            // USE_TRANSMISSIONMAP and USE_TRANSMISSION defines.
            if (dmaterial.transmissionTextureResolved) {
                (tMaterial as LitMaterial).transmissionMap = dmaterial.transmissionTextureResolved;
            }
        }
    }
}
