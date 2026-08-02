import { LightType } from '../../../../components/lights/LightData';
import { ILight } from '../../../../components/lights/ILight';
import { RenderNode } from '../../../../components/renderer/RenderNode';
import { Camera3D } from '../../../../core/Camera3D';
import { CubeCamera } from '../../../../core/CubeCamera';
import { PointShadowCubeCamera } from '../../../../core/PointShadowCubeCamera';
import { View3D } from '../../../../core/View3D';
import { Vector3 } from '../../../../math/Vector3';
import { DepthCubeArrayTexture } from '../../../../textures/DepthCubeArrayTexture';
import { VirtualTexture } from '../../../../textures/VirtualTexture';
import { Time } from '../../../../util/Time';
import { Reference } from '../../../../util/Reference';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { RTDescriptor } from '../../../graphics/webGpu/descriptor/RTDescriptor';
import { ShadowLightsCollect } from '../../collect/ShadowLightsCollect';
import { RTFrame } from '../../frame/RTFrame';
import { OcclusionSystem } from '../../occlusion/OcclusionSystem';
import { RenderContext } from '../../passRenderer/RenderContext';
import { PassType } from '../../passRenderer/state/PassType';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { dependOnIfRegistered, preInitPassPipelines } from './_helpers';

/**
 * Published handle name for the point-light shadow cube array.
 * Each point light that casts shadows gets one cubemap slot
 * (6 faces) inside this array texture, indexed by `pointIndex`.
 *
 * @group Graph
 */
export const POINT_SHADOW_CUBE_ARRAY = '_PointShadowCubeArray';

type CubeShadowMapInfo = {
    cubeCamera: CubeCamera;
    depthTexture: VirtualTexture[];
    renderContext: RenderContext[];
};

/**
 * Point-light shadow cube array renderer. Owns the cube array
 * texture and per-light cube cameras; renders 6 faces per shadow-
 * casting light then copies each face into the published cube
 * array. Per-face / per-light loops stay internal — splitting them
 * would explode the graph (6 faces × N lights) without scheduling
 * benefit.
 *
 * @group Graph
 */
export class PointShadowPass extends RenderGraphPass {
    public readonly name = 'PointShadowPass';

    public cubeArrayTexture!: DepthCubeArrayTexture;
    public colorTexture!: VirtualTexture;
    public readonly shadowSize: number = 1024;
    public shadowPassCount: number = 0;

    protected readonly _passType: PassType = PassType.POINT_SHADOW;
    protected readonly _shadowCameraDic = new Map<ILight, CubeShadowMapInfo>();
    protected _forceUpdate = false;

    public setup(b: RenderGraphBuilder): void {
        const ctx = b.context3D;
        this.cubeArrayTexture = new DepthCubeArrayTexture(this.shadowSize, this.shadowSize, 8, ctx);
        this.colorTexture = new VirtualTexture(this.shadowSize, this.shadowSize, GPUTextureFormat.bgra8unorm, false, undefined, 1, 0, 1, ctx);
        Reference.getInstance().attached(this.cubeArrayTexture, this);
        b.write(POINT_SHADOW_CUBE_ARRAY, () => this.cubeArrayTexture);

        dependOnIfRegistered(b, 'GPUCullPass');
    }

