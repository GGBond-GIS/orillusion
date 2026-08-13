import { MeshRenderer } from './MeshRenderer';
import { BoundingBox } from '../../core/bound/BoundingBox';
import { EarthAtmMaterial } from '../../materials/EarthAtmMaterial';
import { Vector3 } from '../../math/Vector3';
import { SphereGeometry } from '../../shape/SphereGeometry';
import { BlendMode } from '../../materials/BlendMode';
import type { Raycaster } from '../../io/Raycaster';
import type { RaycastHit } from '../../io/RaycastHit';

/**
 * Earth Atm Renderer Component
 * Renders atmospheric scattering for Earth atmosphere
 * Supports both view from space (looking at Earth) and view from ground (looking at sky)
 * @group Components
 */
export class EarthAtmRenderer extends MeshRenderer {
    /**
     * The material used in the Earth Atmosphere.
     */
    public earthAtmMaterial: EarthAtmMaterial;

    /**
     * Radius of the earth sky sphere (should be larger than atmosphere radius)
     */
    private _radius: number = 6471000; // Default: earthRadius + atmosphereHeight

    public init(): void {
        super.init();
        this.castShadow = false;
        this.castGI = false;
        this.alwaysRender = true;

        this.object3D.bound = new BoundingBox(Vector3.ZERO.clone(), Vector3.MAX);
        this.geometry = new SphereGeometry(this._radius, 64, 64);
        this.earthAtmMaterial ||= new EarthAtmMaterial();
        // Configure transparency BEFORE assigning to `this.material`. The
        // RenderNode.materials setter inspects pass.shaderState.transparent
        // at assignment time to set renderOrder (>= 3000 → transparent
        // bucket in EntityCollect). Flipping transparent afterwards leaves
        // the renderer classified as opaque until something triggers
        // refreshRenderClassification — so the atmosphere never renders
        // through the transparent path on the first frame.
        this.earthAtmMaterial.transparent = true;
        this.earthAtmMaterial.blendMode = BlendMode.ALPHA;
        this.material = this.earthAtmMaterial;
    }

    /**
     * The atmosphere dome must not intercept picking rays (same rationale as
     * {@link SkyRenderer.raycast}): it is a full sphere around the camera.
     * @param raycaster the raycaster
     * @param intersects the target array that holds the intersection results
     */
    public raycast(raycaster: Raycaster, intersects: RaycastHit[]) {
        return;
    }

    /**
     * Get the radius of earth sky sphere
     */
    public get radius(): number {
        return this._radius;
    }

    /**
     * Set the radius of earth sky sphere
     * Should be larger than atmosphereRadius to ensure proper rendering
     */
    public set radius(value: number) {
        if (this._radius !== value) {
            this._radius = value;
            this.geometry = new SphereGeometry(this._radius, 64, 64);
        }
    }

    // ========== Earth Parameters ==========

    /**
     * Get Earth radius in meters
     */
    public get earthRadius(): number {
        return this.earthAtmMaterial.earthRadius;
    }

