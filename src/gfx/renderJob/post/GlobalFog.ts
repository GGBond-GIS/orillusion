import { GlobalFog_shader } from '../../../assets/shader/post/GlobalFog_shader';
import { ShaderLib } from '../../../assets/shader/ShaderLib';
import { Engine3D } from '../../../Engine3D';
import { Color } from '../../../math/Color';
import { VirtualTexture } from '../../../textures/VirtualTexture';
import { GPUTextureFormat } from '../../graphics/webGpu/WebGPUConst';
import { PostBase } from './PostBase';
import { View3D } from '../../../core/View3D';
import { GBufferFrame } from '../frame/GBufferFrame';
import { SkyRenderer } from '../../../components/renderer/SkyRenderer';
import { EntityCollect } from '../collect/EntityCollect';
import { GlobalFogSetting } from '../../../setting/post/GlobalFogSetting';
import { Texture } from '../../graphics/webGpu/core/texture/Texture';
import { RTDescriptor } from '../../graphics/webGpu/descriptor/RTDescriptor';
import { RTFrame } from '../frame/RTFrame';
import { ComputeShader } from '../../graphics/webGpu/shader/ComputeShader';
import { UniformGPUBuffer } from '../../graphics/webGpu/core/buffer/UniformGPUBuffer';
import { RendererPassState } from '../passRenderer/state/RendererPassState';
import { WebGPUDescriptorCreator } from '../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { GlobalBindGroup } from '../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
/**
 * screen space fog
 * @group Post Effects
 */
export class GlobalFog extends PostBase {
    /**
     * @internal
     */
    public fogOpTexture: VirtualTexture;
    private fogCompute: ComputeShader;
    private fogUniform: UniformGPUBuffer;

    constructor() {
        super();
    }

    private get fogSetting(): GlobalFogSetting {
        return this.setting.render.postProcessing.globalFog;
    }

    private createCompute(view: View3D) {
        ShaderLib.register("GlobalFog_shader", GlobalFog_shader);
        this.fogCompute = new ComputeShader(GlobalFog_shader);

        this.fogUniform = new UniformGPUBuffer(4 * 5); //vector4 * 5
        this.fogCompute.setUniformBuffer('fogUniform', this.fogUniform);

        let rtFrame = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, view.engine3D.context3D);
        this.fogCompute.setSamplerTexture('gBufferTexture', rtFrame.getCompressGBufferTexture());
        this.fogCompute.setSamplerTexture('inTex', rtFrame.getColorTexture());
        this._lastSkyTexture = this.getSkyTexture();
        this.fogCompute.setSamplerTexture(`prefilterMap`, this._lastSkyTexture);
        this.fogCompute.setStorageTexture(`outTex`, this.fogOpTexture);

        this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(view.engine3D.context3D, this.rtFrame, null);
        this.rendererPassState.label = "FOG";

