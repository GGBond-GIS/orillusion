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
import { View3D } from '../../../core/View3D';
import { RTDescriptor } from '../../graphics/webGpu/descriptor/RTDescriptor';
import { GBufferFrame } from '../frame/GBufferFrame';
import { RTFrame } from '../frame/RTFrame';
import { GodRay_cs } from '../../../assets/shader/compute/GodRay_cs';
import { clamp } from '../../../math/MathUtil';


/**
 * God-ray (light-shaft) post-processing effect. A compute pass marches
 * the scene depth/G-buffer to accumulate volumetric light scattering
 * along view rays toward the light, with temporal history reuse, then
 * blends the result over the scene color.
 *
 * @group Post Effects
 */
export class GodRayPost extends PostBase {
    /**
     * @internal
     */
    godRayTexture: VirtualTexture;
    /**
     * @internal
     */
    godRayCompute: ComputeShader;
    /**
     * @internal
     */
    historyGodRayData: StorageGPUBuffer;
    /**
     * @internal
     */
    godRaySetting: StorageGPUBuffer;

    rtFrame: RTFrame;

    constructor() {
        super();
    }

    /**
     * @internal
     */
    onAttach(view: View3D,) {
        this.setting.render.postProcessing.godRay.enable = true;
        this.createGUI();
    }
    /**
     * @internal
     */
    onDetach(view: View3D,) {
        this.setting.render.postProcessing.godRay.enable = false;
        this.removeGUI();
    }

    public get blendColor(): boolean {
        return this.setting.render.postProcessing.godRay.blendColor;
    }
    public set blendColor(value: boolean) {
        this.setting.render.postProcessing.godRay.blendColor = value;
    }
    public get rayMarchCount(): number {
        return this.setting.render.postProcessing.godRay.rayMarchCount;
    }
    public set rayMarchCount(value: number) {
        value = clamp(value, 8, 20);
        this.setting.render.postProcessing.godRay.rayMarchCount = value;
    }
    public get scatteringExponent(): number {
        return this.setting.render.postProcessing.godRay.scatteringExponent;
    }
    public set scatteringExponent(value: number) {
        value = clamp(value, 1, 40);
        this.setting.render.postProcessing.godRay.scatteringExponent = value;
    }
    public get intensity(): number {
        return this.setting.render.postProcessing.godRay.intensity;
    }
    public set intensity(value: number) {
        value = clamp(value, 0.01, 5);
        this.setting.render.postProcessing.godRay.intensity = value;
    }

    private createGUI() {

    }

    private removeGUI() {
    }


    private createCompute(view: View3D) {
        this.godRayCompute = new ComputeShader(GodRay_cs);

        let godRaySetting: UniformGPUBuffer = new UniformGPUBuffer(4 * 3); //vector4 * 2
        this.godRayCompute.setUniformBuffer('godRayUniform', godRaySetting);

        this.historyGodRayData = new StorageGPUBuffer(4 * this.godRayTexture.width * this.godRayTexture.height);
        this.godRayCompute.setStorageBuffer('historyGodRayData', this.historyGodRayData);

        let rtFrame = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, this._boundCtx!);
        this.godRayCompute.setSamplerTexture(`gBufferTexture`, rtFrame.getCompressGBufferTexture());
        this.godRayCompute.setSamplerTexture('inTex', this.getLastRenderTexture());
        this.godRayCompute.setStorageTexture(`outTex`, this.godRayTexture);

        const shadowMap = view.renderGraph?.pool.get(`_MainShadowMap`) as any;
        if (shadowMap) {
            this.godRayCompute.setSamplerTexture(`shadowMap`, shadowMap);
        }

        this.godRaySetting = godRaySetting;

        this.onResize();
    }

    private _createGodRayResources() {
        let presentationSize = this._boundCtx!.presentationSize;
        let [w, h] = presentationSize;
        this.godRayTexture = new VirtualTexture(w, h, GPUTextureFormat.rgba16float, false, GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING, 1, 0, 1, this._boundCtx!);
        this.godRayTexture.name = 'godRayTexture';
        let gtaoDec = new RTDescriptor();
        gtaoDec.loadOp = `load`;
        this.rtFrame = new RTFrame([this.godRayTexture], [gtaoDec]);
    }

    public onResize() {
        let presentationSize = this._boundCtx!.presentationSize;
        let [w, h] = presentationSize;
        this.godRayTexture.resize(w, h);
        this.historyGodRayData.resizeBuffer(4 * this.godRayTexture.width * this.godRayTexture.height);
        this.godRayCompute.setStorageBuffer('historyGodRayData', this.historyGodRayData);

        this.godRayCompute.workerSizeX = Math.ceil(this.godRayTexture.width / 8);
        this.godRayCompute.workerSizeY = Math.ceil(this.godRayTexture.height / 8);
        this.godRayCompute.workerSizeZ = 1;
    }

    /**
     * @internal
     */
    render(view: View3D, command: GPUCommandEncoder) {
        if (!this.godRayCompute) {
            this._createGodRayResources();
            this.createCompute(view);

            let lightUniformEntries = GlobalBindGroup.getLightEntries(view.scene);
            this.godRayCompute.setStorageBuffer("lightBuffer", lightUniformEntries.storageGPUBuffer);
            this.godRayCompute.setStorageBuffer("models", GlobalBindGroup.getModelMatrixBindGroup(view.engine3D.context3D).matrixBufferDst);

            this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(view.engine3D.context3D, this.rtFrame, null);
            this.rendererPassState.label = "GodRay";

            let globalUniform = GlobalBindGroup.getCameraGroup(view.camera);
            this.godRayCompute.setUniformBuffer('globalUniform', globalUniform.uniformGPUBuffer);
        }

        this.bindUpstream(this.godRayCompute, 'inTex');

        let setting = this.setting.render.postProcessing.godRay;

        this.godRaySetting.setFloat('intensity', setting.intensity);
        this.godRaySetting.setFloat('rayMarchCount', setting.rayMarchCount);

        let presentationSize = this._boundCtx!.presentationSize;
        let [w, h] = presentationSize;
        this.godRaySetting.setFloat('viewPortWidth', w);
        this.godRaySetting.setFloat('viewPortHeight', h);
        this.godRaySetting.setFloat('blendColor', setting.blendColor ? 1 : 0);
        this.godRaySetting.setFloat('scatteringExponent', setting.scatteringExponent);
        this.godRaySetting.apply();
        this._boundCtx!.gpuContext.computeCommand(command, [this.godRayCompute]);
        this._boundCtx!.gpuContext.lastRenderPassState = this.rendererPassState;
    }
}
