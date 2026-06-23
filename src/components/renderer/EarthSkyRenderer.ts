import { MeshRenderer } from './MeshRenderer';
import { BoundingBox } from '../../core/bound/BoundingBox';
import { Texture } from '../../gfx/graphics/webGpu/core/texture/Texture';
import { RendererMask } from '../../gfx/renderJob/passRenderer/state/RendererMask';
import { EarthSkyMaterial } from '../../materials/EarthSkyMaterial';
import { Vector3 } from '../../math/Vector3';
import { SphereGeometry } from '../../shape/SphereGeometry';

/**
 * Earth Sky Renderer Component
 * Renders a backface sphere sampling cube texture
 * @group Components
 */
export class EarthSkyRenderer extends MeshRenderer {
    /**
     * The material used in the Earth Sky.
     */
    public earthSkyMaterial: EarthSkyMaterial;

    /**
     * Radius of the earth sky sphere
     */
    private _radius: number = 100;

    public init(): void {
        super.init();
        this.castShadow = false;
        this.castGI = false;
        this.alwaysRender = true;

        // not use sky mask,use fragment out_depth 0.999999;
        // this.addRendererMask(RendererMask.Sky);

        this.object3D.bound = new BoundingBox(Vector3.ZERO.clone(), Vector3.MAX);
        this.geometry = new SphereGeometry(this._radius, 64, 64);
        this.earthSkyMaterial ||= new EarthSkyMaterial();
        // Assign the material synchronously here, not lazily in `set map`.
        // Without RendererMask.Sky we used to land in the opaque list and
        // a missing material at first frame happened to be tolerated, but
        // now that this renderer occupies the scene sky slot the render
        // graph calls renderPass2 every frame from `addComponent` onwards.
        // RenderNode.renderPass2 dereferences `materials[0].castShadow`
        // with no nil-check — leaving materials empty crashes on frame 0
        // when callers load the cubemap asynchronously (cubemap.then(t => earthSky.map = t)).
        // EarthSkyMaterial's constructor binds Engine3D.resFor().defaultSky
        // as a placeholder, so the pipeline is valid even before `map` is set.
        this.material = this.earthSkyMaterial;
    }

    /**
     * Get the radius of earth sky sphere
     */
    public get radius(): number {
        return this._radius;
    }

    /**
     * Set the radius of earth sky sphere
     */
    public set radius(value: number) {
        if (this._radius !== value) {
            this._radius = value;
            this.geometry = new SphereGeometry(this._radius, 64, 64);
        }
    }

    /**
     * Set environment texture (cube texture)
     */
    public set map(texture: Texture) {
        this.earthSkyMaterial.baseMap = texture;
        if (this.earthSkyMaterial.name == null) {
            this.earthSkyMaterial.name = 'earthSkyMaterial';
        }
        this.material = this.earthSkyMaterial;
    }

    /**
     * Get environment texture
     */
    public get map(): Texture {
        return this.earthSkyMaterial.baseMap;
    }

    /**
     * Get exposure value
     */
    public get exposure(): number {
        return this.earthSkyMaterial.exposure;
    }

    /**
     * Set exposure value
     */
    public set exposure(value: number) {
        if (this.earthSkyMaterial)
            this.earthSkyMaterial.exposure = value;
    }

    /**
     * Get roughness value
     */
    public get roughness(): number {
        return this.earthSkyMaterial.roughness;
    }

    /**
     * Set roughness value
     */
    public set roughness(value: number) {
        if (this.earthSkyMaterial)
            this.earthSkyMaterial.roughness = value;
    }

    /**
     * Get yaw rotation angle (in radians)
     * Controls horizontal rotation of the sky, independent of camera rotation
     */
    public get yaw(): number {
        return this.earthSkyMaterial.yaw;
    }

    /**
     * Set yaw rotation angle (in radians)
     * Controls horizontal rotation of the sky, independent of camera rotation
     */
    public set yaw(value: number) {
        if (this.earthSkyMaterial)
            this.earthSkyMaterial.yaw = value;
    }

    /**
     * Get pitch rotation angle (in radians)
     * Controls vertical rotation of the sky, independent of camera rotation
     */
    public get pitch(): number {
        return this.earthSkyMaterial.pitch;
    }

    /**
     * Set pitch rotation angle (in radians)
     * Controls vertical rotation of the sky, independent of camera rotation
     */
    public set pitch(value: number) {
        if (this.earthSkyMaterial)
            this.earthSkyMaterial.pitch = value;
    }
}
