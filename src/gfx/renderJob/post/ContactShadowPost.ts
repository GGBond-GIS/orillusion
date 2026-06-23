import { ContactShadow_cs } from '../../../assets/shader/compute/ContactShadow_cs';
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
 * Contact Shadows post-pass. Reads the lit color buffer + GBuffer
 * depth/normal, runs a short screen-space ray-march along the dominant
 * directional light, and modulates the color with the resulting shadow
 * factor.
 *
 * This is a lit-color-modulation MVP — it doesn't feed into the PBR
 * shader's `directShadowVisibility[]`, so it doesn't darken indirect
 * lighting. For a small step count (~16) the visual effect is the
 * "vegetation / floor / fingers" close-contact darkness that CSM can't
 * resolve, at ~0.3-0.6ms / 1080p on a desktop adapter.
 *
 * Setting: `engine.setting.shadow.contactShadow.{enable, maxStepCount,
 *   maxDistance, thickness, bias, intensity}`.
 *
 * @group Post Effects
 */
export class ContactShadowPost extends PostBase {
    private _outTex: VirtualTexture;
    private _compute: ComputeShader;
    private _settingsBuffer: UniformGPUBuffer;
    private _rtFrame: RTFrame;

    constructor() {
        super();
    }

    onAttach(_view: View3D) {
        const cs = (this.setting.shadow as any).contactShadow;
        if (cs) cs.enable = true;
    }
    onDetach(_view: View3D) {
        const cs = (this.setting.shadow as any).contactShadow;
        if (cs) cs.enable = false;
    }

    private _createResources() {
        const [w, h] = this._boundCtx!.presentationSize;
        this._outTex = new VirtualTexture(
            w, h, GPUTextureFormat.rgba16float, false,
            GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
            1, 0, 1, this._boundCtx!,
        );
        this._outTex.name = 'ContactShadowOut';
        const desc = new RTDescriptor();
        desc.loadOp = 'load';
        this._rtFrame = new RTFrame([this._outTex], [desc]);
    }

    private _createCompute(view: View3D) {
        ShaderLib.register('ContactShadow_cs', ContactShadow_cs);
        this._compute = new ComputeShader(ContactShadow_cs);

        // 8 floats packed into one std140 vec4×2 uniform
        this._settingsBuffer = new UniformGPUBuffer(8);
        this._compute.setUniformBuffer('csSettings', this._settingsBuffer);

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
        const cs = (this.setting.shadow as any).contactShadow;
        if (!cs) return;
        this._settingsBuffer.setFloat('maxStepCount', cs.maxStepCount ?? 16);
        this._settingsBuffer.setFloat('maxDistance', cs.maxDistance ?? 0.5);
        this._settingsBuffer.setFloat('thickness', cs.thickness ?? 0.05);
        this._settingsBuffer.setFloat('bias', cs.bias ?? 0.01);
        this._settingsBuffer.setFloat('intensity', cs.intensity ?? 1.0);
        this._settingsBuffer.setFloat('_pad0', 0);
        this._settingsBuffer.setFloat('_pad1', 0);
        this._settingsBuffer.setFloat('_pad2', 0);
        this._settingsBuffer.apply();
    }

    public render(view: View3D, command: GPUCommandEncoder) {
        if (!this._compute) {
            this._createResources();
            this._createCompute(view);
            this.onResize();
            this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(view.engine3D.context3D, this._rtFrame, null);
            this.rendererPassState.label = 'ContactShadow';
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
