import { ILight } from '../../../../components/lights/ILight';
import { Camera3D } from '../../../../core/Camera3D';
import { CubeCamera } from '../../../../core/CubeCamera';
import { View3D } from '../../../../core/View3D';
import { CEvent } from '../../../../event/CEvent';
import { Depth2DTextureArray } from '../../../../textures/Depth2DTextureArray';
import { DepthCubeArrayTexture } from '../../../../textures/DepthCubeArrayTexture';
import { RenderTexture } from '../../../../textures/RenderTexture';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { Texture } from '../../../graphics/webGpu/core/texture/Texture';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { WebGPUDescriptorCreator } from '../../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { EntityCollect } from '../../collect/EntityCollect';
import { ProbeGBufferFrame } from '../../frame/ProbeGBufferFrame';
import { RenderContext } from '../../passRenderer/RenderContext';
import { DDGIIrradianceComputePass } from '../../passRenderer/ddgi/DDGIIrradianceComputePass';
import { DDGIIrradianceVolume } from '../../passRenderer/ddgi/DDGIIrradianceVolume';
import { DDGILightingPass } from '../../passRenderer/ddgi/DDGILightingPass';
import { DDGIMultiBouncePass } from '../../passRenderer/ddgi/DDGIMultiBouncePass';
import { Probe } from '../../passRenderer/ddgi/Probe';
import { PassType } from '../../passRenderer/state/PassType';
import { RendererPassState } from '../../passRenderer/state/RendererPassState';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { POINT_SHADOW_CUBE_ARRAY } from './PointShadowPass';
import { MAIN_SHADOW_MAP } from './ShadowPass';

/**
 * Published handle names for the DDGI probe outputs. Material
 * shaders sample `_DDGIIrradianceMap` for octahedral-mapped
 * irradiance per probe; `_DDGIDepthMap` carries moments used for
 * probe visibility tests.
 *
 * @group Graph
 */
export const DDGI_IRRADIANCE_MAP = '_DDGIIrradianceMap';
export const DDGI_DEPTH_MAP = '_DDGIDepthMap';

export type GlobalIrradianceStatus = 'none' | 'rendering' | 'complete';

/**
 * Event fired (on the GIPass instance, via CEventDispatcher) when the
 * full probe array has finished rendering. Consumed by the optional
 * GPU buffer reader for cloud-GI pipelines.
 *
 * @group Graph
 */
export const GIRenderStartEvent = new CEvent('GIRenderStartEvent');
export const GIRenderCompleteEvent = new CEvent('GIRenderCompleteEvent');

class ProbeRenderResult {
    public count: number = 0;
    public complete: boolean = false;
}

/**
 * DDGI probe renderer. Owns the probe-source GBuffer, the cube camera
 * used to render scene radiance for each probe, and the irradiance
 * volume / lighting / multi-bounce / irradiance-compute child passes.
 * Splits the probe budget over multiple frames (`probeCountPerFrame`)
 * so a 1024-probe scene doesn't burn an entire frame on probe updates.
 *
 * @group Graph
 */
export class GIPass extends RenderGraphPass {
    public readonly name = 'GIPass';

    public positionMap!: RenderTexture;
    public normalMap!: RenderTexture;
    public colorMap!: RenderTexture;
    public irradianceColorMap!: RenderTexture;
    public irradianceDepthMap!: RenderTexture;
    public probeNext!: number;
    public sizeW!: number;
    public sizeH!: number;

    public lightingPass: DDGILightingPass | null = null;
    public bouncePass: DDGIMultiBouncePass | null = null;
    public irradianceComputePass: DDGIIrradianceComputePass | null = null;

    protected readonly _passType: PassType = PassType.GI;
    protected _volume!: DDGIIrradianceVolume;
    protected _cubeCamera!: CubeCamera;
    protected _renderContext!: RenderContext;
    protected _rendererPassState!: RendererPassState;
    protected _probeGBufferFrame!: ProbeGBufferFrame;
    protected readonly _probeCountPerFrame = 1;

    protected _nextProbeIndex = -1;
    protected _tempProbeList: Probe[] = [];
    protected _isRenderCloudGI = false;
    protected _renderStatus: GlobalIrradianceStatus = 'none';
    protected _probeRenderResult = new ProbeRenderResult();

