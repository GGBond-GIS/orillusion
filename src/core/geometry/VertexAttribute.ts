
/**
 * Describes the memory layout of a single vertex buffer, including its
 * stride, step mode and the attributes it contains.
 * @group Geometry
 */
export class VertexBufferLayout implements GPUVertexBufferLayout {
    name: string;
    offset: number;
    size: number;
    arrayStride: number;
    stepMode?: GPUVertexStepMode;
    attributes: GPUVertexAttribute[];
}

/**
 * Describes a single vertex attribute, including its format, offset and
 * shader binding location within a vertex buffer.
 * @group Geometry
 */
export class VertexAttribute implements GPUVertexAttribute {
    name: string;
    format: GPUVertexFormat;
    offset: number;
    shaderLocation: number;
    stride: number;
}