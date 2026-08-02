import { Engine3D } from '../Engine3D';
import { SphereReflection } from '../components/renderer/SphereReflection';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { EntityCollect } from '../gfx/renderJob/collect/EntityCollect';
import { View3D } from './View3D';
import { Object3D } from './entities/Object3D';


/**
 * It represents an independent 3D scene where 3D objects can be created and manipulated.
 * @group Core
 */
export class Scene3D extends Object3D {
    private _envMap: Texture;
    private skyObject: Object3D;
    public envMapChange: boolean = true;
    public view: View3D;
    /**
     *
     * @constructor
     */
    constructor() {
        super();
        this.transform.scene3D = this;
        this.skyObject = new Object3D();
        this.addChild(this.skyObject);
        this._isScene3D = true;
    }

    /**
     *
     * get environment texture. Lazily falls back to the default sky of the
     * engine this scene is attached to, so construction doesn't force a
     * device binding before the scene is assigned to a View3D.
     */
    public get envMap(): Texture {
        if (!this._envMap) {
            const ctx = this.view?.engine3D?.context3D;
            if (ctx) this._envMap = Engine3D.resFor(ctx).defaultSky;
        }
        return this._envMap;
    }

    /**
     * set environment texture
     */
    public set envMap(value: Texture) {
        if (this._envMap != value) {
            this.envMapChange = true;
        }
        this._envMap = value;
        const sky = EntityCollect.instance.getSky(this);
        if (sky && `map` in sky)
            (sky as any).map = value;

        // let reflection = new Object3D();
        // let ref = reflection.addComponent(SphereReflection);
        // ref.autoUpdate = true;
        // ref.debug(0, 5);
        // reflection.x = 0;
        // reflection.y = 300;
        // reflection.z = 0;
        // this.addChild(reflection);
    }

    /**
     * Exposure of Sky Box. A larger value produces a sky box with stronger exposure and a brighter appearance.
     *  A smaller value produces a sky box with weaker exposure and a darker appearance.
     */
    public get exposure(): number {
        const sky = EntityCollect.instance.getSky(this);
        if (sky && `exposure` in sky)
            return (sky as any).exposure as number;
        return 0;
    }

    /**
     * Set the exposure of the Sky Box.
     */
    public set exposure(value: number) {
        const sky = EntityCollect.instance.getSky(this);
        if (sky && `exposure` in sky) {
            (sky as any).exposure = value;
            const setting = this.view?.engine3D?.setting;
            if (setting) setting.sky.skyExposure = value;
        }
    }

    /**
     * Get the roughness of the Sky Box.
     */
    public get roughness(): number {
        const sky = EntityCollect.instance.getSky(this);
        if (sky && `roughness` in sky) {
            return (sky as any).roughness as number;
        }
    }

    /**
     * Set the roughness of the Sky Box.
     */
    public set roughness(value: number) {
        const sky = EntityCollect.instance.getSky(this);
        if (sky && `roughness` in sky) {
            (sky as any).roughness = value;
        }
    }
}