    public setup(b: RenderGraphBuilder): void {
        const view = b.view;
        const ctx = b.context3D;
        const lightEntries = GlobalBindGroup.getLightEntries(view.scene);
        this._volume = lightEntries.irradianceVolume;
        const giSetting = this._volume.setting;

        this.sizeW = giSetting.probeSourceTextureSize;
        this.sizeH = giSetting.probeSourceTextureSize;
        this.probeNext = giSetting.probeSourceTextureSize / giSetting.probeSize;

        this._cubeCamera = new CubeCamera(0.01, 5000);
        this._cubeCamera.bindCtx(ctx);

        const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST;
        this.irradianceDepthMap = new RenderTexture(giSetting.octRTMaxSize, giSetting.octRTMaxSize, GPUTextureFormat.rgba16float, false, usage, 1, 0, true, true, ctx);
        this.irradianceDepthMap.name = 'irradianceDepthMap';
        this.irradianceColorMap = new RenderTexture(giSetting.octRTMaxSize, giSetting.octRTMaxSize, GPUTextureFormat.rgba16float, false, usage, 1, 0, true, true, ctx);
        this.irradianceColorMap.name = 'irradianceColorMap';

        this._probeGBufferFrame = new ProbeGBufferFrame(this.sizeW, this.sizeH, false, ctx);
        this.positionMap = this._probeGBufferFrame.renderTargets[0];
        this.normalMap = this._probeGBufferFrame.renderTargets[1];
        this.colorMap = this._probeGBufferFrame.renderTargets[2];

        this._rendererPassState = WebGPUDescriptorCreator.createRendererPassState(ctx, this._probeGBufferFrame);
        this._renderContext = new RenderContext(ctx, this._probeGBufferFrame);

        // GIPass depends on both directional + point shadow inputs.
        // Read declares the topo dependency; we resolve through the
        // pool to wire the lighting / bounce / irradiance compute
        // child passes via setInputTextures.
        b.read(MAIN_SHADOW_MAP);
        b.read(POINT_SHADOW_CUBE_ARRAY);

        const shadowMap = b.graph.pool.get<Depth2DTextureArray>(MAIN_SHADOW_MAP);
        const pointShadowMap = b.graph.pool.get<DepthCubeArrayTexture>(POINT_SHADOW_CUBE_ARRAY);
        this.setInputTextures(shadowMap, pointShadowMap);

        b.write<RenderTexture>(DDGI_IRRADIANCE_MAP, () => this.irradianceColorMap);
        b.write<RenderTexture>(DDGI_DEPTH_MAP, () => this.irradianceDepthMap);
    }

    /** Wire shadow-map inputs into the lighting / bounce / irradiance
     *  compute child passes. Called from `setup` after the shadow
     *  textures are registered in the pool. Public so cloud-GI / test
     *  harnesses can re-wire if needed. */
    public setInputTextures(shadowMap: Depth2DTextureArray, pointShadowMap: DepthCubeArrayTexture): void {
        const ctx = this.irradianceColorMap._boundCtx!;
        if (!this.lightingPass) {
            this.lightingPass = new DDGILightingPass(ctx);
            this.bouncePass = new DDGIMultiBouncePass(this._volume, ctx);
            this.irradianceComputePass = new DDGIIrradianceComputePass(ctx, this._volume);
        }
        this.lightingPass.setInputs([this.positionMap, this.normalMap, this.colorMap, shadowMap as Texture, pointShadowMap as Texture]);
        this.bouncePass!.setInputs([this.normalMap, this.colorMap, this.lightingPass.lightingTexture, this.irradianceColorMap]);
        this.irradianceComputePass!.setTextures([this.positionMap, this.normalMap, this.bouncePass!.blendTexture], this.irradianceColorMap, this.irradianceDepthMap);
    }

