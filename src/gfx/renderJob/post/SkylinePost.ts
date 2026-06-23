import { Skyline_cs } from '../../../assets/shader/compute/Skyline_cs';
import { Engine3D } from '../../../Engine3D';
import { Color } from '../../../math/Color';
import { VirtualTexture } from '../../../textures/VirtualTexture';
import { GPUTextureFormat } from '../../graphics/webGpu/WebGPUConst';
import { PostBase } from './PostBase';
import { View3D } from '../../../core/View3D';
import { GBufferFrame } from '../frame/GBufferFrame';
import { RTDescriptor } from '../../graphics/webGpu/descriptor/RTDescriptor';
import { RTFrame } from '../frame/RTFrame';
import { ComputeShader } from '../../graphics/webGpu/shader/ComputeShader';
import { UniformGPUBuffer } from '../../graphics/webGpu/core/buffer/UniformGPUBuffer';
import { RendererPassState } from '../passRenderer/state/RendererPassState';
import { WebGPUDescriptorCreator } from '../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';

/**
 * Skyline post-processing effect
 * Draws a colored outline at the boundary between objects and the sky
 * @group Post Effects
 */
export class SkylinePost extends PostBase {
    /**
     * @internal
     */
    public skylineTexture: VirtualTexture;
    private skylineCompute: ComputeShader;
    private skylineUniform: UniformGPUBuffer;
    private rtFrame: RTFrame;

    constructor() {
        super();
    }

    private createCompute(view: View3D) {
        this.skylineCompute = new ComputeShader(Skyline_cs);

        // 4 floats for color + 4 floats for settings = 8 floats
        this.skylineUniform = new UniformGPUBuffer(8);
        this.skylineCompute.setUniformBuffer('skylineSetting', this.skylineUniform);

        let rtFrame = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, this._boundCtx!);
        this.skylineCompute.setSamplerTexture('gBufferTexture', rtFrame.getCompressGBufferTexture());
        this.skylineCompute.setSamplerTexture('inTex', rtFrame.getColorTexture());
        this.skylineCompute.setStorageTexture('outTex', this.skylineTexture);

        this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(view.engine3D.context3D, this.rtFrame, null);
        this.rendererPassState.label = "Skyline";
    }

    private uploadSetting() {
        let skylineUniform = this.skylineUniform;
        let setting = this.setting.render.postProcessing.skyline;

        skylineUniform.setColor('lineColor', setting.lineColor);
        skylineUniform.setFloat('lineWidth', setting.lineWidth);
        skylineUniform.setFloat('depthThreshold', setting.depthThreshold);
        skylineUniform.setFloat('strength', setting.strength);
        skylineUniform.setFloat('slot', 0);

        skylineUniform.apply();
        this.skylineCompute.setUniformBuffer('skylineSetting', this.skylineUniform);
    }

    protected createResource() {
        let [w, h] = this._boundCtx!.presentationSize;
        this.skylineTexture = new VirtualTexture(w, h, GPUTextureFormat.rgba16float, false, GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING, 1, 0, 1, this._boundCtx!);
        this.skylineTexture.name = 'skylineTex';
        let skylineDesc = new RTDescriptor();
        skylineDesc.loadOp = 'load';
        this.rtFrame = new RTFrame([this.skylineTexture], [skylineDesc]);
    }

    /**
     * @internal
     */
    public onAttach(view: View3D) {
        this.setting.render.postProcessing.skyline.enable = true;
    }

    /**
     * @internal
     */
    public onDetach(view: View3D) {
        this.setting.render.postProcessing.skyline.enable = false;
    }

    /**
     * Line color of the skyline effect
     */
    public get lineColor(): Color {
        return this.setting.render.postProcessing.skyline.lineColor;
    }

    public set lineColor(value: Color) {
        this.setting.render.postProcessing.skyline.lineColor.copy(value);
    }

    /**
     * Line width in pixels
     */
    public get lineWidth(): number {
        return this.setting.render.postProcessing.skyline.lineWidth;
    }

    public set lineWidth(value: number) {
        this.setting.render.postProcessing.skyline.lineWidth = Math.max(1, Math.min(10, value));
    }

    /**
     * Depth threshold for edge detection
     */
    public get depthThreshold(): number {
        return this.setting.render.postProcessing.skyline.depthThreshold;
    }

    public set depthThreshold(value: number) {
        this.setting.render.postProcessing.skyline.depthThreshold = Math.max(0.0001, value);
    }

    /**
     * Strength of the skyline effect
     */
    public get strength(): number {
        return this.setting.render.postProcessing.skyline.strength;
    }

    public set strength(value: number) {
        this.setting.render.postProcessing.skyline.strength = Math.max(0, Math.min(1, value));
    }

    /**
     * @internal
     */
    render(view: View3D, command: GPUCommandEncoder) {
        if (!this.skylineCompute) {
            this.createResource();
            this.createCompute(view);
        }

        this.uploadSetting();

        let [w, h] = this._boundCtx!.presentationSize;
        this.skylineCompute.workerSizeX = Math.ceil(w / 8);
        this.skylineCompute.workerSizeY = Math.ceil(h / 8);
        this.skylineCompute.workerSizeZ = 1;

        this._boundCtx!.gpuContext.computeCommand(command, [this.skylineCompute]);
        this._boundCtx!.gpuContext.lastRenderPassState = this.rendererPassState;
    }

    public onResize(): void {
        let [w, h] = this._boundCtx!.presentationSize;
        if (this.skylineTexture) {
            this.skylineTexture.resize(w, h);
            this.skylineCompute.workerSizeX = Math.ceil(w / 8);
            this.skylineCompute.workerSizeY = Math.ceil(h / 8);
            this.skylineCompute.workerSizeZ = 1;
        }
    }
}
