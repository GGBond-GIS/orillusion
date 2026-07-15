import { PreFilteredEnvironment_cs } from '../../../../assets/shader/compute/PreFilteredEnvironment_cs';
import { RenderNode } from '../../../../components/renderer/RenderNode';
import { Camera3D } from '../../../../core/Camera3D';
import { CubeCamera } from '../../../../core/CubeCamera';
import { View3D } from '../../../../core/View3D';
import { VirtualTexture } from '../../../../textures/VirtualTexture';
import { Time } from '../../../../util/Time';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { UniformGPUBuffer } from '../../../graphics/webGpu/core/buffer/UniformGPUBuffer';
import { ComputeShader } from '../../../graphics/webGpu/shader/ComputeShader';
import { WebGPUDescriptorCreator } from '../../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { EntityCollect } from '../../collect/EntityCollect';
import { GBufferFrame } from '../../frame/GBufferFrame';
import { OcclusionSystem } from '../../occlusion/OcclusionSystem';
import { ClusterLightingBuffer } from '../../passRenderer/cluster/ClusterLightingBuffer';
import { RenderContext } from '../../passRenderer/RenderContext';
import { PassType } from '../../passRenderer/state/PassType';
import { RendererMask } from '../../passRenderer/state/RendererMask';
import { RendererPassState } from '../../passRenderer/state/RendererPassState';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { ClusterLightingPass } from './ClusterLightingPass';
import { preInitPassPipelines } from './_helpers';

/**
 * Published handle name for the pre-filtered reflection environment
 * map. Used by Color / shading passes to sample reflections at
 * mip levels corresponding to material roughness.
 *
 * @group Graph
 */
export const REFLECTION_CUBE_MAP = '_ReflectionCubeMap';

/**
 * Reflection probe renderer. Renders cube-camera views of the scene
 * into a horizontal-strip atlas, then runs a compute pre-filter that
 * generates the mip chain consumed by lit materials. Both the cube
 * render and the pre-filter compute stay internal to this pass —
 * splitting them would require sharing intermediate textures across
 * graph nodes for no scheduling benefit.
 *
 * @group Graph
 */
export class ReflectionPass extends RenderGraphPass {
    public readonly name = 'ReflectionPass';

    public outTexture!: VirtualTexture;
    public gBuffer!: GBufferFrame;
    public sizeW!: number;
    public sizeH!: number;
    public probeSize!: number;
    public probeCount!: number;
    public readonly mipCount: number = 8;

    protected readonly _passType: PassType = PassType.REFLECTION;
    protected _cubeCamera!: CubeCamera;
    protected _renderContext!: RenderContext;
    protected _rendererPassState!: RendererPassState;
    protected _preFilteredCompute!: ComputeShader;
    protected _preFilteredUniform!: UniformGPUBuffer;

    protected _onChange = true;
    protected _needUpdate = true;

    public setup(b: RenderGraphBuilder): void {
        const view = b.view;
        const ctx = b.context3D;
        const reflectionSetting = view.engine3D.setting.reflectionSetting;
        this.probeSize = reflectionSetting.reflectionProbeSize;
        this.probeCount = reflectionSetting.reflectionProbeMaxCount;
        this.sizeW = reflectionSetting.width;
        this.sizeH = reflectionSetting.height;

        this._cubeCamera = new CubeCamera(0.01, 5000);
        this._cubeCamera.bindCtx(ctx);

        this.gBuffer = GBufferFrame.getGBufferFrame(GBufferFrame.reflections_GBuffer, ctx, this.sizeW, this.sizeH, false);
        this._rendererPassState = WebGPUDescriptorCreator.createRendererPassState(ctx, this.gBuffer);
        this._renderContext = new RenderContext(ctx, this.gBuffer);

        const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        this.outTexture = new VirtualTexture(this.probeSize * this.mipCount, this.sizeH, GPUTextureFormat.rgba16float, false, usage, 1, 0, 1, ctx);
        this.outTexture.name = 'reflection_outTexture';

        this._preFilteredUniform = new UniformGPUBuffer(4 + this.probeCount * 4);
        this._preFilteredUniform.setFloat('probeSize', this.probeSize);
        this._preFilteredUniform.setFloat('probeCount', this.probeCount);
        this._preFilteredUniform.setFloat('width', this.sizeW);
        this._preFilteredUniform.setFloat('height', this.sizeH);
        this._preFilteredUniform.apply();

        this._preFilteredCompute = new ComputeShader(PreFilteredEnvironment_cs);
        this._preFilteredCompute.setSamplerTexture('inputTex', this.gBuffer.getCompressGBufferTexture());
        this._preFilteredCompute.setStorageTexture('outputTexture', this.outTexture);
        this._preFilteredCompute.setUniformBuffer('uniformData', this._preFilteredUniform);

        b.write<VirtualTexture>(REFLECTION_CUBE_MAP, () => this.outTexture);
    }

    /** Mark the cube-face cache dirty so the next frame re-renders all
     *  probes. Called from LightBase when a light moves. */
    public forceUpdate(): void {
        this._onChange = true;
    }

    public execute(ctx: RenderGraphPassContext): void {
        this._render(ctx.view, ctx.occlusion);
        this._compute(ctx.view);
    }

