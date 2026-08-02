import { Texture, Vector4 } from "../../..";

/**
 * Intermediate material description produced while parsing a glTF asset.
 * It holds the metallic-roughness PBR factors, the resolved texture
 * references and the per-channel UV offset/size transforms read from a
 * glTF material, before they are converted into an engine `LitMaterial`.
 *
 * @group Loader
 */
export class GLTFMaterial {
    /** Material name as declared in the glTF file. */
    name: string
    /** Shader define flags collected for this material (e.g. blend mode hints). */
    defines: string[];
    /** Whether the material is rendered double-sided. */
    doubleSided: boolean;
    /** Base color (albedo) factor as an RGBA tuple. */
    baseColorFactor: [1, 1, 1, 1];
    /** Emissive color factor. */
    emissiveFactor: number;
    /** Metallic scalar factor in the [0, 1] range. */
    metallicFactor: number;
    /** Roughness scalar factor in the [0, 1] range. */
    roughnessFactor: number;
    /** Alpha cutoff threshold used in alpha-mask mode. */
    alphaCutoff: number;
    /** Whether alpha blending is enabled for this material. */
    enableBlend: boolean;
    /** Base color (albedo) texture. */
    baseColorTexture: Texture;
    /** Combined metallic-roughness texture. */
    metallicRoughnessTexture: Texture;
    /** Tangent-space normal map. */
    normalTexture: Texture;
    /** Ambient occlusion texture. */
    occlusionTexture: Texture;
    /** Emissive texture. */
    emissiveTexture: Texture;
    /** Raw glTF material extensions dictionary. */
    extensions: any;
    /** UV offset/size transform for the base color texture. */
    baseMapOffsetSize: Vector4;
    /** UV offset/size transform for the normal texture. */
    normalMapOffsetSize: Vector4;
    /** UV offset/size transform for the emissive texture. */
    emissiveMapOffsetSize: Vector4;
    /** UV offset/size transform for the roughness texture. */
    roughnessMapOffsetSize: Vector4;
    /** UV offset/size transform for the metallic texture. */
    metallicMapOffsetSize: Vector4;
    /** UV offset/size transform for the ambient occlusion texture. */
    aoMapOffsetSize: Vector4;
}