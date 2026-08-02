import { MemoryDO } from '../../../../../../core/pool/memory/MemoryDO';
import { MemoryInfo } from '../../../../../../core/pool/memory/MemoryInfo';
import { Probe } from '../../../../../renderJob/passRenderer/ddgi/Probe';
import { bindCtx, Context3D } from '../../../Context3D';
/**
 * @internal
 * @group GFX
 */
export class ProbeEntries {
    public gpuBuffer: GPUBuffer;
    public probes: Probe[];
    public memoryDo: MemoryDO;
    private _probeInfoList: MemoryInfo[];
    public _boundCtx: Context3D | null = null;

    public initDataUniform(ctx: Context3D, probes: Probe[]) {
        bindCtx(this, ctx);
        let device = this._boundCtx!.device;
        this.memoryDo = new MemoryDO();
        this.probes = probes;
        this._probeInfoList = [];

        let len = 0;
        this.memoryDo.destroy();
        this.memoryDo.allocation(probes.length * 17 * 4);
        for (let i = 0; i < probes.length; i++) {
            var size = 17;
            len += size;
            let memoryInfo = this.memoryDo.allocation_node(size * 4);
            this._probeInfoList.push(memoryInfo);

            let probeWorldPos = probes[i].transform.worldPosition;
            memoryInfo.setArray(0, [probeWorldPos.x, probeWorldPos.y, probeWorldPos.z]);
        }

        len = Math.max(64, len);

        this.gpuBuffer = device.createBuffer({
            size: this.memoryDo.shareDataBuffer.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
            label: 'ProbeBuffer',
            mappedAtCreation: false,
        });
    }

    private updateGPUBuffer() {
        let device = this._boundCtx!.device;
        const bufferData = this.memoryDo.shareDataBuffer;
        let totalBytes = this.memoryDo.shareDataBuffer.byteLength;
        let offsetBytes = 0;//this.memoryDo.shareDataBuffer.byteOffset;
        const space = 5000 * 64;
        while (offsetBytes < totalBytes) {
            device.queue.writeBuffer(this.gpuBuffer, offsetBytes, bufferData, offsetBytes, Math.floor(Math.min(space, totalBytes - offsetBytes)));
            offsetBytes += space;
        }
    }
}
