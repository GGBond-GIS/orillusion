import { UniformGPUBuffer } from '../../graphics/webGpu/core/buffer/UniformGPUBuffer';
import { WebGPUDescriptorCreator } from '../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { ComputeShader } from '../../graphics/webGpu/shader/ComputeShader';
import { GPUTextureFormat } from '../../graphics/webGpu/WebGPUConst';
import { RendererPassState } from '../passRenderer/state/RendererPassState';
import { PostBase } from './PostBase';
import { Engine3D } from '../../../Engine3D';
import { View3D } from '../../../core/View3D';
import { RTDescriptor } from '../../graphics/webGpu/descriptor/RTDescriptor';
import { RTFrame } from '../frame/RTFrame';
import { downSample, post, threshold, upSample } from '../../../assets/shader/compute/BloomEffect_cs';
import { VirtualTexture } from '../../../textures/VirtualTexture';

/**
 * Bloom Effects
 * ```
 * bloom setting
 * let cfg = {@link this.setting.render.postProcessing.bloom};
 *```
 * @group Post Effects
 */
export class BloomPost extends PostBase {
    /**
     * @internal
     */
    RT_BloomUp: VirtualTexture[];
    RT_BloomDown: VirtualTexture[];
    RT_threshold: VirtualTexture;
    // Separate RT for the final composite. RT_threshold used to double as
    // both the threshold-pass output and the post-pass scene+bloom output
    // in the same compute pass — same GPUTexture written by dispatch[0],
    // sampled by dispatch[1], rewritten by dispatch[last]. Spec-legal,
    // but some backends mishandle the implicit barrier on the workgroup
    // tile boundary and leave stale data persisted in the storage texture
    // — visible as hard-edged 8×8-aligned black squares that stick around
    // until the texture is destroyed. Giving the post pass its own RT
    // makes each storage texture single-role within the pass.
    RT_final: VirtualTexture;
    /**
     * @internal
     */
    thresholdCompute: ComputeShader;
    downSampleComputes: ComputeShader[];
    upSampleComputes: ComputeShader[];
    postCompute: ComputeShader;
    /**
     * @internal
     */
    bloomSetting: UniformGPUBuffer;
    /**
     * @internal
     */
    rtFrame: RTFrame;

    constructor() {
        super();
    }

    /**
     * @internal
     */
    onAttach(view: View3D,) {
        this.setting.render.postProcessing.bloom.enable = true;
        this.createGUI();
    }
    /**
     * @internal
     */
    onDetach(view: View3D,) {
        this.setting.render.postProcessing.bloom.enable = false;
        this.removeGUI();
    }

    private createGUI() {
    }

    private removeGUI() {
    }

    public get downSampleBlurSize(): number {
        return this.setting.render.postProcessing.bloom.downSampleBlurSize;
    }
    public set downSampleBlurSize(value: number) {
        this.setting.render.postProcessing.bloom.downSampleBlurSize = value;
    }

    public get downSampleBlurSigma(): number {
        return this.setting.render.postProcessing.bloom.downSampleBlurSigma;
    }

    public set downSampleBlurSigma(value: number) {
        this.setting.render.postProcessing.bloom.downSampleBlurSigma = value;
    }

    public get upSampleBlurSize(): number {
        return this.setting.render.postProcessing.bloom.upSampleBlurSize;
    }

    public set upSampleBlurSize(value: number) {
        this.setting.render.postProcessing.bloom.upSampleBlurSize = value;
    }

    public get upSampleBlurSigma(): number {
        return this.setting.render.postProcessing.bloom.upSampleBlurSigma;
    }

    public set upSampleBlurSigma(value: number) {
        this.setting.render.postProcessing.bloom.upSampleBlurSigma = value;
    }

    public get luminanceThreshole(): number {
        return this.setting.render.postProcessing.bloom.luminanceThreshole;
    }

    public set luminanceThreshole(value: number) {
        this.setting.render.postProcessing.bloom.luminanceThreshole = value;
    }

    public get bloomIntensity(): number {
        return this.setting.render.postProcessing.bloom.bloomIntensity;
    }

    public set bloomIntensity(value: number) {
        this.setting.render.postProcessing.bloom.bloomIntensity = value;
    }

    public get hdr(): number {
        return this.setting.render.postProcessing.bloom.hdr;
    }

    public set hdr(value: number) {
        this.setting.render.postProcessing.bloom.hdr = value;
    }

    private createThreshouldCompute() {
        this.thresholdCompute = new ComputeShader(threshold);

        this.thresholdCompute.setSamplerTexture('inTex', this.getLastRenderTexture());
        this.thresholdCompute.setStorageTexture(`outTex`, this.RT_threshold);
        this.thresholdCompute.setUniformBuffer('bloomCfg', this.bloomSetting);
        this.thresholdCompute.workerSizeX = Math.ceil(this.RT_threshold.width / 8);
        this.thresholdCompute.workerSizeY = Math.ceil(this.RT_threshold.height / 8);
        this.thresholdCompute.workerSizeZ = 1;
    }

