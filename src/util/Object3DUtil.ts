import { Object3D } from '../core/entities/Object3D';
import { MeshRenderer } from '../components/renderer/MeshRenderer';
import { BoxGeometry } from '../shape/BoxGeometry';
import { SphereGeometry } from '../shape/SphereGeometry';
import { LitMaterial } from '../materials/LitMaterial';
import { Color } from '../math/Color';
import { PointLight } from '../components/lights/PointLight';
import { PlaneGeometry } from '../shape/PlaneGeometry';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { Vector3 } from '../math/Vector3';
import { BlendMode } from '../materials/BlendMode';
import { Material } from '../materials/Material';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';

type Object3DUtilHeap = {
    boxGeo: BoxGeometry | null;
    planeGeo: PlaneGeometry | null;
    sphere: SphereGeometry | null;
    material: LitMaterial | null;
    materialMap: Map<Texture, LitMaterial> | null;
};

/**
 * Helper factory for quickly creating common debug/sample Object3D
 * primitives (cubes, spheres, planes, point lights), backed by a
 * per-Context3D cache of shared geometries and materials.
 * @group Util
 */
export class Object3DUtil {
    // Cached geometries/materials are GPU-bearing; keep one heap per Context3D
    // so samples that run under multiple engines don't cross-bind resources.
    private static _getHeap(ctx: Context3D): Object3DUtilHeap {
        let h = ctx.cache(Object3DUtil, () => ({
            boxGeo: null,
            planeGeo: null,
            sphere: null,
            material: null,
            materialMap: null,
        } as Object3DUtilHeap));
        if (!h.boxGeo) h.boxGeo = new BoxGeometry();
        if (!h.planeGeo) h.planeGeo = new PlaneGeometry(1, 1, 1, 1, Vector3.UP);
        if (!h.sphere) h.sphere = new SphereGeometry(1, 35, 35);
        if (!h.material) h.material = new LitMaterial();
        if (!h.materialMap) h.materialMap = new Map<Texture, LitMaterial>();
        return h;
    }

    /** Shared unit box geometry for the given context. */
    public static CubeMesh(ctx: Context3D) {
        return this._getHeap(ctx).boxGeo;
    }

    /** Shared unit sphere geometry for the given context. */
    public static SphereMesh(ctx: Context3D) {
        return this._getHeap(ctx).sphere;
    }

    /** Create a cube Object3D using the shared box geometry and a cloned default material. */
    public static GetCube(ctx: Context3D) {
        const h = this._getHeap(ctx);
        let obj = new Object3D();
        let renderer = obj.addComponent(MeshRenderer);
        renderer.geometry = h.boxGeo;
        renderer.material = h.material.clone();
        renderer.castShadow = true;
        return obj;
    }

    /** Get (and cache per texture) a clone of a LitMaterial whose base map is the given texture. */
    public static GetMaterial(ctx: Context3D, tex: Texture) {
        const h = this._getHeap(ctx);
        let mat = h.materialMap.get(tex);
        if (!mat) {
            mat = new LitMaterial();
            mat.baseMap = tex;
            h.materialMap.set(tex, mat);
        }
        return mat.clone();
    }

    /** Create a textured, additively-blended plane Object3D (no shadow/GI/reflection). */
    public static GetPlane(ctx: Context3D, tex: Texture) {
        const h = this._getHeap(ctx);
        let obj = new Object3D();
        let renderer = obj.addComponent(MeshRenderer);
        renderer.geometry = h.planeGeo;
        let cloneMat = this.GetMaterial(ctx, tex);
        cloneMat.blendMode = BlendMode.ADD;
        cloneMat.castShadow = false;
        renderer.material = cloneMat;
        renderer.castGI = false;
        renderer.castReflection = false;
        return obj;
    }

    /** Create a standalone cube with its own box geometry and a colored LitMaterial. */
    public static GetSingleCube(sizeX: number, sizeY: number, sizeZ: number, r: number, g: number, b: number) {
        let mat = new LitMaterial();
        mat.roughness = 0.5;
        mat.metallic = 0.1;
        mat.baseColor = new Color(r, g, b, 1);

        let obj = new Object3D();
        let renderer = obj.addComponent(MeshRenderer);
        renderer.castGI = true;
        renderer.geometry = new BoxGeometry(sizeX, sizeY, sizeZ);
        renderer.material = mat;
        return obj;
    }

    /** Create a standalone sphere with its own geometry and a colored LitMaterial. */
    public static GetSingleSphere(radius: number, r: number, g: number, b: number) {
        let mat = new LitMaterial();
        mat.baseColor = new Color(r, g, b, 1);

        let obj = new Object3D();
        let renderer = obj.addComponent(MeshRenderer);
        renderer.castGI = true;
        renderer.geometry = new SphereGeometry(radius, 20, 20);
        renderer.material = mat;
        return obj;
    }

    /** Create a standalone cube with the given material and uniform size (no shadow). */
    public static GetSingleCube2(mat: Material, size: number = 10) {
        let obj = new Object3D();
        let renderer = obj.addComponent(MeshRenderer);
        renderer.castShadow = false;
        renderer.geometry = new BoxGeometry(size, size, size);
        renderer.material = mat;
        return obj;
    }

    /** Create a point light Object3D with a small visualizer sphere child. */
    public static GetPointLight(pos: Vector3, rotation: Vector3, radius: number, r: number, g: number, b: number, intensity: number = 1, castShadow: boolean = true) {
        let lightObj = new Object3D();
        let light = lightObj.addComponent(PointLight);
        light.lightColor = new Color(r, g, b, 1);
        light.intensity = intensity;
        light.range = radius;
        light.at = 8;
        light.radius = 0;
        light.castShadow = castShadow;
        lightObj.localPosition = pos;
        lightObj.localRotation = rotation;

        let sp = this.GetSingleSphere(0.1, 1, 1, 1);
        lightObj.addChild(sp);
        return light;
    }
}