    public execute(ctx: RenderGraphPassContext): void {
        const view = ctx.view;
        if (!view.engine3D.setting.gi.enable) return;

        this._volume.updateOrientation();
        this._volume.isVolumeFrameChange = false;
        this._volume.uploadBuffer();

        this._renderProbes(view);
        const probeBeRendered = this._probeRenderResult.count > 0;

        if (EntityCollect.instance.state.giLightingChange || probeBeRendered || view.engine3D.setting.gi.realTimeGI) {
            EntityCollect.instance.state.giLightingChange = false;
            this.lightingPass?.compute(view, this._rendererPassState);
            this.bouncePass?.compute(view, this._rendererPassState);
            this.irradianceComputePass?.compute(view, this._rendererPassState);
        }

        if (this._probeRenderResult.complete) {
            this.dispatchEvent(GIRenderCompleteEvent);
        }
    }

    public startRenderGI(index: number = 0): void {
        if (this._nextProbeIndex === -1 && index === 0) {
            this.dispatchEvent(GIRenderStartEvent);
        }
        this._nextProbeIndex = index;
        this._renderStatus = 'rendering';
    }

    public startRenderCloudGI(): void {
        this.dispatchEvent(GIRenderStartEvent);
        this._nextProbeIndex = 0;
        this._renderStatus = 'rendering';
        this._isRenderCloudGI = true;
    }

    /** Cloud-GI / scripted reload entry point: write irradiance arrays
     *  directly into the GPU textures. Used by the GPU buffer reader
     *  pipeline. Layout must match the irradianceColorMap dimensions. */
    public setIrradianceData(colorData: Float32Array, depthData: Float32Array, width: number, height: number): void {
        if (width !== this.irradianceColorMap.width || height !== this.irradianceColorMap.height) {
            console.error('irradiance image size not match !');
            return;
        }
        this._writeToTexture(this.irradianceColorMap, colorData, width, height);
        this._writeToTexture(this.irradianceDepthMap, depthData, width, height);
    }

    protected _renderProbes(view: View3D): void {
        const autoRenderProbe = view.engine3D.setting.gi.autoRenderProbe;
        let execRender = false;
        if (autoRenderProbe) {
            if (this._nextProbeIndex === -1) this.startRenderGI();
            execRender = true;
        } else {
            execRender = this._renderStatus === 'rendering';
        }

        this._probeRenderResult.count = 0;
        this._probeRenderResult.complete = false;
        if (!execRender) return;

        const probeList = EntityCollect.instance.getProbes(view.scene);
        this._renderContext.gpu = view.engine3D.context3D.gpuContext;
        this._renderContext.clean();
        this._renderContext.beginOpaqueRenderPass();
        this._tempProbeList.length = 0;

        let remainCount = Math.min(this._probeCountPerFrame, probeList.length);
        this._probeRenderResult.count = remainCount;

        while (remainCount > 0) {
            const probe = probeList[this._nextProbeIndex];
            this._updateProbe(view, probe, this._renderContext.encoder);
            remainCount--;
            this._nextProbeIndex++;
            if (probe.drawCallFrame < 3) this._tempProbeList.push(probe);
        }

        if (this._tempProbeList.length > 0) {
            this._volume.updateProbes(this._tempProbeList);
        }

        const isComplete = this._nextProbeIndex >= probeList.length;
        if (isComplete && this._isRenderCloudGI) {
            this._updateProbe(view, probeList[0], this._renderContext.encoder);
        }
        this._renderContext.endRenderPass();

        if (isComplete) {
            this._nextProbeIndex = -1;
            this._renderStatus = 'complete';
            this._probeRenderResult.complete = true;
        }
    }

