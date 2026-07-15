import { ClusterBoundsSource_cs } from '../../../../assets/shader/cluster/ClusterBoundsSource_cs';
import { ClusterLighting_cs } from '../../../../assets/shader/cluster/ClusterLighting_cs';
import { ILight } from '../../../../components/lights/ILight';
import { Camera3D } from '../../../../core/Camera3D';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { ComputeShader } from '../../../graphics/webGpu/shader/ComputeShader';
import { EntityCollect } from '../../collect/EntityCollect';
import { ClusterConfig } from '../../passRenderer/cluster/ClusterConfig';
import { ClusterLightingBuffer } from '../../passRenderer/cluster/ClusterLightingBuffer';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';

/**
 * Published handle name for the cluster lighting buffer. Consumers
 * (ColorPass, post volumetric passes) read this name from the graph
 * pool instead of reaching into a renderer field.
 *
 * @group Graph
 */
export const CLUSTER_LIGHTING_BUFFER = '_ClusterLightingBuffer';

/**
 * Cluster lighting compute pass. Runs once per frame, before any
 * pass that reads `_ClusterLightingBuffer`: refreshes the cluster
 * bounds (when the active camera changes), updates per-cluster
 * light assignment via two compute dispatches, and exposes the
 * resulting `ClusterLightingBuffer` to downstream passes.
 *
 * The published `_ClusterLightingBuffer` resource is registered as
 * external — the buffer object owns its own resize / rebuild
 * lifecycle, so the resource pool only publishes a getter rather
 * than allocating.
 *
 * @group Graph
 */
export class ClusterLightingPass extends RenderGraphPass {
    public readonly name = 'ClusterLightingPass';

    public clusterLightingBuffer!: ClusterLightingBuffer;
    public readonly maxNumLightsPerCluster = 64;
    public readonly clusterPix = 1;

    protected _generateCompute!: ComputeShader;
    protected _lightingCompute!: ComputeShader;
    protected _useCamera: Camera3D | null = null;
    protected _currentLightCount = 0;

    public setup(b: RenderGraphBuilder): void {
        const view = b.view;
        const ctx = b.context3D;
        const numClusters = ClusterConfig.clusterTileX * ClusterConfig.clusterTileY * ClusterConfig.clusterTileZ;
        const size = ctx.presentationSize;
        const camera = view.camera;

        this.clusterLightingBuffer = new ClusterLightingBuffer(numClusters, this.maxNumLightsPerCluster);
        this.clusterLightingBuffer.update(
            size[0], size[1], this.clusterPix,
            ClusterConfig.clusterTileX, ClusterConfig.clusterTileY, ClusterConfig.clusterTileZ,
            0, this.maxNumLightsPerCluster, camera.near, camera.far,
        );

        this._generateCompute = new ComputeShader(ClusterBoundsSource_cs);
        this._generateCompute.setUniformBuffer(`clustersUniform`, this.clusterLightingBuffer.clustersUniformBuffer);
        this._generateCompute.setStorageBuffer(`clusterBuffer`, this.clusterLightingBuffer.clusterBuffer);

        this._lightingCompute = new ComputeShader(ClusterLighting_cs);
        const lightBuffer = GlobalBindGroup.getLightEntries(view.scene);
        this._lightingCompute.setStorageBuffer(`models`, GlobalBindGroup.getModelMatrixBindGroup(ctx).matrixBufferDst);
        this._lightingCompute.setUniformBuffer(`clustersUniform`, this.clusterLightingBuffer.clustersUniformBuffer);
        this._lightingCompute.setStorageBuffer(`clusterBuffer`, this.clusterLightingBuffer.clusterBuffer);
        this._lightingCompute.setStorageBuffer(`lightBuffer`, lightBuffer.storageGPUBuffer);
        this._lightingCompute.setStorageBuffer(`lightAssignBuffer`, this.clusterLightingBuffer.lightAssignBuffer);
        this._lightingCompute.setStorageBuffer(`assignTable`, this.clusterLightingBuffer.assignTableBuffer);

        b.write<ClusterLightingBuffer>(CLUSTER_LIGHTING_BUFFER, () => this.clusterLightingBuffer);
    }

    public execute(ctx: RenderGraphPassContext): void {
        const view = ctx.view;
        const lights: ILight[] = EntityCollect.instance.getLights(view.scene);

        if (this._useCamera !== view.camera) {
            this._useCamera = view.camera;
            const camGroup = GlobalBindGroup.getCameraGroup(view.camera);
            this._generateCompute.setUniformBuffer(`globalUniform`, camGroup.uniformGPUBuffer);
            this._lightingCompute.setUniformBuffer(`globalUniform`, camGroup.uniformGPUBuffer);
        }

        if (this._currentLightCount !== lights.length) {
            this._currentLightCount = lights.length;
            this.clusterLightingBuffer.clustersUniformBuffer.setFloat('numLights', lights.length);
            this.clusterLightingBuffer.clustersUniformBuffer.apply();
            this._generateCompute.workerSizeX = ClusterConfig.clusterTileZ;
            this._lightingCompute.workerSizeX = ClusterConfig.clusterTileZ;
        }

        const size = view.engine3D.context3D.presentationSize;
        this.clusterLightingBuffer.update(
            size[0], size[1], this.clusterPix,
            ClusterConfig.clusterTileX, ClusterConfig.clusterTileY, ClusterConfig.clusterTileZ,
            lights.length, this.maxNumLightsPerCluster,
            view.camera.near, view.camera.far,
        );

        const gpu = view.engine3D.context3D.gpuContext;
        const command = gpu.beginCommandEncoder();
        gpu.computeCommand(command, [this._generateCompute, this._lightingCompute]);
        gpu.endCommandEncoder(command);
    }
}