    protected _compute(view: View3D): void {
        if (!this._needUpdate) return;
        this._needUpdate = false;
        const gpu = view.engine3D.context3D.gpuContext;
        const reflectionEntries = GlobalBindGroup.getReflectionEntries(view.scene);
        reflectionEntries.reflectionMap = this.outTexture;

        this._preFilteredCompute.workerSizeX = Math.ceil(this.probeSize * this.mipCount / 16);
        this._preFilteredCompute.workerSizeY = Math.ceil(this.sizeH / 16);
        this._preFilteredCompute.workerSizeZ = this.mipCount * reflectionEntries.count;

        const command = gpu.beginCommandEncoder();
        gpu.computeCommand(command, [this._preFilteredCompute]);
        gpu.endCommandEncoder(command);
    }

    protected _render(view: View3D, occlusion: OcclusionSystem): void {
        this._renderContext.gpu = view.engine3D.context3D.gpuContext;
        this._renderContext.clean();

        const reflections = EntityCollect.instance.getReflections(view.scene);
        const space = this.probeSize;
        const cluster = view.renderGraph?.getPass<ClusterLightingPass>('ClusterLightingPass')?.clusterLightingBuffer;

        for (let i = 0; i < reflections.length; i++) {
            const reflection = reflections[i];
            const shouldRender = (reflection.autoUpdate && (reflection.needUpdate || this._onChange)) || Time.frame < 10;
            if (!shouldRender) continue;
            reflection.needUpdate = false;
            this._needUpdate = true;
            this._renderContext.beginOpaqueRenderPass();
            const encoder = this._renderContext.encoder;
            const offsetY = i * space;

            reflection.transform.updateWorldMatrix();
            const worldPos = reflection.transform.worldPosition;
            this._cubeCamera.x = worldPos.x;
            this._cubeCamera.y = worldPos.y;
            this._cubeCamera.z = worldPos.z;
            this._cubeCamera.far = 10000;
            this._cubeCamera.transform.updateWorldMatrix();

            const faces: Camera3D[] = [
                (this._cubeCamera as any).right_camera,
                (this._cubeCamera as any).left_camera,
                (this._cubeCamera as any).up_camera,
                (this._cubeCamera as any).down_camera,
                (this._cubeCamera as any).front_camera,
                (this._cubeCamera as any).back_camera,
            ];
            for (let f = 0; f < 6; f++) {
                encoder.setViewport(space * f, offsetY, space, space, 0.0, 1.0);
                this._renderFace(view, faces[f], encoder, occlusion, cluster);
            }
            this._renderContext.endRenderPass();
        }
        this._onChange = false;
    }

    protected _renderFace(
        view: View3D,
        camera: Camera3D,
        encoder: GPURenderPassEncoder,
        occlusion: OcclusionSystem,
        cluster: ClusterLightingBuffer | undefined,
    ): void {
        const gpu = view.engine3D.context3D.gpuContext;
        const scene = view.scene;
        camera.transform.scene3D = scene;
        this._rendererPassState.camera3D = camera;
        // Reflection probes render through their own camera; use that
        // camera's cullingMask to honour per-probe layer overrides.
        const layered = this.collectLayered(view, camera);

        GlobalBindGroup.updateCameraGroup(camera);

        const sky = EntityCollect.instance.getSky(scene);
        if (sky) {
            gpu.bindCamera(encoder, camera);
            if (!sky.preInit(this._passType)) {
                sky.nodeUpdate(view, this._passType, this._rendererPassState, cluster);
            }
            sky.renderPass2(view, this._passType, this._rendererPassState, cluster, encoder);
        }

        // Always rebind so downstream stages on the same encoder see a
        // valid group-0 binding even when the filtered list is empty.
        gpu.bindCamera(encoder, camera);
        if (layered.opaque.length > 0) {
            this._drawNodes(view, layered.opaque, occlusion, cluster);
        }
        if (layered.transparent.length > 0) {
            this._drawNodes(view, layered.transparent, occlusion, cluster);
        }
    }

    protected _drawNodes(
        view: View3D,
        nodes: RenderNode[],
        _occlusion: OcclusionSystem,
        cluster: ClusterLightingBuffer | undefined,
    ): void {
        // Pre-init walk so any newly-registered REFLECTION pipelines
        // are compiled before the first draw call (skipping ones tagged
        // ReflectionDebug, which only render in the main color pass).
        preInitPassPipelines(view, this._passType, this._rendererPassState, cluster, (n: any) => !n.hasMask(RendererMask.ReflectionDebug));

        for (const node of nodes) {
            if (node.hasMask(RendererMask.ReflectionDebug)) continue;
            if (!node.transform.enable) continue;
            if (!node.enable) continue;
            if (node.isDestroyed) continue;
            if (!node.preInit(this._passType)) {
                node.nodeUpdate(view, this._passType, this._rendererPassState, cluster);
            }
            node.renderPass(view, this._passType, this._renderContext);
        }
    }

    public destroy(): void {
        // The cube camera is orphan (never added to a scene), so
        // scene.destroy() won't reach it. Tear it down here on
        // engine teardown so its bound ctx releases cleanly.
        this._cubeCamera?.destroy();
    }
}
