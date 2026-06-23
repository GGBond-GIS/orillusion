import { Engine3D } from "../Engine3D";
import { Texture } from "../gfx/graphics/webGpu/core/texture/Texture";
import { EarthAtmShader } from "../loader/parser/prefab/mats/shader/EarthAtmShader";
import { Vector3 } from "../math/Vector3";
import { Material } from "./Material";

/**
 * EarthAtm Material
 * Material for rendering atmospheric scattering for Earth atmosphere
 * Supports both view from space (looking at Earth) and view from ground (looking at sky)
 * @group Material
 */
export class EarthAtmMaterial extends Material {

    private _earthAtmShader: EarthAtmShader;

    /** Creates the material and binds a placeholder cube texture to satisfy bindings. */
    constructor() {
        super();
        this.shader = this._earthAtmShader = new EarthAtmShader();
        // Default cube texture to satisfy group 1 binding requirement.
        // The legacy `Engine3D.res` static was removed; resFor() resolves
        // the active engine's Res. The atmospheric shader doesn't actually
        // sample this — it's just a placeholder to fill the cube-texture slot.
        this.setTexture(`baseMap`, Engine3D.resFor().defaultSky);
    }

    /**
     * Get Earth radius in meters
     */
    public get earthRadius(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`earthRadius`].value;
    }

    /**
     * Set Earth radius in meters (default: 6371000)
     */
    public set earthRadius(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`earthRadius`].value = value;
    }

    /**
     * Get atmosphere outer radius in meters
     */
    public get atmosphereRadius(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`atmosphereRadius`].value;
    }

    /**
     * Set atmosphere outer radius in meters
     * Typically earthRadius + 100000 for 100km atmosphere
     */
    public set atmosphereRadius(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`atmosphereRadius`].value = value;
    }

    /**
     * Get sun direction (normalized vector pointing towards the sun)
     */
    public get sunDirection(): Vector3 {
        let defaultShader = this._shader.getDefaultColorShader();
        return new Vector3(
            defaultShader.uniforms[`sunDirectionX`].value,
            defaultShader.uniforms[`sunDirectionY`].value,
            defaultShader.uniforms[`sunDirectionZ`].value
        );
    }

    /**
     * Set sun direction (will be normalized)
     */
    public set sunDirection(value: Vector3) {
        let defaultShader = this._shader.getDefaultColorShader();
        const normalized = value.clone().normalize();
        defaultShader.uniforms[`sunDirectionX`].value = normalized.x;
        defaultShader.uniforms[`sunDirectionY`].value = normalized.y;
        defaultShader.uniforms[`sunDirectionZ`].value = normalized.z;
    }

    /**
     * Get sun intensity
     */
    public get sunIntensity(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`sunIntensity`].value;
    }

    /**
     * Set sun intensity (default: 22.0)
     */
    public set sunIntensity(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`sunIntensity`].value = value;
    }

    /**
     * Get Rayleigh scattering coefficients (wavelength dependent - RGB)
     */
    public get rayleighCoeff(): Vector3 {
        let defaultShader = this._shader.getDefaultColorShader();
        return new Vector3(
            defaultShader.uniforms[`rayleighCoeffX`].value,
            defaultShader.uniforms[`rayleighCoeffY`].value,
            defaultShader.uniforms[`rayleighCoeffZ`].value
        );
    }

    /**
     * Set Rayleigh scattering coefficients
     * Default: (5.5e-6, 13.0e-6, 22.4e-6) for Earth-like atmosphere
     */
    public set rayleighCoeff(value: Vector3) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`rayleighCoeffX`].value = value.x;
        defaultShader.uniforms[`rayleighCoeffY`].value = value.y;
        defaultShader.uniforms[`rayleighCoeffZ`].value = value.z;
    }

    /**
     * Get Mie scattering coefficient
     */
    public get mieCoeff(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`mieCoeff`].value;
    }

    /**
     * Set Mie scattering coefficient (default: 21e-6)
     */
    public set mieCoeff(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`mieCoeff`].value = value;
    }

    /**
     * Get Rayleigh scale height in meters
     */
    public get rayleighScale(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`rayleighScale`].value;
    }

    /**
     * Set Rayleigh scale height (default: 8000 meters)
     */
    public set rayleighScale(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`rayleighScale`].value = value;
    }

    /**
     * Get Mie scale height in meters
     */
    public get mieScale(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`mieScale`].value;
    }

    /**
     * Set Mie scale height (default: 1200 meters)
     */
    public set mieScale(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`mieScale`].value = value;
    }

    /**
     * Get Mie scattering asymmetry factor (g)
     */
    public get mieG(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`mieG`].value;
    }

    /**
     * Set Mie scattering asymmetry factor (default: 0.758)
     * Values close to 1 give strong forward scattering (sun glare)
     * Values close to 0 give isotropic scattering
     */
    public set mieG(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`mieG`].value = value;
    }

    /**
     * Get exposure value for tone mapping
     */
    public get exposure(): number {
        let defaultShader = this._shader.getDefaultColorShader();
        return defaultShader.uniforms[`exposure`].value;
    }

    /**
     * Set exposure value for tone mapping (default: 1.0)
     */
    public set exposure(value: number) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`exposure`].value = value;
    }

    /**
     * Get Earth center position
     */
    public get earthCenter(): Vector3 {
        let defaultShader = this._shader.getDefaultColorShader();
        return new Vector3(
            defaultShader.uniforms[`earthCenterX`].value,
            defaultShader.uniforms[`earthCenterY`].value,
            defaultShader.uniforms[`earthCenterZ`].value
        );
    }

    /**
     * Set Earth center position
     * This allows positioning the Earth in world space
     */
    public set earthCenter(value: Vector3) {
        let defaultShader = this._shader.getDefaultColorShader();
        defaultShader.uniforms[`earthCenterX`].value = value.x;
        defaultShader.uniforms[`earthCenterY`].value = value.y;
        defaultShader.uniforms[`earthCenterZ`].value = value.z;
    }

    /** No-op; atmospheric scattering does not use an environment texture. */
    public set envMap(texture: Texture) {
        // not need env texture for atmospheric scattering
    }

    /** No-op; this material does not use a shadow map. */
    public set shadowMap(texture: Texture) {
        // not need shadowMap texture
    }
}
