import { Engine3D } from "../Engine3D";
import { Texture } from "../gfx/graphics/webGpu/core/texture/Texture";
import { EarthSkyShader } from "../loader/parser/prefab/mats/shader/EarthSkyShader";
import { Vector3 } from "../math/Vector3";
import { Material } from "./Material";

/**
 * EarthSky Material
 * Material for rendering a backface sphere sampling cube texture
 * @group Material
 */
export class EarthSkyMaterial extends Material {

    private _earthSkyShader: EarthSkyShader;

    /** Creates the material and binds a default cube texture to avoid dimension mismatch. */
    constructor() {
        super();
        this.shader = this._earthSkyShader = new EarthSkyShader();
        // Set a default cube texture to avoid dimension mismatch error
        // when the render pipeline is created before a cube texture is assigned.
        // Use the active engine's resource registry — `Engine3D.res` (the
        // single-instance shortcut) was removed when the engine became
        // multi-instance; resFor() resolves the right Res for the current
        // Context3D.
        this.setTexture(`baseMap`, Engine3D.resFor().defaultSky);
    }

    /**
     * Set base map (cube texture)
     */
    public set baseMap(texture: Texture) {
        this.setTexture(`baseMap`, texture);
        const key = 'IS_HDR_SKY';
        let defaultShader = this._shader.getDefaultShaders()[0];
        if (defaultShader.defineValue[key] != texture?.isHDRTexture) {
            this._shader.setDefine(key, texture?.isHDRTexture ? true : false);
        }
    }

    /**
     * Get base map (cube texture)
     */
    public get baseMap(): Texture {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.getTexture(`baseMap`);
    }

    /** No-op; this material does not use an environment texture. */
    public set envMap(texture: Texture) {
        // not need env texture
    }

    /** No-op; this material does not use a shadow map. */
    public set shadowMap(texture: Texture) {
        // not need shadowMap texture
    }

    /**
     * Get exposure value
     */
    public get exposure(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`exposure`].value;
    }

    /**
     * Set exposure value
     */
    public set exposure(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`exposure`].value = value;
    }

    /**
     * Get roughness value
     */
    public get roughness(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`roughness`].value;
    }

    /**
     * Set roughness value
     */
    public set roughness(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`roughness`].value = value;
    }

    /**
     * Get yaw rotation angle (in radians)
     * Controls horizontal rotation of the sky, independent of camera rotation
     */
    public get yaw(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`yaw`].value;
    }

    /**
     * Set yaw rotation angle (in radians)
     * Controls horizontal rotation of the sky, independent of camera rotation
     */
    public set yaw(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`yaw`].value = value;
    }

    /**
     * Get pitch rotation angle (in radians)
     * Controls vertical rotation of the sky, independent of camera rotation
     */
    public get pitch(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`pitch`].value;
    }

    /**
     * Set pitch rotation angle (in radians)
     * Controls vertical rotation of the sky, independent of camera rotation
     */
    public set pitch(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`pitch`].value = value;
    }
}