        let lightUniformEntries = GlobalBindGroup.getLightEntries(view.scene);
        this.fogCompute.setStorageBuffer(`lightBuffer`, lightUniformEntries.storageGPUBuffer);
    }

    private uploadSetting() {
        let fogUniform = this.fogUniform;
        let globalFog = this.fogSetting;

        fogUniform.setColor("fogColor", globalFog.fogColor);

        fogUniform.setFloat("fogType", globalFog.fogType);
        fogUniform.setFloat("fogHeightScale", globalFog.fogHeightScale);
        fogUniform.setFloat("start", globalFog.start);
        fogUniform.setFloat("end", globalFog.end);

        fogUniform.setFloat("density", globalFog.density);
        fogUniform.setFloat("ins", globalFog.ins);
        fogUniform.setFloat("falloff", globalFog.falloff);
        fogUniform.setFloat("rayLength", globalFog.rayLength);

        fogUniform.setFloat("scatteringExponent", globalFog.scatteringExponent);
        fogUniform.setFloat("dirHeightLine", globalFog.dirHeightLine);
        fogUniform.setFloat("skyFactor", globalFog.skyFactor);
        fogUniform.setFloat("skyRoughness", globalFog.skyRoughness);

        fogUniform.setFloat("overrideSkyFactor", globalFog.overrideSkyFactor);
        fogUniform.setFloat("isSkyHDR", 0);

        fogUniform.apply();
        this.fogCompute.setUniformBuffer('fogUniform', this.fogUniform);
    }

    rtFrame: RTFrame;

    private _createFogTarget() {
        let [w, h] = this._boundCtx!.presentationSize;
        this.fogOpTexture = new VirtualTexture(w, h, GPUTextureFormat.rgba16float, false, GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING, 1, 0, 1, this._boundCtx!);
        this.fogOpTexture.name = 'fogTex';
        let fogDesc = new RTDescriptor();
        fogDesc.loadOp = `load`;
        this.rtFrame = new RTFrame([this.fogOpTexture], [fogDesc]);
    }

    /**
     * @internal
     */
    public onAttach(view: View3D,) {
        this.setting.render.postProcessing.globalFog.enable = true;
    }
    /**
     * @internal
     */
    public onDetach(view: View3D,) {
        this.setting.render.postProcessing.globalFog.enable = false;
    }

    public set fogType(v: number) {
        this.fogSetting.fogType = v;
    }
    public get fogType() {
        return this.fogSetting.fogType;
    }
    public set fogHeightScale(v: number) {
        this.fogSetting.fogHeightScale = v;
    }
    public get fogHeightScale() {
        return this.fogSetting.fogHeightScale;
    }
    public set start(v: number) {
        this.fogSetting.start = v;
    }
    public get start() {
        return this.fogSetting.start;
    }
    public set end(v: number) {
        this.fogSetting.end = v;
    }
    public get end() {
        return this.fogSetting.end;
    }
    public set ins(v: number) {
        this.fogSetting.ins = v;
    }
    public get ins() {
        return this.fogSetting.ins;
    }
    public set density(v: number) {
        this.fogSetting.density = v;
    }
    public get density() {
        return this.fogSetting.density;
    }
    public set skyRoughness(v: number) {
        this.fogSetting.skyRoughness = v;
    }
    public get skyRoughness() {
        return this.fogSetting.skyRoughness;
    }
    public set skyFactor(v: number) {
        this.fogSetting.skyFactor = v;
    }
    public get skyFactor() {
        return this.fogSetting.skyFactor;
    }

    public set overrideSkyFactor(v: number) {
        this.fogSetting.overrideSkyFactor = v;
    }
    public get overrideSkyFactor() {
        return this.fogSetting.overrideSkyFactor;
    }

    /**
     * @internal
     */
    public get fogColor(): Color {
        return this.fogSetting.fogColor;
    }

    /**
     * @internal
     */
    public set fogColor(value: Color) {
        this.fogSetting.fogColor.copy(value);
    }

    public set falloff(v: number) {
        this.fogSetting.falloff = v;
    }

    public get falloff() {
        return this.fogSetting.falloff;
    }

    public set rayLength(v: number) {
        this.fogSetting.rayLength = v;
    }

    public get rayLength() {
        return this.fogSetting.rayLength;
    }

    public set scatteringExponent(v: number) {
        this.fogSetting.scatteringExponent = v;
    }

    public get scatteringExponent() {
        return this.fogSetting.scatteringExponent;
    }

    public set dirHeightLine(v: number) {
        this.fogSetting.dirHeightLine = v;
    }

    public get dirHeightLine() {
        return this.fogSetting.dirHeightLine;
    }


    private _lastSkyTexture: Texture;
    private getSkyTexture(view?: View3D): Texture {
        let texture = Engine3D.resFor(view?.engine3D?.context3D).defaultSky as Texture;
        const sky = view ? EntityCollect.instance.getSky(view.scene) : undefined;
        if (sky instanceof SkyRenderer) {
            texture = sky.map;
        }
        return texture;
    }

    /**
     * @internal
     */
    render(view: View3D, command: GPUCommandEncoder) {
        if (!this.fogCompute) {
            this._createFogTarget();
            this.createCompute(view);
            this.onResize();


            let globalUniform = GlobalBindGroup.getCameraGroup(view.camera);
            this.fogCompute.setUniformBuffer('globalUniform', globalUniform.uniformGPUBuffer);
        }

        let skyTexture = this.getSkyTexture(view);
        if (skyTexture != this._lastSkyTexture) {
            this._lastSkyTexture = skyTexture;
            this.fogCompute.setSamplerTexture(`prefilterMap`, this._lastSkyTexture);
        }
        this.fogCompute.setUniformFloat('isSkyHDR', skyTexture.isHDRTexture ? 1 : 0);

        this.uploadSetting();
        this._boundCtx!.gpuContext.computeCommand(command, [this.fogCompute]);
        this._boundCtx!.gpuContext.lastRenderPassState = this.rendererPassState;

    }

    public onResize() {
        let [w, h] = this._boundCtx!.presentationSize;
        this.fogOpTexture.resize(w, h);
        this.fogCompute.workerSizeX = Math.ceil(this.fogOpTexture.width / 8);
        this.fogCompute.workerSizeY = Math.ceil(this.fogOpTexture.height / 8);
        this.fogCompute.workerSizeZ = 1;
    }

}
