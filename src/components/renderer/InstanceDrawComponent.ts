import { RTResourceMap } from "../../gfx/renderJob/frame/RTResourceMap";
import { RenderContext } from "../../gfx/renderJob/passRenderer/RenderContext";
import { MeshRenderer } from "./MeshRenderer";
import { RenderNode } from "./RenderNode";
import { StorageGPUBuffer } from "../../gfx/graphics/webGpu/core/buffer/StorageGPUBuffer";
import { View3D } from "../../core/View3D";
import { RendererPassState } from "../../gfx/renderJob/passRenderer/state/RendererPassState";
import { PassType } from "../../gfx/renderJob/passRenderer/state/PassType";
import { ClusterLightingBuffer } from "../../gfx/renderJob/passRenderer/cluster/ClusterLightingBuffer";
import { ComponentCollect } from "../../gfx/renderJob/collect/ComponentCollect";

/**
 * Batches child {@link MeshRenderer}s that share the same geometry and
 * materials into GPU instanced draw calls. On start it groups the renderers
 * by a geometry+material key, uploads their world-matrix indices into a
 * storage buffer, and issues one instanced draw per group.
 * @group Components
 */
export class InstanceDrawComponent extends RenderNode {

    private _keyRenderGroup: Map<string, MeshRenderer[]>;
    private _keyBufferGroup: Map<string, StorageGPUBuffer>;
    private _keyIdsGroup: Map<string, number[]>;

    constructor() {
        super();
    }

    /** Initialize the internal grouping maps. */
    public init(param?: any): void {
        this._keyRenderGroup = new Map<string, MeshRenderer[]>();
        this._keyBufferGroup = new Map<string, StorageGPUBuffer>();
        this._keyIdsGroup = new Map<string, number[]>();
    }

    /**
     * Collect child mesh renderers, group them by geometry+material key,
     * disable their individual rendering, and upload per-instance matrix
     * index buffers.
     */
    public start(): void {

        let meshRenders: MeshRenderer[] = [];
        this.object3D.getComponents(MeshRenderer, meshRenders, true);

        // let idArray = new Int32Array(meshRenders.length);
        for (let i = 0; i < meshRenders.length; i++) {
            const mr = meshRenders[i];
            mr.transform.updateWorldMatrix(true);
            mr.enable = false;


            let key = mr.geometry.instanceID;
            for (let j = 0; j < mr.materials.length; j++) {
                const mat = mr.materials[j];
                key += mat.instanceID;
            }

            if (!this._keyRenderGroup.has(key)) {
                let matrixBuffer = new StorageGPUBuffer(meshRenders.length);
                matrixBuffer.visibility = GPUShaderStage.VERTEX;
                this._keyRenderGroup.set(key, [mr]);
                this._keyBufferGroup.set(key, matrixBuffer);
                this._keyIdsGroup.set(key, [mr.transform.worldMatrix.index]);
            } else {
                this._keyRenderGroup.get(key).push(mr);
                this._keyIdsGroup.get(key).push(mr.transform.worldMatrix.index);
            }
        }

        this._keyBufferGroup.forEach((v, k) => {
            let ids = this._keyIdsGroup.get(k);
            let instanceMatrixBuffer = this._keyBufferGroup.get(k);
            instanceMatrixBuffer.setInt32Array("matrixIDs", new Int32Array(ids));
            instanceMatrixBuffer.apply();
        })
    }

    /** Clear the current grouping and rebuild it from the child renderers. */
    public reset(){
        if(this._keyRenderGroup.size > 0){
            this._keyRenderGroup.clear()
            this._keyBufferGroup.clear()
            this._keyIdsGroup.clear()
            this.start()
        }
    }
    /**
     * Per-pass update: enables the USE_INSTANCEDRAW shader define and binds
     * the per-group instance matrix buffer for each material pass.
     */
    public nodeUpdate(view: View3D, passType: PassType, renderPassState: RendererPassState, clusterLightingBuffer?: ClusterLightingBuffer): void {
        this._keyRenderGroup.forEach((v, k) => {
            let instanceMatrixBuffer = this._keyBufferGroup.get(k);
            let renderNode = v[0];
            for (let i = 0; i < renderNode.materials.length; i++) {
                let material = renderNode.materials[i];
                let passes = material.getPass(passType);
                if (passes) {
                    for (let i = 0; i < passes.length; i++) {
                        const renderShader = passes[i];
                        renderShader.setDefine("USE_INSTANCEDRAW", true);
                        renderShader.setStorageBuffer(`instanceDrawID`, instanceMatrixBuffer);
                    }
                }
            }
            renderNode.nodeUpdate(view, passType, renderPassState, clusterLightingBuffer);
        })
    }