    protected _updateProbe(view: View3D, probe: Probe, encoder: GPURenderPassEncoder): void {
        const lights = EntityCollect.instance.getLights(view.scene);
        const cubeSize = this._volume.setting.probeSize;
        probe.drawCallFrame += 1;

        this._cubeCamera.x = probe.x;
        this._cubeCamera.y = probe.y;
        this._cubeCamera.z = probe.z;

        if (this._volume.setting.debugCamera) {
            this._cubeCamera.x = view.camera.transform.x;
            this._cubeCamera.y = view.camera.transform.y;
            this._cubeCamera.z = view.camera.transform.z;
            this._cubeCamera.rotationX = view.camera.transform.rotationX;
            this._cubeCamera.rotationY = view.camera.transform.rotationY;
            this._cubeCamera.rotationZ = view.camera.transform.rotationZ;
        } else {
            this._cubeCamera.rotationX = probe.rotationX;
            this._cubeCamera.rotationY = probe.rotationY;
            this._cubeCamera.rotationZ = probe.rotationZ;
        }

        const offsetX = Math.floor(probe.index / this.probeNext) * (cubeSize * 6);
        const offsetY = Math.floor(probe.index % this.probeNext) * cubeSize;
        const faces: Camera3D[] = [
            (this._cubeCamera as any).right_camera,
            (this._cubeCamera as any).left_camera,
            (this._cubeCamera as any).up_camera,
            (this._cubeCamera as any).down_camera,
            (this._cubeCamera as any).front_camera,
            (this._cubeCamera as any).back_camera,
        ];
        for (let f = 0; f < 6; f++) {
            encoder.setViewport(cubeSize * f + offsetX, offsetY, cubeSize, cubeSize, 0.0, 1.0);
            this._renderProbeFace(view, faces[f], encoder, lights);
        }
    }

    protected _renderProbeFace(view: View3D, probeCamera: Camera3D, encoder: GPURenderPassEncoder, _lights: ILight[]): void {
        this._volume.uploadBuffer();
        // GI probes bake from their own per-face camera; thread that
        // camera's cullingMask through the layer filter so per-probe
        // layer restrictions take effect.
        const layered = this.collectLayered(view, probeCamera);
        view.engine3D.context3D.gpuContext.bindCamera(encoder, probeCamera);

        const setting = view.engine3D.setting;
        let drawMin = Math.max(0, setting.render.drawOpMin);
        let drawMax = Math.min(setting.render.drawOpMax, layered.opaque.length);

        // Pre-init walk: ensure GI-pass pipelines for all renderers
        // are compiled before the first draw.
        const renderShaderCollect = EntityCollect.instance.getRenderShaderCollect(view);
        if (renderShaderCollect) {
            for (const renderList of renderShaderCollect) {
                const nodeMap = renderList[1];
                for (const [, node] of nodeMap) {
                    if (!node.isDestroyed && node.preInit(this._passType)) {
                        node.nodeUpdate(view, this._passType, this._rendererPassState, null);
                        break;
                    }
                }
            }
        }

        for (let i = drawMin; i < drawMax; ++i) {
            const node = layered.opaque[i];
            if (node.enable && node.transform.enable && !node.isDestroyed) {
                if (!node.preInit(this._passType)) {
                    node.nodeUpdate(view, this._passType, this._rendererPassState, null);
                }
                node.renderPass2(view, this._passType, this._rendererPassState, null, encoder);
            }
        }

        const sky = EntityCollect.instance.getSky(view.scene);
        if (sky) {
            if (!sky.preInit(this._passType)) {
                sky.nodeUpdate(view, this._passType, this._rendererPassState, null);
            }
            sky.renderPass2(view, this._passType, this._rendererPassState, null, encoder);
        }

        drawMin = Math.max(0, setting.render.drawTrMin);
        drawMax = Math.min(setting.render.drawTrMax, layered.transparent.length);
        for (let i = drawMin; i < drawMax; ++i) {
            const node = layered.transparent[i];
            if (node.enable && node.transform.enable && !node.isDestroyed) {
                if (!node.preInit(this._passType)) {
                    node.nodeUpdate(view, this._passType, this._rendererPassState, null);
                }
                node.renderPass2(view, this._passType, this._rendererPassState, null, encoder);
            }
        }
    }

    protected _writeToTexture(texture: RenderTexture, array: Float32Array, width: number, height: number): void {
        const ctx = texture._boundCtx!;
        const device = ctx.device;
        const buffer = device.createBuffer({
            size: array.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        device.queue.writeBuffer(buffer, 0, array as BufferSource);
        const commandEncoder = ctx.gpuContext.beginCommandEncoder();
        commandEncoder.copyBufferToTexture(
            { buffer, bytesPerRow: width * 16 },
            { texture: texture.getGPUTexture() },
            { width, height, depthOrArrayLayers: 1 },
        );
        ctx.gpuContext.endCommandEncoder(commandEncoder);
    }

    public destroy(): void {
        this._cubeCamera?.destroy();
    }
}
