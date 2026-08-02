
import { ZPassShader_cs } from '../../../../assets/shader/core/pass/ZPassShader_cs';
import { View3D } from '../../../../core/View3D';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { ComputeGPUBuffer } from '../../../graphics/webGpu/core/buffer/ComputeGPUBuffer';
import { Texture } from '../../../graphics/webGpu/core/texture/Texture';
import { ComputeShader } from '../../../graphics/webGpu/shader/ComputeShader';
import { RTResourceConfig } from '../../config/RTResourceConfig';
import { RTResourceMap } from '../../frame/RTResourceMap';
import { OcclusionSystem } from '../../occlusion/OcclusionSystem';

/**
 * @internal
 */
export class ZCullingCompute {
    computeShader: ComputeShader;
    visibleBuffer: ComputeGPUBuffer;
    texture: Texture;
    constructor(ctx: Context3D) {
        this.computeShader = new ComputeShader(ZPassShader_cs);

        this.visibleBuffer = new ComputeGPUBuffer(8192 * 2);
        this.computeShader.setStorageBuffer(`visibleBuffer`, this.visibleBuffer);

        this.texture = RTResourceMap.getTexture(ctx, RTResourceConfig.zBufferTexture_NAME);
        this.computeShader.setSamplerTexture(`zBufferTexture`, this.texture);
        this.computeShader.workerSizeX = Math.ceil(this.texture.width / 8);
        this.computeShader.workerSizeY = Math.ceil(this.texture.height / 8);
        this.computeShader.workerSizeZ = 1;
    }

    compute(view: View3D, occlusionSystem: OcclusionSystem) {
        this.visibleBuffer.reset(true, 0);
        this.visibleBuffer.apply();

        const gpu = view.engine3D.context3D.gpuContext;
        let command = gpu.beginCommandEncoder();
        gpu.computeCommand(command, [this.computeShader]);
        this.visibleBuffer.readBuffer();
        occlusionSystem.zVisibleList = this.visibleBuffer.outFloat32Array;
    }
}