    private createDownSampleComputes() {
        let setting = this.setting.render.postProcessing.bloom;
        const N = setting.downSampleStep;
        this.downSampleComputes = [];

        for (let i = 0; i < N; i++) {
            let compute = new ComputeShader(downSample);
            let dstTexture = this.RT_BloomDown[i];
            let srcTexture = i == 0 ? this.RT_threshold : this.RT_BloomDown[i - 1];
            compute.setSamplerTexture(`inTex`, srcTexture);
            compute.setStorageTexture(`outTex`, dstTexture);
            compute.setUniformBuffer('bloomCfg', this.bloomSetting);
            compute.workerSizeX = Math.ceil(dstTexture.width / 8);
            compute.workerSizeY = Math.ceil(dstTexture.height / 8);
            compute.workerSizeZ = 1;
            this.downSampleComputes.push(compute);
            // Graphics.Blit(RT_BloomDown[i - 1], RT_BloomDown[i], new Material(Shader.Find("Shaders/downSample")));
        }
    }

    private createUpSampleComputes() {
        let setting = this.setting.render.postProcessing.bloom;
        const N = setting.downSampleStep;
        this.upSampleComputes = [];
        {
            let compute = new ComputeShader(upSample);
            let dstTexture = this.RT_BloomUp[0];
            let srcTexture = this.RT_BloomDown[N - 2];
            compute.setSamplerTexture(`_MainTex`, srcTexture);
            compute.setSamplerTexture(`_PrevMip`, this.RT_BloomDown[N - 1]);
            compute.setStorageTexture(`outTex`, dstTexture);
            compute.setUniformBuffer('bloomCfg', this.bloomSetting);
            compute.workerSizeX = Math.ceil(dstTexture.width / 8);
            compute.workerSizeY = Math.ceil(dstTexture.height / 8);
            compute.workerSizeZ = 1;

            this.upSampleComputes.push(compute);
        }
        for (let i = 1; i < N - 1; i++) {
            let compute = new ComputeShader(upSample);
            let dstTexture = this.RT_BloomUp[i];
            let srcTexture = this.RT_BloomDown[N - 2 - i];
            compute.setSamplerTexture(`_MainTex`, srcTexture);
            compute.setSamplerTexture(`_PrevMip`, this.RT_BloomUp[i - 1]);
            compute.setStorageTexture(`outTex`, dstTexture);
            compute.setUniformBuffer('bloomCfg', this.bloomSetting);
            compute.workerSizeX = Math.ceil(dstTexture.width / 8);
            compute.workerSizeY = Math.ceil(dstTexture.height / 8);
            compute.workerSizeZ = 1;

            this.upSampleComputes.push(compute);
        }
    }

    private createPostCompute() {
        let setting = this.setting.render.postProcessing.bloom;
        const N = setting.downSampleStep;

        this.postCompute = new ComputeShader(post);

        this.postCompute.setSamplerTexture('_MainTex', this.getLastRenderTexture());
        this.postCompute.setSamplerTexture(`_BloomTex`, this.RT_BloomUp[N - 2]);
        this.postCompute.setStorageTexture(`outTex`, this.RT_final);
        this.postCompute.setUniformBuffer('bloomCfg', this.bloomSetting);

        this.postCompute.workerSizeX = Math.ceil(this.RT_final.width / 8);
        this.postCompute.workerSizeY = Math.ceil(this.RT_final.height / 8);
        this.postCompute.workerSizeZ = 1;
    }

    private _createBloomResources() {
        let setting = this.setting.render.postProcessing.bloom;
        this.bloomSetting = new UniformGPUBuffer(4 * 2); //vector4 * 2

        let [screenWidth, screenHeight] = this._boundCtx!.presentationSize;
        let usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING;

        this.RT_threshold = new VirtualTexture(screenWidth, screenHeight, GPUTextureFormat.rgba16float, false, usage, 1, 0, 1, this._boundCtx!);
        this.RT_final = new VirtualTexture(screenWidth, screenHeight, GPUTextureFormat.rgba16float, false, usage, 1, 0, 1, this._boundCtx!);

        const N = setting.downSampleStep;
        {
            this.RT_BloomDown = [];
            let w = Math.ceil(screenWidth / 4);
            let h = Math.ceil(screenHeight / 4);
            for (let i = 0; i < N; i++) {
                this.RT_BloomDown[i] = new VirtualTexture(w, h, GPUTextureFormat.rgba16float, false, usage, 1, 0, 1, this._boundCtx!);
                w = Math.ceil(w / 2);
                h = Math.ceil(h / 2);
            }
        }

        {
            this.RT_BloomUp = [];
            for (let i = 0; i < N - 1; i++) {
                let w = this.RT_BloomDown[N - 2 - i].width;
                let h = this.RT_BloomDown[N - 2 - i].height;
                this.RT_BloomUp[i] = new VirtualTexture(w, h, GPUTextureFormat.rgba16float, false, usage, 1, 0, 1, this._boundCtx!);
            }
        }

        let bloomDesc = new RTDescriptor();
        bloomDesc.loadOp = `load`;

        this.rtFrame = new RTFrame([this.RT_final], [bloomDesc]);
    }