    public execute(ctx: RenderGraphPassContext): void {
        const view = ctx.view;
        const occlusion = ctx.occlusion;
        if (!view.engine3D.setting.shadow.enable) return;

        const gpu = view.engine3D.context3D.gpuContext;
        this.shadowPassCount = 0;

        const scene = view.scene;
        const shadowLights = ShadowLightsCollect.getPointShadowLightWhichScene(scene);

        for (const light of shadowLights) {
            if (light.lightData.lightType === LightType.DirectionLight) continue;
            const shouldRender = light.lightData.castShadowIndex > -1
                && (light.needUpdateShadow || this._forceUpdate || Time.frame < 5 || light.realTimeShadow);
            if (!shouldRender) continue;
            light.needUpdateShadow = false;

            const info = this._getShadowCamera(view, light);
            const worldPos = light.transform.worldPosition;
            info.cubeCamera.x = worldPos.x;
            info.cubeCamera.y = worldPos.y;
            info.cubeCamera.z = worldPos.z;
            info.cubeCamera.transform.updateWorldMatrix(true);

            const faces: Camera3D[] = [
                (info.cubeCamera as any).right_camera,
                (info.cubeCamera as any).left_camera,
                (info.cubeCamera as any).up_camera,
                (info.cubeCamera as any).down_camera,
                (info.cubeCamera as any).front_camera,
                (info.cubeCamera as any).back_camera,
            ];

            for (let face = 0; face < 6; face++) {
                const camera = faces[face];
                occlusion.update(camera, scene);
                // Layer-filtered lists (pass.layerMask & camera.cullingMask).
                // Each cube face has its own camera so its cullingMask
                // participates per-face (defaults to All).
                const layered = this.collectLayered(view, camera);
                this._renderFaceOnce(face, info, view, camera, layered.opaque, layered.transparent, occlusion);
            }

            // Publish the 6 face textures into the cube-array slot.
            const command = gpu.beginCommandEncoder();
            for (let i = 0; i < 6; i++) {
                command.copyTextureToTexture(
                    { texture: info.depthTexture[i].getGPUTexture(), mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
                    { texture: this.cubeArrayTexture.getGPUTexture(), mipLevel: 0, origin: { x: 0, y: 0, z: light.shadowIndex * 6 + i } },
                    { width: this.shadowSize, height: this.shadowSize, depthOrArrayLayers: 1 },
                );
            }
            gpu.endCommandEncoder(command);
        }

        this._forceUpdate = false;
    }

    protected _getShadowCamera(view: View3D, light: ILight): CubeShadowMapInfo {
        // Resolve the cube camera's near/far from the light's own settings:
        // shadowCameraFar = 0 → auto (use range). Falls back to main camera
        // far when nothing is set. Far is also the shadow-map depth
        // normalizer (see lightData.shadowFar), so both sides stay
        // consistent.
        const lbAny = light as any;
        const near = (lbAny.shadowCameraNear && lbAny.shadowCameraNear > 0) ? lbAny.shadowCameraNear : 0.01;
        const farOverride = lbAny.shadowCameraFar;
        const lightRange = light.lightData?.range;
        const far = (farOverride && farOverride > 0) ? farOverride
            : (lightRange && lightRange > 0) ? lightRange
                : view.camera.far;

        const existing = this._shadowCameraDic.get(light);
        if (existing) {
            // Refresh projection each frame so GUI changes to near/far
            // take effect immediately without recreating the 6 depth
            // textures.
            const cam = existing.cubeCamera as any;
            const faces = [cam.right_camera, cam.left_camera, cam.up_camera, cam.down_camera, cam.front_camera, cam.back_camera];
            for (const f of faces) {
                if (f && (f.near !== near || f.far !== far)) {
                    f.perspective(90, 1.0, near, far);
                }
            }
            return existing;
        }

        const camera = new PointShadowCubeCamera(near, far, 90, true);
        camera.bindCtx(view.engine3D.context3D);
        camera.label = light.name;
        const depths: VirtualTexture[] = [];
        const renderContexts: RenderContext[] = [];
        for (let i = 0; i < 6; i++) {
            const depthTex = new VirtualTexture(this.shadowSize, this.shadowSize, this.cubeArrayTexture.format, false, undefined, 1, 0, 1, view.engine3D.context3D);
            depthTex.name = `shadowDepthTexture_${light.name}${i}_face`;
            const rtFrame = new RTFrame([this.colorTexture], [new RTDescriptor()]);
            rtFrame.depthTexture = depthTex;
            rtFrame.label = 'shadowRender';
            rtFrame.customSize = true;
            depths[i] = depthTex;
            renderContexts[i] = new RenderContext(view.engine3D.context3D, rtFrame);
        }

        const info: CubeShadowMapInfo = {
            cubeCamera: camera as any as CubeCamera,
            depthTexture: depths,
            renderContext: renderContexts,
        };
        this._shadowCameraDic.set(light, info);
        return info;
    }

    protected _renderFaceOnce(
        face: number,
        info: CubeShadowMapInfo,
        view: View3D,
        shadowCamera: Camera3D,
        opaqueList: RenderNode[],
        transparentList: RenderNode[],
        occlusion: OcclusionSystem,
    ): void {
        const renderContext = info.renderContext[face];
        renderContext.gpu = view.engine3D.context3D.gpuContext;
        renderContext.clean();
        renderContext.beginOpaqueRenderPass();

        renderContext.encoder.setViewport(0, 0, this.shadowSize, this.shadowSize, 0.0, 1.0);
        renderContext.encoder.setScissorRect(0, 0, this.shadowSize, this.shadowSize);

        shadowCamera.onUpdate();
        shadowCamera.transform.updateWorldMatrix(true);

        // Pre-init: ensure shaders compile before draw
        for (const node of opaqueList) {
            if (!node.isDestroyed && node.preInit(this._passType)) {
                node.nodeUpdate(view, this._passType, renderContext.rendererPassState, null);
                break;
            }
        }

        this._drawNodes(view, shadowCamera, renderContext, opaqueList, occlusion);
        this._drawNodes(view, shadowCamera, renderContext, transparentList, occlusion);

        renderContext.endRenderPass();
    }

    protected _drawNodes(
        view: View3D,
        camera: Camera3D,
        renderContext: RenderContext,
        nodes: RenderNode[],
        _occlusion: OcclusionSystem,
    ): void {
        GlobalBindGroup.updateCameraGroup(camera);
        view.engine3D.context3D.gpuContext.bindCamera(renderContext.encoder, camera);

        let cameraWorldPosition = camera.transform.worldPosition;
        if (view.engine3D.setting.useRTE) {
            const mainCamera = Camera3D.mainCamera;
            cameraWorldPosition = Vector3.sub(camera.transform.worldPosition, mainCamera.transform.worldPosition);
        }

        // Pre-init walk for any newly-registered nodes whose pipelines
        // haven't been built yet.
        preInitPassPipelines(view, this._passType, renderContext.rendererPassState);

        const render = view.engine3D.setting.render;
        const max = Math.min(nodes.length, render.drawOpMax);
        for (let i = render.drawOpMin; i < max; ++i) {
            const node = nodes[i];
            if (!node.transform.enable) continue;
            if (!node.enable) continue;
            if (!node.castShadow) continue;
            if (node.isDestroyed) continue;
            if (!node.preInit(this._passType)) {
                node.nodeUpdate(view, this._passType, renderContext.rendererPassState, undefined);
            }
            // Per-face uniforms: cameraFar (used as shadow depth normalizer)
            // and lightWorldPos (in RTE-relative space when useRTE is on).
            for (const material of node.materials) {
                const passes = material.getPass(this._passType);
                if (!passes || passes.length === 0) continue;
                for (const pass of passes) {
                    if (pass.pipeline) {
                        pass.setUniformFloat('cameraFar', camera.far);
                        pass.setUniformVector3('lightWorldPos', cameraWorldPosition);
                        pass.materialDataUniformBuffer.apply();
                    }
                }
            }
            node.renderPass(view, this._passType, renderContext);
        }
    }
}
