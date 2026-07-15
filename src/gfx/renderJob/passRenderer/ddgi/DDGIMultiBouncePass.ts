import { MultiBouncePass_cs } from '../../../../assets/shader/compute/MultiBouncePass_cs';
import { View3D } from '../../../../core/View3D';
import { RenderTexture } from '../../../../textures/RenderTexture';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { ComputeShader } from '../../../graphics/webGpu/shader/ComputeShader';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { RendererPassState } from '../state/RendererPassState';
import { DDGIIrradianceVolume } from './DDGIIrradianceVolume';

/**
 * @internal
 */
export class DDGIMultiBouncePass {
    public blendTexture: RenderTexture;
    private volume: DDGIIrradianceVolume;
    private computerShader: ComputeShader;

    constructor(volume: DDGIIrradianceVolume, ctx?: Context3D) {
        this.volume = volume;
        this.initPipeline(ctx);
    }

    private initPipeline(ctx?: Context3D) {
        let giSetting = ctx!.engine!.setting.gi;
        this.blendTexture = new RenderTexture(giSetting.probeSourceTextureSize, giSetting.probeSourceTextureSize, GPUTextureFormat.rgba16float, false, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING, 1, 0, true, true, ctx);

        this.computerShader = new ComputeShader(MultiBouncePass_cs);
        this.computerShader.setStorageTexture("outputBuffer", this.blendTexture);
        this.computerShader.setUniformBuffer("uniformData", this.volume.irradianceVolumeBuffer);
    }

    public setInputs(inputs: RenderTexture[]) {
        let worldNormalMap = inputs[0];
        let colorMap = inputs[1];
        let lightingMap = inputs[2];
        let irradianceMap = inputs[3];

        this.computerShader.setSamplerTexture("normalMap", worldNormalMap);
        this.computerShader.setSamplerTexture("colorMap", colorMap);
        this.computerShader.setSamplerTexture("litMap", lightingMap);
        this.computerShader.setSamplerTexture("irradianceMap", irradianceMap);
    }

    public compute(view: View3D, renderPassState: RendererPassState) {
        const gpu = view.engine3D.context3D.gpuContext;
        let command = gpu.beginCommandEncoder();
        let setting = this.volume.setting;
        let probesCount: number = setting.probeXCount * setting.probeYCount * setting.probeZCount;
        let probeSourceSize: number = setting.probeSize;
        this.computerShader.workerSizeX = (probeSourceSize * 6) / 8;
        this.computerShader.workerSizeY = probeSourceSize / 8;
        this.computerShader.workerSizeZ = probesCount;
        gpu.computeCommand(command, [this.computerShader]);
        gpu.endCommandEncoder(command);

    }
}
