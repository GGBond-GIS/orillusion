import { VolumetricFog_cs } from '../../../assets/shader/compute/VolumetricFog_cs';
import { ShaderLib } from '../../../assets/shader/ShaderLib';
import { View3D } from '../../../core/View3D';
import { VirtualTexture } from '../../../textures/VirtualTexture';
import { GlobalBindGroup } from '../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { UniformGPUBuffer } from '../../graphics/webGpu/core/buffer/UniformGPUBuffer';
import { ComputeShader } from '../../graphics/webGpu/shader/ComputeShader';
import { GPUTextureFormat } from '../../graphics/webGpu/WebGPUConst';
import { WebGPUDescriptorCreator } from '../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { GBufferFrame } from '../frame/GBufferFrame';
import { RTDescriptor } from '../../graphics/webGpu/descriptor/RTDescriptor';
import { RTFrame } from '../frame/RTFrame';
import { PostBase } from './PostBase';

/**
 * Volumetric Fog (MVP) — screen-space per-pixel ray-march. Produces
 * directional light scattering ("god rays" / volumetric shafts) and
 * Beer-Lambert distance attenuation in fog.
 *
 * Consumed via the post chain: `addPost(view, new VolumetricFogPost())`.
 *
 * Setting: `engine.setting.render.postProcessing.volumetricFog`.
 *
 * Known MVP limitations:
 *   - Compute pass does NOT sample CSM shadow maps along the march
 *     (would need the shadow map binding plumbed; deferred). The
 *     phase function still biases scattering toward the sun
 *     direction so light-shafts read correctly when looking near
 *     the light.
 *   - No temporal denoise — increase `stepCount` if banding shows.
 *   - Single dominant directional light only; point/spot lights
 *     don't contribute scattering yet.
 *
 * @group Post Effects
 */
export class VolumetricFogPost extends PostBase {
    private _outTex: VirtualTexture;
    private _compute: ComputeShader;
    private _settingsBuffer: UniformGPUBuffer;
    private _rtFrame: RTFrame;

    constructor() {
        super();
    }

    onAttach(_view: View3D) {
        const cfg = (this.setting.render.postProcessing as any).volumetricFog;
        if (cfg) cfg.enable = true;
    }
    onDetach(_view: View3D) {
        const cfg = (this.setting.render.postProcessing as any).volumetricFog;
        if (cfg) cfg.enable = false;
    }

    private _createResources() {
        const [w, h] = this._boundCtx!.presentationSize;
        this._outTex = new VirtualTexture(
            w, h, GPUTextureFormat.rgba16float, false,
            GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
            1, 0, 1, this._boundCtx!,
        );
        this._outTex.name = 'VolumetricFogOut';
        const desc = new RTDescriptor();
        desc.loadOp = 'load';
        this._rtFrame = new RTFrame([this._outTex], [desc]);
    }

    private _createCompute(view: View3D) {
        ShaderLib.register('VolumetricFog_cs', VolumetricFog_cs);
        this._compute = new ComputeShader(VolumetricFog_cs);

        // 8 floats packed
        this._settingsBuffer = new UniformGPUBuffer(8);
        this._compute.setUniformBuffer('fogSettings', this._settingsBuffer);

        const lightEntries = GlobalBindGroup.getLightEntries(view.scene);
        this._compute.setStorageBuffer('lightBuffer', lightEntries.storageGPUBuffer);

        const rtFrame = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, view.engine3D.context3D);
        this._compute.setSamplerTexture('gBufferTexture', rtFrame.getCompressGBufferTexture());
        this._compute.setSamplerTexture('inTex', this.getLastRenderTexture());
        this._compute.setStorageTexture('outTex', this._outTex);

        const cameraGroup = GlobalBindGroup.getCameraGroup(view.camera);
        this._compute.setUniformBuffer('globalUniform', cameraGroup.uniformGPUBuffer);
    }

    private _uploadSettings() {
        const cfg = (this.setting.render.postProcessing as any).volumetricFog;
        if (!cfg) return;
        this._settingsBuffer.setFloat('density', cfg.density ?? 0.05);
        this._settingsBuffer.setFloat('scatteringIntensity', cfg.scatteringIntensity ?? 1.0);
        this._settingsBuffer.setFloat('anisotropy', cfg.anisotropy ?? 0.6);
        this._settingsBuffer.setFloat('maxDistance', cfg.maxDistance ?? 100.0);
        this._settingsBuffer.setFloat('stepCount', cfg.stepCount ?? 32);
        const ambient = cfg.ambient || { r: 0.02, g: 0.02, b: 0.04 };
        this._settingsBuffer.setFloat('ambientR', ambient.r);
        this._settingsBuffer.setFloat('ambientG', ambient.g);
        this._settingsBuffer.setFloat('ambientB', ambient.b);
        this._settingsBuffer.apply();
    }

    public render(view: View3D, command: GPUCommandEncoder) {
        if (!this._compute) {
            this._createResources();
            this._createCompute(view);
            this.onResize();
            this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(view.engine3D.context3D, this._rtFrame, null);
            this.rendererPassState.label = 'VolumetricFog';
        }
        this.bindUpstream(this._compute, 'inTex');
        this._uploadSettings();
        this._boundCtx!.gpuContext.computeCommand(command, [this._compute]);
        this._boundCtx!.gpuContext.lastRenderPassState = this.rendererPassState;
    }

    public onResize() {
        const [w, h] = this._boundCtx!.presentationSize;
        if (this._outTex) this._outTex.resize(w, h);
        if (this._compute) {
            this._compute.workerSizeX = Math.ceil(w / 8);
            this._compute.workerSizeY = Math.ceil(h / 8);
            this._compute.workerSizeZ = 1;
        }
    }
}
