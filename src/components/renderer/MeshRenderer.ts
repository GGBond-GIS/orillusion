import { Object3D } from '../../core/entities/Object3D';
import { View3D } from '../../core/View3D';
import { ClusterLightingBuffer } from '../../gfx/renderJob/passRenderer/cluster/ClusterLightingBuffer';
import { GeometryBase } from '../../core/geometry/GeometryBase';
import { GeometryVertexType } from '../../core/geometry/GeometryVertexType';
import { VertexAttributeName } from '../../core/geometry/VertexAttributeName';
import { VertexAttributeData } from '../../core/geometry/VertexAttributeData';
import { RendererMask } from '../../gfx/renderJob/passRenderer/state/RendererMask';
import { RendererPassState } from '../../gfx/renderJob/passRenderer/state/RendererPassState';
import { PassType } from '../../gfx/renderJob/passRenderer/state/PassType';
import { MorphTargetData } from '../anim/morphAnim/MorphTargetData';
import { RenderNode } from './RenderNode';
import { EditorInspector, RegisterComponent } from '../../util/SerializeDecoration';
import { mergeFunctions } from '../../util/Global';
import { Material } from '../../materials/Material';
import { BoundUtil } from '../../util/BoundUtil';
import { Raycaster } from '../../io/Raycaster';
import { RaycastHit } from '../../io/RaycastHit';

/**
 * The mesh renderer component is a component used to render the mesh
 * @group Components
 */
@RegisterComponent(MeshRenderer, 'MeshRenderer')
export class MeshRenderer extends RenderNode {
    /**
     * Enabling this option allows the grid to display any shadows cast on the grid.
     */
    public receiveShadow: boolean;
    public morphData: MorphTargetData;

    constructor() {
        super();
    }

    public onEnable(): void {
        super.onEnable();
    }

    public onDisable(): void {
        super.onDisable();
    }

    public cloneTo(obj: Object3D): void {
        let component = obj.addComponent(MeshRenderer);
        component.copyComponent(this);
    }

    public copyComponent(from: this): this {
        super.copyComponent(from);
        this.receiveShadow = from.receiveShadow;
        return this;
    }

    /**
     * The geometry of the mesh determines its shape
     */
    @EditorInspector
    public get geometry(): GeometryBase {
        return this._geometry;
    }

    public set geometry(value: GeometryBase) {
        //this must use super geometry has reference in super
        super.geometry = value;
        if (value) {
            let isMorphTarget = value.morphTargetDictionary != null;
            if (isMorphTarget) {
                this.morphData ||= new MorphTargetData();
                this.morphData.morphTargetsRelative = value.morphTargetsRelative;
                this.morphData.initMorphTarget(value);
            }
            this.morphData && (this.morphData.enable = isMorphTarget);
            if (this.morphData?.enable) {
                this.addRendererMask(RendererMask.MorphTarget);
            } else {
                this.removeRendererMask(RendererMask.MorphTarget);
            }

            this.object3D.bound = this._geometry.bounds.clone();
        } else {
            if (this.morphData) {
                this.morphData.enable = false;
            }
            this.removeRendererMask(RendererMask.MorphTarget);
        }
        if (!this._readyPipeline) {
            this.initPipeline();

            if (this._computes) {
                this.onCompute = mergeFunctions(this.onCompute, (view: View3D) => {
                    for (let i = 0; i < this._computes.length; i++) {
                        const compute = this._computes[i];
                        compute.onUpdate(view);
                    }
                });
            }
        }
    }

    /**
     * material
     */
    @EditorInspector
    public get material(): Material {
        return this._materials[0];
    }

    public set material(value: Material) {
        this.materials = [value];
    }

    /**
     * Set deformation animation parameters
     */
    public setMorphInfluence(key: string, value: number) {
        if (this.morphData && this.morphData.enable) {
            let index = this._geometry.morphTargetDictionary[key];
            if (index >= 0) {
                this.morphData.updateInfluence(index, value);
            }
        }
    }

    public setMorphInfluenceIndex(index: number, value: number) {
        if (this.morphData && this.morphData.enable) {
            if (index >= 0) {
                this.morphData.updateInfluence(index, value);
            }
        }
    }


    public onCompute(view: View3D, command: GPUCommandEncoder): void {
        if (this.morphData && this.morphData.enable) {
            this.morphData.computeMorphTarget(view, command);
        }
    }

    /**
     * Raycast against the mesh geometry of this renderer, replicating three.js
     * `Mesh.raycast`: the ray is tested against every triangle, every
     * intersection is pushed (sorted later by the {@link Raycaster}), and each
     * result carries `distance`, world-space `point`, `faceIndex` and
     * optionally interpolated `uv` / `uv1`, object-space `normal` and
     * `barycoord`. Backface culling follows the material `cullMode`
     * (`back` = cull back faces, `none` = double sided, `front` = reversed
     * winding + cull), matching three.js `FrontSide` / `DoubleSide` /
     * `BackSide`.
     * @param raycaster the raycaster
     * @param intersects the target array that holds the intersection results
     */
    public raycast(raycaster: Raycaster, intersects: RaycastHit[]) {
        const geometry: GeometryBase = this.geometry;
        const material = this.materials[0];
        if (!this.enable || !geometry || !material) return;
        this._raycastGeometry(this.object3D, geometry, raycaster, intersects);
    }