    /**
     * Encoder-direct instanced draw for the modern frame-graph pipeline.
     *
     * `drawNodesEncoder` (the main ColorPass draw path) calls `renderPass2`,
     * not the legacy `renderPass`. The base `RenderNode.renderPass2`
     * early-returns on `!_geometry`, and this component owns no geometry of
     * its own — so without this override the whole group is invisible (its
     * child MeshRenderers were already disabled in `start()`). Here we issue
     * one instanced draw per geometry+material group using the group's
     * representative node, mirroring the legacy `renderItem` logic but
     * writing straight to the pass encoder.
     */
    public renderPass2(view: View3D, passType: PassType, rendererPassState: RendererPassState, clusterLightingBuffer: ClusterLightingBuffer, encoder: GPURenderPassEncoder, useBundle: boolean = false) {
        if (!this.enable)
            return;

        const gpu = view.engine3D.context3D.gpuContext;
        this._keyRenderGroup.forEach((v) => {
            let renderNode = v[0];
            renderNode.instanceCount = v.length;

            let geometry = renderNode.geometry;
            let subGeometries = geometry.subGeometries;
            // Iterate by max(materials, subGeometries) to mirror the base
            // renderPass2 — single-material meshes with multiple subGeometries
            // still draw every sub-mesh.
            const nCount = Math.max(renderNode.materials.length, subGeometries.length);
            for (let i = 0; i < nCount; i++) {
                const material = i >= renderNode.materials.length ? renderNode.materials[0] : renderNode.materials[i];
                if (!material.castShadow && passType == PassType.SHADOW)
                    continue;

                let passes = material.getPass(passType);
                if (!passes || passes.length == 0)
                    continue;

                gpu.bindGeometryBuffer(encoder, geometry);
                for (let j = 0; j < passes.length; j++) {
                    const renderShader = passes[j];
                    if (!renderShader.pipeline)
                        continue;
                    gpu.bindPipeline(encoder, renderShader);
                    const subGeometry = i >= subGeometries.length ? subGeometries[0] : subGeometries[i];
                    let lodInfo = subGeometry.lodLevels[renderNode.lodLevel];
                    // firstInstance = 0 so @builtin(instance_index) runs
                    // 0..count-1 and indexes instanceDrawID.matrixIDs directly.
                    gpu.drawIndexed(encoder, lodInfo.indexCount, renderNode.instanceCount, lodInfo.indexStart, 0, 0);
                }
            }
        })
    }


    /** Issue one instanced draw per group, with instance count = group size. */
    public renderPass(view: View3D, passType: PassType, renderContext: RenderContext) {
        this._keyRenderGroup.forEach((v, k) => {
            let renderNode = v[0];
            renderNode.instanceCount = v.length;
            this.renderItem(view, passType, renderNode, renderContext);
        })
    }

    /** Bind geometry/pipeline and emit the indexed (optionally instanced) draw for a render node. */
    public renderItem(view: View3D, passType: PassType, renderNode: RenderNode, renderContext: RenderContext) {
        const gpu = view.engine3D.context3D.gpuContext;
        let worldMatrix = renderNode.transform._worldMatrix;

        for (let i = 0; i < renderNode.materials.length; i++) {
            const material = renderNode.materials[i];
            let passes = material.getPass(passType);

            if (!passes || passes.length == 0)
                continue;

            for (let j = 0; j < passes.length; j++) {
                let matPass = passes[j];

                gpu.bindGeometryBuffer(renderContext.encoder, renderNode.geometry);
                const renderShader = matPass;
                if (renderShader.shaderState.splitTexture) {
                    renderContext.endRenderPass();
                    RTResourceMap.WriteSplitColorTexture(view.engine3D.context3D, renderNode.instanceID);
                    renderContext.beginOpaqueRenderPass();

                    gpu.bindCamera(renderContext.encoder, view.camera);
                    gpu.bindGeometryBuffer(renderContext.encoder, renderNode.geometry);
                }
                gpu.bindPipeline(renderContext.encoder, renderShader);
                let subGeometries = renderNode.geometry.subGeometries;

                const subGeometry = subGeometries[i];
                let lodInfos = subGeometry.lodLevels;
                let lodInfo = lodInfos[renderNode.lodLevel];

                if (renderNode.instanceCount > 0) {
                    gpu.drawIndexed(renderContext.encoder, lodInfo.indexCount, renderNode.instanceCount, lodInfo.indexStart, 0, 0);
                } else {
                    gpu.drawIndexed(renderContext.encoder, lodInfo.indexCount, 1, lodInfo.indexStart, 0, worldMatrix.index);
                }
            }
        }
    }

    /** Release the grouping maps and unregister from pending-start collection. */
    public beforeDestroy(force?: boolean): void {
        this._keyRenderGroup.clear();
        this._keyBufferGroup.clear();
        this._keyIdsGroup.clear();
        //@ts-ignore
        this._keyRenderGroup = this._keyBufferGroup = this._keyIdsGroup = undefined;
        ComponentCollect.removeWaitStart(this.object3D, this);
    }
}
