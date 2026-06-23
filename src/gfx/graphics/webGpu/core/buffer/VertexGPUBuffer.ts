import { MemoryInfo } from '../../../../../core/pool/memory/MemoryInfo';
import { GPUBufferBase } from './GPUBufferBase';
import { GPUBufferType } from './GPUBufferType';

/**
 * The buffer use at geometry indices
 * written in the computer shader or CPU Coder
 * usage GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
 * @group GFX
 */
export class VertexGPUBuffer extends GPUBufferBase {
    public node: MemoryInfo;
    constructor(size: number) {
        super();
        this.bufferType = GPUBufferType.VertexGPUBuffer;
        this.createVertexBuffer(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX, size);
    }

    protected createVertexBuffer(usage: GPUBufferUsageFlags, size: number) {
        this.createBuffer(usage, size, undefined, "VertexGPUBuffer");
        this.node = this.memory.allocation_node(this.byteSize);
    }
}
