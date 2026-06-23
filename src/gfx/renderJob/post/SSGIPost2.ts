import { SSGI_cs } from '../../../assets/shader/compute/SSGI_cs';
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
 * Horizon-based SSGI post effect (MVP).
 *
 * Independent of the existing legacy `SSGIPost` (under `_Sample_SSGI`,
 * marked disabled). Named `SSGIPost2` to coexist; once stabilised this
 * replaces the legacy one.
 *
 * Add to scene: `view.scene.addComponent(PostProcessingComponent).addPost(SSGIPost2)`.
 *
 * @group Post Effects
 */
export class SSGIPost2 extends PostBase {
    private _outTex: VirtualTexture;
    private _compute: ComputeShader;
    private _settingsBuffer: UniformGPUBuffer;
    private _rtFrame: RTFrame;

    private _createResources() {
        const [w, h] = this._boundCtx!.presentationSize;
        this._outTex = new VirtualTexture(
            w, h, GPUTextureFormat.rgba16float, false,
            GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
            1, 0, 1, this._boundCtx!,
        );
        this._outTex.name = 'SSGIOut';
        const desc = new RTDescriptor(); desc.loadOp = 'load';
        this._rtFrame = new RTFrame([this._outTex], [desc]);
    }

    private _createCompute(view: View3D) {
        ShaderLib.register('SSGI_cs', SSGI_cs);
        this._compute = new ComputeShader(SSGI_cs);
        this._settingsBuffer = new UniformGPUBuffer(4);
        this._compute.setUniformBuffer('ssgiSettings', this._settingsBuffer);
        const rtFrame = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, view.engine3D.context3D);
        this._compute.setSamplerTexture('gBufferTexture', rtFrame.getCompressGBufferTexture());
        this._compute.setSamplerTexture('inTex', this.getLastRenderTexture());
        this._compute.setStorageTexture('outTex', this._outTex);
        const cameraGroup = GlobalBindGroup.getCameraGroup(view.camera);
        this._compute.setUniformBuffer('globalUniform', cameraGroup.uniformGPUBuffer);
    }

    public render(view: View3D, command: GPUCommandEncoder) {
        if (!this._compute) {
            this._createResources();
            this._createCompute(view);
            this.onResize();
            this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(view.engine3D.context3D, this._rtFrame, null);
            this.rendererPassState.label = 'SSGI';
        }
        this.bindUpstream(this._compute, 'inTex');
        const cfg = (this.setting.render.postProcessing as any).ssgi || {};
        this._settingsBuffer.setFloat('intensity', cfg.intensity ?? 0.5);
        this._settingsBuffer.setFloat('radius', cfg.radius ?? 50);
        this._settingsBuffer.setFloat('sliceCount', cfg.sliceCount ?? 4);
        this._settingsBuffer.setFloat('stepCount', cfg.stepCount ?? 8);
        this._settingsBuffer.apply();
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
