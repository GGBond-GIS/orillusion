import { VirtualTexture } from '../../../textures/VirtualTexture';
import { GlobalBindGroup } from '../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { StorageGPUBuffer } from '../../graphics/webGpu/core/buffer/StorageGPUBuffer';
import { UniformGPUBuffer } from '../../graphics/webGpu/core/buffer/UniformGPUBuffer';
import { WebGPUDescriptorCreator } from '../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { ComputeShader } from '../../graphics/webGpu/shader/ComputeShader';
import { GPUTextureFormat } from '../../graphics/webGpu/WebGPUConst';
import { RendererPassState } from '../passRenderer/state/RendererPassState';
import { PostBase } from './PostBase';
import { Engine3D } from '../../../Engine3D';
import { Time } from '../../../util/Time';
import { clamp } from '../../../math/MathUtil';
import { View3D } from '../../../core/View3D';
import { RTDescriptor } from '../../graphics/webGpu/descriptor/RTDescriptor';
import { GBufferFrame } from '../frame/GBufferFrame';
import { RTFrame } from '../frame/RTFrame';
import { GTAO_cs } from '../../../assets/shader/compute/GTAO_cs';
import { CResizeEvent } from '../../../event/CResizeEvent';
import { TextureScaleCompute } from '../../generate/convert/TextureScaleCompute';
import { RenderTexture } from '../../../textures/RenderTexture';
import { SSGI2_cs } from '../../../assets/shader/compute/SSGI2_cs';
import { Denoising_cs } from '../../../assets/shader/compute/utils/Denoising_cs';
import { Combine_cs, TestComputeLoadBuffer, Vector3, mergeFunctions } from '../../..';

/**
 * Ground base Ambient Occlusion
 * Let the intersection of the object and the object imitate the effect of the light being cross-occluded
 * ```
 * gtao setting
 * let cfg = {@link this.setting.render.postProcessing.gtao};
 *```
 * @group Post Effects
 */
export class GBufferPost extends PostBase {
    /**
     * @internal
     */
    outTexture: VirtualTexture;

    rtFrame: RTFrame;
    view: View3D;
    gBufferTexture: RenderTexture;
    testCompute: ComputeShader;
    private _state: number = 0;
    private _state1: number = 256;
    private _state2: number = 256;
    uniformBuffer: UniformGPUBuffer;
    currentRenderTexture: RenderTexture;
    constructor() {
        super();
    }

    /**
     * @internal
     */
    onAttach(view: View3D,) {
        this.view = view;
    }

    /**
     * @internal
     */
    onDetach(view: View3D,) {
        // this.setting.render.useCompressGBuffer = false;
    }

    /**
     * check state
     */
    public set state(v: number) {
        this._state = v;
        this.uniformBuffer.setInt32("state", v);
        this.uniformBuffer.apply();
    }

    public get state(): number {
        return this._state;
    }

    public set size1(v: number) {
        this._state1 = v;
        this.uniformBuffer.setInt32("state1", v);
        this.uniformBuffer.apply();
    }

    public get size1(): number {
        return this._state1;
    }

    public set size2(v: number) {
        this._state2 = v;
        this.uniformBuffer.setInt32("state2", v);
        this.uniformBuffer.apply();
    }

    public get size2(): number {
        return this._state2;
    }

    private _createGBufferPostResources() {
        let rtFrame = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, this._boundCtx!);
        this.currentRenderTexture = rtFrame.getColorTexture();
        this.gBufferTexture = rtFrame.getCompressGBufferTexture();

        let [w, h] = this._boundCtx!.presentationSize;

        this.outTexture = new VirtualTexture(w, h, GPUTextureFormat.rgba16float, false, GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING, 1, 0, 1, this._boundCtx!);
        this.outTexture.name = 'outTexture';

        let testDec = new RTDescriptor();
        testDec.loadOp = `load`;
        this.rtFrame = new RTFrame([
            this.outTexture
        ], [
            testDec
        ]);
    }

    private createCompute() {
        this.uniformBuffer = new UniformGPUBuffer(4);
        this.uniformBuffer.setInt32("state", this._state);

        let globalUniform = GlobalBindGroup.getCameraGroup(this.view.camera);
        let rtFrame = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, this._boundCtx!);
        let gBufferTexture = rtFrame.getCompressGBufferTexture();

        let reflectionSetting = this.setting.reflectionSetting;
        let reflectionsGBufferFrame = GBufferFrame.getGBufferFrame(GBufferFrame.reflections_GBuffer, this._boundCtx!, reflectionSetting.width, reflectionSetting.height);
        let reflectionsGBufferTexture = reflectionsGBufferFrame.getCompressGBufferTexture();

        let envMap = this.view.renderGraph?.pool.get(`_ReflectionCubeMap`) as any;

        this.testCompute = new ComputeShader(TestComputeLoadBuffer);
        this.testCompute.setUniformBuffer('globalUniform', globalUniform.uniformGPUBuffer);
        this.testCompute.setUniformBuffer('uniformData', this.uniformBuffer);
        this.testCompute.setSamplerTexture("gBufferTexture", gBufferTexture);
        this.testCompute.setSamplerTexture("currentRenderTexture", this.currentRenderTexture);
        this.testCompute.setSamplerTexture("reflectionsGBufferTexture", reflectionsGBufferTexture);
        this.testCompute.setSamplerTexture("envMap", envMap);
        this.testCompute.setStorageTexture("outputTexture", this.outTexture);

        this.testCompute.workerSizeX = Math.ceil(this.outTexture.width / 16);
        this.testCompute.workerSizeY = Math.ceil(this.outTexture.height / 16);
        this.testCompute.workerSizeZ = 1;
    }

    public render(view: View3D, command: GPUCommandEncoder): void {

    }

    public compute(view: View3D): void {
        if (!this.testCompute) {
            this._createGBufferPostResources();
            this.createCompute();
            this.onResize();

            this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(view.engine3D.context3D, this.rtFrame, null);
            this.rendererPassState.label = "test";
        }

        let command = this._boundCtx!.gpuContext.beginCommandEncoder();
        this._boundCtx!.gpuContext.computeCommand(command, [this.testCompute]);
        this._boundCtx!.gpuContext.endCommandEncoder(command);
        this._boundCtx!.gpuContext.lastRenderPassState = this.rendererPassState;
    }

    public onResize() {
        let [w, h] = this._boundCtx!.presentationSize;
        this.outTexture.resize(w, h);

        this.testCompute.workerSizeX = Math.ceil(this.outTexture.width / 16);
        this.testCompute.workerSizeY = Math.ceil(this.outTexture.height / 16);
    }
}