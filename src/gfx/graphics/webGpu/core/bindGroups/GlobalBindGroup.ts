import { Camera3D } from "../../../../../core/Camera3D";
import { Scene3D } from "../../../../../core/Scene3D";
import { Context3D } from "../../Context3D";
import { GlobalUniformGroup } from "./GlobalUniformGroup";
import { LightEntries } from "./groups/LightEntries";
import { ReflectionEntries } from "./groups/ReflectionEntries";
import { MatrixBindGroup } from "./MatrixBindGroup";

/**
 * @internal
 * Use Global DO Matrix ArrayBuffer Descriptor
 *
 * All caches below are keyed by Camera3D/Scene3D which are owned by a
 * single Engine3D (user code creates them per engine), so they are
 * inherently per-device safe. `modelMatrixBindGroup` owns a device-bound
 * GPU buffer, so it is stored per Context3D.
 *
 * @group GFX
 */
export class GlobalBindGroup {
    private static _cameraBindGroups: Map<Camera3D, GlobalUniformGroup> = new Map<Camera3D, GlobalUniformGroup>();
    private static _lightEntriesMap: Map<Scene3D, LightEntries> = new Map<Scene3D, LightEntries>();
    private static _reflectionEntriesMap: Map<Scene3D, ReflectionEntries> = new Map<Scene3D, ReflectionEntries>();

    public static getModelMatrixBindGroup(ctx: Context3D): MatrixBindGroup {
        return ctx.cache(GlobalBindGroup, () => new MatrixBindGroup(ctx));
    }

    public static init(ctx: Context3D) {
        // Pre-warm for this context.
        this.getModelMatrixBindGroup(ctx);
    }

    public static getAllCameraGroup() {
        return this._cameraBindGroups;
    }

    public static getCameraGroup(camera: Camera3D) {
        let cameraBindGroup = this._cameraBindGroups.get(camera);
        if (!cameraBindGroup) {
            const ctx = this._ctxFromCamera(camera);
            cameraBindGroup = new GlobalUniformGroup(ctx, this.getModelMatrixBindGroup(ctx));
            this._cameraBindGroups.set(camera, cameraBindGroup);
        }
        if (camera.isShadowCamera) {
            cameraBindGroup.setShadowCamera(camera);
        } else {
            cameraBindGroup.setCamera(camera);
        }
        return cameraBindGroup;
    }

    public static updateCameraGroup(camera: Camera3D) {
        let cameraBindGroup = this._cameraBindGroups.get(camera);
        if (!cameraBindGroup) {
            const ctx = this._ctxFromCamera(camera);
            cameraBindGroup = new GlobalUniformGroup(ctx, this.getModelMatrixBindGroup(ctx));
            this._cameraBindGroups.set(camera, cameraBindGroup);
        }
        if (camera.isShadowCamera) {
            cameraBindGroup.setShadowCamera(camera);
        } else {
            cameraBindGroup.setCamera(camera);
        }
    }

    public static getLightEntries(scene: Scene3D): LightEntries {
        if (!scene) {
            console.warn(`getLightEntries scene is null`);
        }

        let lightEntries = this._lightEntriesMap.get(scene);
        if (!lightEntries) {
            lightEntries = new LightEntries(scene);
            this._lightEntriesMap.set(scene, lightEntries);
        }
        return this._lightEntriesMap.get(scene);
    }

    public static getReflectionEntries(scene: Scene3D): ReflectionEntries {
        if (!scene) {
            console.warn(`getLightEntries scene is null`);
        }

        let reflectionEntries = this._reflectionEntriesMap.get(scene);
        if (!reflectionEntries) {
            reflectionEntries = new ReflectionEntries();
            this._reflectionEntriesMap.set(scene, reflectionEntries);
        }
        return this._reflectionEntriesMap.get(scene);
    }

    private static _ctxFromCamera(camera: Camera3D): Context3D {
        const ctx = camera._boundCtx
            ?? (camera.transform as any)?.view3D?.engine3D?.context3D
            ?? null;
        if (!ctx) {
            throw new Error(`Camera3D has no bound Context3D — attach camera to a scene/view before use.`);
        }
        return ctx;
    }

    // Called from Engine3D.dispose(). Purges every camera entry whose
    // _boundCtx matches the disposed context, plus the scene-keyed entries.
    // Without this, a long-running app that creates/drops engines leaks a
    // Scene3D + per-camera GlobalUniformGroup per cycle.
    public static removeContext(ctx: Context3D) {
        for (const cam of [...this._cameraBindGroups.keys()]) {
            if (cam._boundCtx === ctx) {
                this._cameraBindGroups.get(cam)?.destroy();
                this._cameraBindGroups.delete(cam);
            }
        }
    }

    public static removeScene(scene: Scene3D) {
        this._lightEntriesMap.get(scene)?.destroy();
        this._lightEntriesMap.delete(scene);
        this._reflectionEntriesMap.delete(scene);
    }
}
