
import { View3D } from '../../core/View3D';
import { BoundingBox } from '../../core/bound/BoundingBox';
import { ClusterLightingBuffer } from '../../gfx/renderJob/passRenderer/cluster/ClusterLightingBuffer';
import { RendererMask } from '../../gfx/renderJob/passRenderer/state/RendererMask';
import { RendererPassState } from '../../gfx/renderJob/passRenderer/state/RendererPassState';
import { PassType } from '../../gfx/renderJob/passRenderer/state/PassType';
import { Vector3 } from '../../math/Vector3';
import { SphereGeometry } from '../../shape/SphereGeometry';
import { Reflection } from './Reflection';
import { Object3D } from '../../core/entities/Object3D';
import { MeshRenderer } from './MeshRenderer';
import { GBufferFrame } from '../../gfx/renderJob/frame/GBufferFrame';
import { ReflectionMaterial } from '../../materials/ReflectionMaterial';
import { BoundingSphere } from '../../core/bound/BoundingSphere';


/**
 * Spherical reflection probe — a {@link Reflection} variant that uses a
 * bounding sphere for its influence volume, suited to localized reflective
 * objects.
 * @group Components
 */
export class SphereReflection extends Reflection {
    /** Initialize the probe with a spherical bound and reflection mask. */
    public init(): void {
        super.init();
        this.castShadow = false;
        this.castGI = false;
        this.addRendererMask(RendererMask.Reflection);
        this.alwaysRender = true;

        this.object3D.bound = new BoundingSphere(Vector3.ZERO.clone(), this.radius);
    }

    /**
     * Spawn a debug sphere mesh that visualizes the captured reflection
     * at the given probe index.
     * @param index reflection probe index to visualize
     * @param view the view providing reflection settings and resources
     * @param scale uniform scale applied to the debug sphere
     */
    public debug(index: number, view: View3D, scale: number = 1): void {
        let obj = new Object3D();
        let mr = obj.addComponent(MeshRenderer);
        mr.addMask(RendererMask.ReflectionDebug);
        mr.geometry = new SphereGeometry(25, 30, 30);
        // mr.material = new LitMaterial();

        let reflectionSetting = view.engine3D.setting.reflectionSetting;
        let reflectionsGBufferFrame = GBufferFrame.getGBufferFrame(GBufferFrame.reflections_GBuffer, view.engine3D.context3D, reflectionSetting.width, reflectionSetting.height);
        let mat = new ReflectionMaterial();
        mat.reflectionIndex = index;
        mat.baseMap = reflectionsGBufferFrame.getCompressGBufferTexture();
        mr.material = mat;
        this.object3D.addChild(obj);

        obj.scaleX = scale;
        obj.scaleY = scale;
        obj.scaleZ = scale;
    }

    /** Register this probe as a render node when enabled. */
    public onEnable(): void {
        super.onEnable();
    }

    /** Unregister this probe from the render node list when disabled. */
    public onDisable(): void {
        super.onDisable();
    }

    public renderPass2(view: View3D, passType: PassType, rendererPassState: RendererPassState, clusterLightingBuffer: ClusterLightingBuffer, encoder: GPURenderPassEncoder, useBundle: boolean = false) {
        super.renderPass2(view, passType, rendererPassState, clusterLightingBuffer, encoder, useBundle);
    }


}
