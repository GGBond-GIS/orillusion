import { VirtualTexture } from '../../../../textures/VirtualTexture';
import { GPUTextureFormat } from '../WebGPUConst';
import { RenderShaderCompute } from './RenderShaderCompute';
import { PreIntegratedLut } from '../../../../assets/shader/compute/PreIntegratedLut';
import { MaterialDataUniformGPUBuffer } from '../core/buffer/MaterialDataUniformGPUBuffer';
import { Shader } from '../shader/Shader';
import { View3D } from '../../../../core/View3D';
/**
 * @internal
 * @group GFX
 */
export class PreIntegratedLutCompute extends RenderShaderCompute {

    constructor(shader: Shader) {
        super(PreIntegratedLut, shader);
    }

    protected init() {
        //create virtual texture
        let texture = new VirtualTexture(256, 256, GPUTextureFormat.rgba8unorm, false, GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING);

        //set storageTexture
        this.compute.setStorageTexture('sssMap', texture);
        this.sourceShader.setTexture("lutMap", texture);

        return texture;
    }

    public onFrame(view: View3D) {

        //set worker size
        this.compute.workerSizeX = 256 / 8;
        this.compute.workerSizeY = 256 / 8;

        //active
        const gpu = view.engine3D.context3D.gpuContext;
        let commandEncoder = gpu.beginCommandEncoder();
        gpu.computeCommand(commandEncoder, [this.compute]);
        gpu.endCommandEncoder(commandEncoder);
    }
}
