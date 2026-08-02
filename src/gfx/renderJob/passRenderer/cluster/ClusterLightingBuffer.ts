import { ComputeGPUBuffer } from "../../../graphics/webGpu/core/buffer/ComputeGPUBuffer";
import { UniformGPUBuffer } from "../../../graphics/webGpu/core/buffer/UniformGPUBuffer";

/**
 * GPU buffers backing the clustered lighting pass: the per-cluster AABB
 * bounds, the flat light-index assignment list, the per-cluster
 * start/count table into that list, and the uniform block describing the
 * cluster grid. Shared by the compute pass that fills them and the
 * fragment shaders that read them.
 *
 * @group GFX
 */
export class ClusterLightingBuffer {
    /** Per-cluster bounds (two vec4 per cluster). */
    public clusterBuffer: ComputeGPUBuffer;
    /** Flat list of light indices assigned across all clusters. */
    public lightAssignBuffer: ComputeGPUBuffer;
    /** Per-cluster (start, count) into {@link lightAssignBuffer}. */
    public assignTableBuffer: ComputeGPUBuffer;
    /** Uniform block describing the cluster grid and screen/depth params. */
    public clustersUniformBuffer: UniformGPUBuffer;

    constructor(numClusters: number, maxNumLightsPerCluster: number) {
        this.clusterBuffer = new ComputeGPUBuffer(numClusters * /*two vec4*/ 2 * /*vec4*/4);
        this.clustersUniformBuffer = new UniformGPUBuffer(10);
        this.clustersUniformBuffer.visibility = GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;

        this.lightAssignBuffer = new ComputeGPUBuffer(numClusters * maxNumLightsPerCluster);
        this.lightAssignBuffer.visibility = GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;
        this.assignTableBuffer = new ComputeGPUBuffer(numClusters * 4); // it has start and count
        this.assignTableBuffer.visibility = GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;
    }

    /** Upload the current grid, screen size, light count and near/far into the uniform buffer. */
    public update(width: number, height: number, clusterPix: number, clusterTileX: number, clusterTileY: number, clusterTileZ: number, numLights: number, maxNumLightsPerCluster: number, near: number, far: number) {
        this.clustersUniformBuffer.setFloat('clusterTileX', clusterTileX);
        this.clustersUniformBuffer.setFloat('clusterTileY', clusterTileY);
        this.clustersUniformBuffer.setFloat('clusterTileZ', clusterTileZ);
        this.clustersUniformBuffer.setFloat('numLights', numLights);
        this.clustersUniformBuffer.setFloat('maxNumLightsPerCluster', maxNumLightsPerCluster);

        this.clustersUniformBuffer.setFloat('near', near);
        this.clustersUniformBuffer.setFloat('far', far);

        this.clustersUniformBuffer.setFloat('screenWidth', width);
        this.clustersUniformBuffer.setFloat('screenHeight', height);
        this.clustersUniformBuffer.setFloat('clusterPix', clusterPix);
        this.clustersUniformBuffer.apply();
    }
}