    /**
     * Set Earth radius in meters (default: 6371000)
     */
    public set earthRadius(value: number) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.earthRadius = value;
    }

    /**
     * Get atmosphere outer radius in meters
     */
    public get atmosphereRadius(): number {
        return this.earthAtmMaterial.atmosphereRadius;
    }

    /**
     * Set atmosphere outer radius in meters
     * Typically earthRadius + 100000 for 100km atmosphere
     */
    public set atmosphereRadius(value: number) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.atmosphereRadius = value;
    }

    /**
     * Get Earth center position in world space
     */
    public get earthCenter(): Vector3 {
        return this.earthAtmMaterial.earthCenter;
    }

    /**
     * Set Earth center position in world space
     */
    public set earthCenter(value: Vector3) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.earthCenter = value;
    }

    // ========== Sun Parameters ==========

    /**
     * Get sun direction (normalized vector pointing towards the sun)
     */
    public get sunDirection(): Vector3 {
        return this.earthAtmMaterial.sunDirection;
    }

    /**
     * Set sun direction (will be normalized)
     */
    public set sunDirection(value: Vector3) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.sunDirection = value;
    }

    /**
     * Get sun intensity
     */
    public get sunIntensity(): number {
        return this.earthAtmMaterial.sunIntensity;
    }

    /**
     * Set sun intensity (default: 22.0)
     */
    public set sunIntensity(value: number) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.sunIntensity = value;
    }

    // ========== Scattering Parameters ==========

    /**
     * Get Rayleigh scattering coefficients (wavelength dependent - RGB)
     */
    public get rayleighCoeff(): Vector3 {
        return this.earthAtmMaterial.rayleighCoeff;
    }

    /**
     * Set Rayleigh scattering coefficients
     * Default: (5.5e-6, 13.0e-6, 22.4e-6) for Earth-like atmosphere
     */
    public set rayleighCoeff(value: Vector3) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.rayleighCoeff = value;
    }

    /**
     * Get Mie scattering coefficient
     */
    public get mieCoeff(): number {
        return this.earthAtmMaterial.mieCoeff;
    }

    /**
     * Set Mie scattering coefficient (default: 21e-6)
     */
    public set mieCoeff(value: number) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.mieCoeff = value;
    }

    /**
     * Get Rayleigh scale height in meters
     */
    public get rayleighScale(): number {
        return this.earthAtmMaterial.rayleighScale;
    }

    /**
     * Set Rayleigh scale height (default: 8000 meters)
     */
    public set rayleighScale(value: number) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.rayleighScale = value;
    }

    /**
     * Get Mie scale height in meters
     */
    public get mieScale(): number {
        return this.earthAtmMaterial.mieScale;
    }

    /**
     * Set Mie scale height (default: 1200 meters)
     */
    public set mieScale(value: number) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.mieScale = value;
    }

    /**
     * Get Mie scattering asymmetry factor (g)
     */
    public get mieG(): number {
        return this.earthAtmMaterial.mieG;
    }

    /**
     * Set Mie scattering asymmetry factor (default: 0.758)
     * Values close to 1 give strong forward scattering (sun glare)
     * Values close to 0 give isotropic scattering
     */
    public set mieG(value: number) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.mieG = value;
    }

    // ========== Display Parameters ==========

    /**
     * Get exposure value for tone mapping
     */
    public get exposure(): number {
        return this.earthAtmMaterial.exposure;
    }

    /**
     * Set exposure value for tone mapping (default: 1.0)
     */
    public set exposure(value: number) {
        if (this.earthAtmMaterial)
            this.earthAtmMaterial.exposure = value;
    }

    // ========== Helper Methods ==========

    /**
     * Set sun position using spherical coordinates
     * @param azimuth Azimuth angle in radians (horizontal angle from north)
     * @param elevation Elevation angle in radians (angle above horizon)
     */
    public setSunPosition(azimuth: number, elevation: number): void {
        const x = Math.cos(elevation) * Math.sin(azimuth);
        const y = Math.sin(elevation);
        const z = Math.cos(elevation) * Math.cos(azimuth);
        this.sunDirection = new Vector3(x, y, z);
    }

    /**
     * Configure for ground view (camera on Earth surface)
     * Sets appropriate defaults for viewing sky from ground
     */
    public configureForGroundView(): void {
        this.earthRadius = 6371000;
        this.atmosphereRadius = 6471000;
        this.earthCenter = new Vector3(0, -6371000, 0); // Earth center below ground
        this.sunIntensity = 22.0;
        this.radius = this.atmosphereRadius * 1.5;
    }

    /**
     * Configure for space view (camera in space looking at Earth)
     * Sets appropriate defaults for viewing Earth from space
     */
    public configureForSpaceView(): void {
        this.earthRadius = 6371000;
        this.atmosphereRadius = 6471000;
        this.earthCenter = new Vector3(0, 0, 0); // Earth at origin
        this.sunIntensity = 22.0;
        this.radius = this.atmosphereRadius * 1.5;
    }
}