    /**
     * @internal
     */
    render(view: View3D, command: GPUCommandEncoder) {
        if (!this.thresholdCompute) {
            this._createBloomResources();
            this.createThreshouldCompute();

            this.createDownSampleComputes();
            this.createUpSampleComputes();
            this.createPostCompute();

            this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(view.engine3D.context3D, this.rtFrame, null);
            this.rendererPassState.label = "Bloom";
        }

        // Re-bind upstream samplers every frame so toggling a preceding
        // post (e.g. SSRPost.enable = false) is picked up without a page
        // reload. Cost is two map lookups + ref compare when nothing
        // changed; bind groups only rebuild when the upstream texture
        // identity actually flipped.
        this.bindUpstream(this.thresholdCompute, 'inTex');
        this.bindUpstream(this.postCompute, '_MainTex');

        let cfg = this.setting.render.postProcessing.bloom;

        this.bloomSetting.setFloat('downSampleStep', cfg.downSampleStep);
        this.bloomSetting.setFloat('downSampleBlurSize', cfg.downSampleBlurSize);
        this.bloomSetting.setFloat('downSampleBlurSigma', cfg.downSampleBlurSigma);
        this.bloomSetting.setFloat('upSampleBlurSize', cfg.upSampleBlurSize);
        this.bloomSetting.setFloat('upSampleBlurSigma', cfg.upSampleBlurSigma);
        this.bloomSetting.setFloat('luminanceThreshole', cfg.luminanceThreshole);
        this.bloomSetting.setFloat('bloomIntensity', cfg.bloomIntensity);
        this.bloomSetting.setFloat('hdr', cfg.hdr);

        this.bloomSetting.apply();

        this._boundCtx!.gpuContext.computeCommand(command, [this.thresholdCompute, ...this.downSampleComputes, ...this.upSampleComputes, this.postCompute]);
        this._boundCtx!.gpuContext.lastRenderPassState = this.rendererPassState;
    }

    public onResize() {
        let cfg = this.setting.render.postProcessing.bloom;

        let [screenWidth, screenHeight] = this._boundCtx!.presentationSize;
        this.RT_threshold.resize(screenWidth, screenHeight);
        this.RT_final.resize(screenWidth, screenHeight);

        const N = cfg.downSampleStep;
        let w = Math.ceil(screenWidth / 4);
        let h = Math.ceil(screenHeight / 4);
        for (let i = 0; i < N; i++) {
            this.RT_BloomDown[i].resize(w, h);
            w = Math.ceil(w / 2);
            h = Math.ceil(h / 2);
        }

        for (let i = 0; i < N - 1; i++) {
            let w = this.RT_BloomDown[N - 2 - i].width;
            let h = this.RT_BloomDown[N - 2 - i].height;
            this.RT_BloomUp[i].resize(w, h);
        }

        this.thresholdCompute.workerSizeX = Math.ceil(this.RT_threshold.width / 8);
        this.thresholdCompute.workerSizeY = Math.ceil(this.RT_threshold.height / 8);
        this.thresholdCompute.workerSizeZ = 1;

        for (let i = 0; i < N; i++) {
            let compute = this.downSampleComputes[i];
            let dstTexture = this.RT_BloomDown[i];
            compute.workerSizeX = Math.ceil(dstTexture.width / 8);
            compute.workerSizeY = Math.ceil(dstTexture.height / 8);
            compute.workerSizeZ = 1;
        }

        {
            let dstTexture = this.RT_BloomUp[0];
            let compute = this.upSampleComputes[0];
            compute.workerSizeX = Math.ceil(dstTexture.width / 8);
            compute.workerSizeY = Math.ceil(dstTexture.height / 8);
            compute.workerSizeZ = 1;
        }

        {
            for (let i = 1; i < N - 1; i++) {
                let dstTexture = this.RT_BloomUp[i];
                let compute = this.upSampleComputes[i];
                compute.workerSizeX = Math.ceil(dstTexture.width / 8);
                compute.workerSizeY = Math.ceil(dstTexture.height / 8);
                compute.workerSizeZ = 1;
            }
        }

        this.postCompute.workerSizeX = Math.ceil(this.RT_final.width / 8);
        this.postCompute.workerSizeY = Math.ceil(this.RT_final.height / 8);
        this.postCompute.workerSizeZ = 1;
    }
}
