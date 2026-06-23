import { Matrix4 } from '../../../../../math/Matrix4';
import { UUID } from '../../../../../util/Global';
import { bindCtx, Context3D } from '../../Context3D';
import { MatrixGPUBuffer } from '../buffer/MatrixGPUBuffer';
/**
 * @internal
 * @group GFX
 */
export class MatrixBindGroup {
    public uuid: string;
    public index: number;
    public usage: number;
    public groupBufferSize: number;
    public matrixBufferDst: MatrixGPUBuffer;
    constructor(ctx: Context3D) {
        this.uuid = UUID();
        this.groupBufferSize = 0;
        this.usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        this.cacheWorldMatrix(ctx);
    }


    private cacheWorldMatrix(ctx: Context3D) {
        this.groupBufferSize = Matrix4.maxCount * Matrix4.blockBytes;
        this.matrixBufferDst = new MatrixGPUBuffer(this.groupBufferSize / 4 + Matrix4.maxCount * 8);
        bindCtx(this.matrixBufferDst, ctx);
        this.matrixBufferDst.visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE
        this.matrixBufferDst.buffer.label = this.groupBufferSize.toString();
    }

    writeBuffer(len: number) {
        const ctx = this.matrixBufferDst._boundCtx;
        const setting = ctx?.engine?.setting;
        if (setting?.doublePrecision) {
            Matrix4.dynamicMatrixBytes_32bit.set(Matrix4.dynamicMatrixBytes);
            this.matrixBufferDst.mapAsyncWrite(Matrix4.dynamicMatrixBytes_32bit, len);
        } else {
            this.matrixBufferDst.mapAsyncWrite(Matrix4.dynamicMatrixBytes, len);
        }

        if (setting?.useRTE) {
            if (ctx) {
                ctx.device.queue.writeBuffer(this.matrixBufferDst.buffer, Matrix4.maxCount * (16 * 4), Matrix4.matrixWorldPositionHLDatas as unknown as BufferSource);
            }
        }
    }

}
