import { BRDFLUT } from '../../assets/shader/compute/BRDFLUT';
import { VirtualTexture } from '../../textures/VirtualTexture';
import { Context3D } from '../graphics/webGpu/Context3D';
import { ComputeShader } from '../graphics/webGpu/shader/ComputeShader';
import { GPUTextureFormat } from '../graphics/webGpu/WebGPUConst';
/**
 * @internal
 */
export class BRDFLUTGenerate {
    compute: ComputeShader;

    constructor() {
        this.compute = new ComputeShader(BRDFLUT);
    }
    public generateBRDFLUTTexture(ctx?: Context3D) {
        //create virtual texture
        let texture = new VirtualTexture(256, 256, GPUTextureFormat.rgba8unorm, false, GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING, 1, 0, 1, ctx);

        //set storageTexture
        this.compute.setStorageTexture('brdflutTexture', texture);

        //set worker size
        this.compute.workerSizeX = 256 / 8;
        this.compute.workerSizeY = 256 / 8;

        //active — texture constructor bound its ctx via bindCtx
        const gpu = texture._boundCtx!.gpuContext;
        let commandEncoder = gpu.beginCommandEncoder();
        gpu.computeCommand(commandEncoder, [this.compute]);
        gpu.endCommandEncoder(commandEncoder);

        return texture;
    }
}