    /**
     * Shared triangle-level raycast against an arbitrary object/geometry
     * pair. MeshRenderer uses it with its own object3D/geometry; GPU
     * instanced renderers (e.g. Graphic3DMeshRenderer) reuse it per
     * instance, whose world matrices live on child Object3Ds while the
     * rendered geometry is a merged copy of a source geometry.
     * @internal
     */
    public _raycastGeometry(object: Object3D, geometry: GeometryBase, raycaster: Raycaster, intersects: RaycastHit[]) {
        const material = this.materials[0];
        if (!material) return;
        const worldMatrix = object.transform.worldMatrix;

        // Pre-cull with the world-space bounding box. The world bound is
        // transformed fresh from the local bounds every time (entity.bound is
        // only invalidated by the entity's own transform change, so a moved
        // parent would leave it stale).
        BoundUtil.transformBound(worldMatrix, geometry.bounds, Raycaster._boundWorld);
        if (raycaster.ray.intersectBox(Raycaster._boundWorld, Raycaster._point) === null) return;

        // Convert the ray to the local space of the object
        Raycaster._matrix.copy(worldMatrix).invert();
        Raycaster._localRay.copy(raycaster.ray).applyMatrix(Raycaster._matrix);
        // applyMatrix does not normalize the direction (non-uniform scale), the
        // watertight intersection needs a unit direction for correct distances
        Raycaster._localRay.direction.normalize();

        // Pre-cull with the local-space bounding box
        if (Raycaster._localRay.intersectBox(geometry.bounds, Raycaster._point) === null) return;

        // Position data: 'all' (interleaved) for compose_bin geometry, otherwise the 'position' attribute
        let positionData;
        let positionStride: number;
        if (geometry.geometryType == GeometryVertexType.compose_bin) {
            positionData = geometry.getAttribute(VertexAttributeName.all).data;
            positionStride = geometry.vertexDim;
        } else {
            positionData = geometry.getAttribute(VertexAttributeName.position).data;
            positionStride = 3;
        }
        if (!positionData) return;

        const uvAttr: VertexAttributeData = geometry.getAttribute(VertexAttributeName.uv);
        const uv1Attr: VertexAttributeData = geometry.getAttribute(VertexAttributeName.TEXCOORD_1);
        const normalAttr: VertexAttributeData = geometry.getAttribute(VertexAttributeName.normal);

        // Backface culling follows the material cullMode, replicating three.js
        // FrontSide / DoubleSide / BackSide
        let backfaceCulling: boolean = true;
        let reversed: boolean = false;
        if (material.cullMode == 'none') {
            backfaceCulling = false;
        } else if (material.cullMode == 'front') {
            reversed = true;
        }

        const indexAttr = geometry.getAttribute(VertexAttributeName.indices);
        if (indexAttr && indexAttr.data.length > 0) {
            // indexed geometry
            const indexData = indexAttr.data;
            for (let i = 0, count = indexData.length / 3; i < count; i++) {
                const a = indexData[i * 3];
                const b = indexData[i * 3 + 1];
                const c = indexData[i * 3 + 2];
                let hit = Raycaster._checkTriangle(raycaster, object, a, b, c, positionData, positionStride, uvAttr, uv1Attr, normalAttr, backfaceCulling, reversed);
                if (hit) {
                    hit.faceIndex = i;
                    intersects.push(hit);
                }
            }
        } else {
            // non-indexed geometry
            const count = positionData.length / positionStride;
            for (let i = 0; i < count; i += 3) {
                let hit = Raycaster._checkTriangle(raycaster, object, i, i + 1, i + 2, positionData, positionStride, uvAttr, uv1Attr, normalAttr, backfaceCulling, reversed);
                if (hit) {
                    hit.faceIndex = Math.floor(i / 3);
                    intersects.push(hit);
                }
            }
        }
    }

    /**
     * @internal
     * @param passType
     * @param renderPassState
     * @param scene3D
     * @param clusterLightingRender
     * @param probes
     */
    public nodeUpdate(view: View3D, passType: PassType, renderPassState: RendererPassState, clusterLightingBuffer: ClusterLightingBuffer) {
        if (this.morphData && this.morphData.enable) {
            for (let i = 0; i < this.materials.length; i++) {
                const material = this.materials[i];
                let passes = material.getPass(passType);
                if (passes) {
                    for (let j = 0; j < passes.length; j++) {
                        this.morphData.applyRenderShader(passes[j]);
                    }
                }
            }
        }
        super.nodeUpdate(view, passType, renderPassState, clusterLightingBuffer);
    }

    public destroy(force?: boolean): void {
        super.destroy(force);
    }

    // public onGraphic(view?: View3D) {
    //     let graphic3D = view.scene.getChildByName('graphic3D')
    //     if(!graphic3D)
    //         return
    //     if (this._geometry)
    //         graphic3D.drawMeshWireframe(this._geometry.instanceID, this._geometry, this.transform, Color.COLOR_RED);
    // }
}
