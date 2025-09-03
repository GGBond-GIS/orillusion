import { Engine3D, Vector3 } from '../../../../..';
import { Matrix4 } from '../../../../../math/Matrix4';
import { UUID } from '../../../../../util/Global';
import { webGPUContext } from '../../Context3D';
import { MatrixGPUBuffer } from '../buffer/MatrixGPUBuffer';
import { StorageGPUBuffer } from '../buffer/StorageGPUBuffer';
/**
 * @author sirxu
 * @internal
 * @group GFX
 */
export class MatrixBindGroup {
    public uuid: string;
    public index: number;
    public usage: number;
    public groupBufferSize: number;
    public matrixBufferDst: MatrixGPUBuffer;
    constructor() {
        this.uuid = UUID();
        this.groupBufferSize = 0;
        this.usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        this.cacheWorldMatrix();
    }

    private cacheWorldMatrix() {
        this.groupBufferSize = Matrix4.maxCount * Matrix4.blockBytes;
        this.matrixBufferDst = new MatrixGPUBuffer(this.groupBufferSize / 4 + Matrix4.maxCount * 8);
        this.matrixBufferDst.visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE
        this.matrixBufferDst.buffer.label = this.groupBufferSize.toString();
    }

    writeBuffer(len: number) {
        if (Engine3D.setting.doublePrecision) {
            Matrix4.dynamicMatrixBytes_32bit.set(Matrix4.dynamicMatrixBytes);
            this.matrixBufferDst.mapAsyncWrite(Matrix4.dynamicMatrixBytes_32bit, len);
        } else {
            this.matrixBufferDst.mapAsyncWrite(Matrix4.dynamicMatrixBytes, len);
        }

        if (Engine3D.setting.useRTE) {
            webGPUContext.device.queue.writeBuffer(this.matrixBufferDst.buffer, Matrix4.maxCount * (16 * 4), Matrix4.matrixWorldPositionHLDatas);
        }
    }

    // writeBuffer() {
    //     const matBytes = Matrix4.dynamicMatrixBytes;
    //     let totalBytes = matBytes.byteLength;
    //     let offsetBytes = 0;

    //     const space = 5000 * 64;
    //     while (offsetBytes < totalBytes) {
    //         let len = Math.min(space, totalBytes - offsetBytes);
    //         webGPUContext.device.queue.writeBuffer(this.matrixBufferDst.buffer, offsetBytes, matBytes.buffer, matBytes.byteOffset + offsetBytes, len);
    //         offsetBytes += len;
    //     }
    // }

    // public async mapAsync() {
    //     await this.matrixBufferDst.buffer.mapAsync(GPUMapMode.WRITE);

    //     const matBytes = Matrix4.dynamicMatrixBytes;
    //     new Float32Array(this.matrixBufferDst.buffer.getMappedRange()).set(matBytes);
    //     this.matrixBufferDst.buffer.unmap();
    // }
}
