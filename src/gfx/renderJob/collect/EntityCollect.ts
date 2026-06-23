
import { ILight } from '../../../components/lights/ILight';
import { Reflection } from '../../../components/renderer/Reflection';
import { RenderNode } from '../../../components/renderer/RenderNode';
import type { SceneCaptureCameraComponent } from '../../../components/SceneCaptureCameraComponent';
import { Camera3D } from '../../../core/Camera3D';
import { Scene3D } from '../../../core/Scene3D';
import { View3D } from '../../../core/View3D';
import { BoundingBox } from '../../../core/bound/BoundingBox';
import { GeometryBase } from '../../../core/geometry/GeometryBase';
import { Octree } from '../../../core/tree/octree/Octree';
import { Vector3 } from '../../../math/Vector3';
import { Time } from '../../../util/Time';
import { zSorterUtil } from '../../../util/ZSorterUtil';
import { BatchModeUtil, BatchMode } from '../config/BatchMode';
import { VisibleLayer } from '../config/VisibleLayer';
import { Probe } from '../passRenderer/ddgi/Probe';
// import { Graphic3DBatchRenderer } from '../passRenderer/graphic/Graphic3DBatchRenderer';
import { RendererMask } from '../passRenderer/state/RendererMask';
import { CollectInfo } from './CollectInfo';
import { EntityBatchCollect } from './EntityBatchCollect';
import { RenderShaderCollect } from './RenderShaderCollect';

/**
 * @internal
 */
export class EntityCollect {
    private static _instance: EntityCollect;

    // private static  _sceneRenderList: Map<Scene3D, RenderNode[]>;
    private _sceneLights: Map<Scene3D, ILight[]>;
    private _sceneGIProbes: Map<Scene3D, Probe[]>;

    private _op_RenderNodes: Map<Scene3D, RenderNode[]>;
    private _tr_RenderNodes: Map<Scene3D, RenderNode[]>;
    private _octreeRenderNodes: Map<Scene3D, Octree>;
    private _reflections: Map<Scene3D, Reflection[]>;
    private _sceneCaptureCameras: Map<Scene3D, SceneCaptureCameraComponent[]> = new Map();

    private _graphics: RenderNode[];

    private _op_renderGroup: Map<Scene3D, EntityBatchCollect>;
    private _tr_renderGroup: Map<Scene3D, EntityBatchCollect>;

    private _renderShaderCollect: RenderShaderCollect;

    public state: {
        /**
         * gi effect lighting change
         */
        giLightingChange: boolean
    } = {
            giLightingChange: true
        }

    /**
     * Per-scene sky renderer. Each scene (i.e. each Engine3D instance)
     * has at most one active sky. Indexing by scene avoids cross-device
     * resource leaks when multiple engines run simultaneously.
     */
    private _skyMap: Map<Scene3D, RenderNode> = new Map<Scene3D, RenderNode>();

    public getSky(scene: Scene3D): RenderNode | undefined {
        return scene ? this._skyMap.get(scene) : undefined;
    }

    public setSky(scene: Scene3D, node: RenderNode | null): void {
        if (!scene) return;
        if (node) this._skyMap.set(scene, node);
        else this._skyMap.delete(scene);
    }

    private _collectInfo: CollectInfo;

    private rendererOctree: Octree;
    public static get instance() {
        if (!this._instance) {
            this._instance = new EntityCollect();
        }
        return this._instance;
    }

    constructor() {
        // this._sceneRenderList = new Map<Scene3D, RenderNode[]>();
        this._sceneLights = new Map<Scene3D, ILight[]>();
        this._sceneGIProbes = new Map<Scene3D, Probe[]>();

        this._op_RenderNodes = new Map<Scene3D, RenderNode[]>();
        this._tr_RenderNodes = new Map<Scene3D, RenderNode[]>();
        this._reflections = new Map<Scene3D, Reflection[]>();

        this._graphics = [];

        this._op_renderGroup = new Map<Scene3D, EntityBatchCollect>();
        this._tr_renderGroup = new Map<Scene3D, EntityBatchCollect>();

        this._collectInfo = new CollectInfo();
        this._renderShaderCollect = new RenderShaderCollect();
        this._octreeRenderNodes = new Map<Scene3D, Octree>();
    }

    private getPashList(root: Scene3D, renderNode: RenderNode) {
        if (renderNode.renderOrder < 3000) {
            return this._op_RenderNodes.get(root);
        } else if (renderNode.renderOrder >= 3000) {
            return this._tr_RenderNodes.get(root);
        }
    }

    private sortRenderNode(list: RenderNode[], renderNode: RenderNode) {
        for (let i = list.length - 1; i > 0; i--) {
            const element = list[i];
            if (element.renderOrder < renderNode.renderOrder) {
                list.push(renderNode);
                return;
            }
        }
        list.push(renderNode);
    }

    public addRenderNode(root: Scene3D, renderNode: RenderNode) {
        if (!root) return;
        let isTransparent: boolean = renderNode.renderOrder >= 3000;
        if (renderNode.hasMask(RendererMask.Sky)) {
            this.setSky(root, renderNode);
        } else if (renderNode.hasMask(RendererMask.Reflection)) {
            this.removeRenderNode(root, renderNode);
            let maps = this._reflections.get(root);
            if (!maps) {
                maps = [];
                this._reflections.set(root, maps);
                maps.push(renderNode as Reflection);
            }
            if (!maps.includes(renderNode as Reflection)) {
                maps.push(renderNode as Reflection);
            }
        } else if (renderNode.hasMask(RendererMask.Graphic3D)) {
            if (this._graphics.indexOf(renderNode) == -1) {
                this._graphics.push(renderNode);
            }
        } else if (!BatchModeUtil.hasMask(renderNode.batchMode, BatchMode.None)) {
            this.removeRenderNode(root, renderNode);
            let group = isTransparent ? this._tr_renderGroup : this._op_renderGroup;
            if (!group.has(root)) {
                group.set(root, new EntityBatchCollect());
            }
            group.get(root).collect_add(renderNode);
        } else {
            this.removeRenderNode(root, renderNode);
            let map = isTransparent ? this._tr_RenderNodes : this._op_RenderNodes;
            if (!map.has(root)) {
                map.set(root, []);
            }
            map.get(root).push(renderNode);

            if (root.view?.engine3D?.setting.occlusionQuery.octree) {
                renderNode.attachSceneOctree(this.getOctree(root));
            }

            let list = this.getPashList(root, renderNode);
            let index = list.indexOf(renderNode);
            if (index == -1) {
                this.sortRenderNode(list, renderNode);
            }
        }
        renderNode.object3D.renderNode = renderNode;

        this._renderShaderCollect.collect_add(renderNode);
    }

    private getOctree(root: Scene3D) {
        let octree: Octree;
        let setting = root.view?.engine3D?.setting.occlusionQuery.octree;
        if (setting) {
            octree = this._octreeRenderNodes.get(root);
            if (!octree) {
                let center = new Vector3(setting.x, setting.y, setting.z);
                let size = new Vector3(setting.width, setting.height, setting.depth);
                let bound = new BoundingBox(center, size);
                octree = new Octree(bound);
                this._octreeRenderNodes.set(root, octree);
            }
        }
        return octree;
    }

    public removeRenderNode(root: Scene3D, renderNode: RenderNode) {
        renderNode.detachSceneOctree();
        if (renderNode.hasMask(RendererMask.Sky)) {
            this.setSky(root, null);
        } else if (renderNode.hasMask(RendererMask.Reflection)) {
            let maps = this._reflections.get(root);
            if (maps) {
                let index = maps.indexOf(renderNode as Reflection);
                if (index != -1) {
                    maps.splice(index, 1);
                }
            }
        } else if (!BatchModeUtil.hasMask(renderNode.batchMode, BatchMode.None)) {

        } else {
            // Search BOTH opaque and transparent lists, not the one
            // matching `renderNode.renderOrder`. When a material's
            // alphaMode toggles live (e.g. BLEND ↔ HASH ↔ OPAQUE),
            // pass.renderOrder flips from 3000 to 0 (or back), but
            // the renderer is still sitting in the OLD list. If we
            // only look in the list matching the NEW renderOrder we
            // find nothing and silently leave the renderer in the
            // wrong bucket — it gets rendered through both pipelines
            // (the stale OIT/sorted-transparent path for the old
            // bucket, plus the new opaque path), producing a
            // ghosted "previous render is still showing" visual.
            const opList = this._op_RenderNodes.get(root);
            if (opList) {
                const opIdx = opList.indexOf(renderNode);
                if (opIdx !== -1) opList.splice(opIdx, 1);
            }
            const trList = this._tr_RenderNodes.get(root);
            if (trList) {
                const trIdx = trList.indexOf(renderNode);
                if (trIdx !== -1) trList.splice(trIdx, 1);
            }
        }

        this._renderShaderCollect.collect_remove(renderNode);
    }

    public addLight(root: Scene3D, light: ILight) {
        if (!this._sceneLights.has(root)) {
            this._sceneLights.set(root, [light]);
        } else {
            let lights = this._sceneLights.get(root)
            let maxLight = root.view?.engine3D?.setting.light.maxLight;
            if (maxLight != null && lights.length >= maxLight) {
                console.warn('Alreay meet maxmium light number:', maxLight)
                return
            }
            let hasLight = lights.indexOf(light) != -1;
            if (!hasLight) {
                lights.push(light);
            }
        }
    }

    public removeLight(root: Scene3D, light: ILight) {
        if (this._sceneLights.has(root)) {
            let list = this._sceneLights.get(root);
            let index = list.indexOf(light);
            if (index != -1) {
                list.splice(index, 1);
            }
        }
    }
    public getLights(root: Scene3D): ILight[] {
        let list = this._sceneLights.get(root);
        return list ? list : [];
    }

    public addGIProbe(root: Scene3D, probe: Probe) {
        if (!this._sceneGIProbes.has(root)) {
            this._sceneGIProbes.set(root, [probe]);
        } else {
            this._sceneGIProbes.get(root).push(probe);
        }
    }

    public removeGIProbe(root: Scene3D, probe: Probe) {
        if (this._sceneGIProbes.has(root)) {
            let list = this._sceneGIProbes.get(root);
            let index = list.indexOf(probe);
            if (index != -1) {
                list.splice(index, 1);
            }
        }
    }

    public getProbes(root: Scene3D) {
        let list = this._sceneGIProbes.get(root);
        return list ? list : [];
    }

    public getReflections(root: Scene3D) {
        let list = this._reflections.get(root);
        return list ? list : [];
    }

    /**
     * Register a {@link SceneCaptureCameraComponent} into the per-scene
     * index. Idempotent — re-registering an already-tracked component
     * is a no-op so component lifecycle ping-pong (disable → enable on
     * the same frame) doesn't grow the list. Called from the
     * component's `onEnable`.
     */
    public addSceneCaptureCamera(scene: Scene3D, cap: SceneCaptureCameraComponent): void {
        if (!scene || !cap) return;
        let list = this._sceneCaptureCameras.get(scene);
        if (!list) {
            list = [];
            this._sceneCaptureCameras.set(scene, list);
        }
        if (list.indexOf(cap) === -1) list.push(cap);
    }

    /** Remove a capture component from the per-scene index. Called
     *  from the component's `onDisable`. */
    public removeSceneCaptureCamera(scene: Scene3D, cap: SceneCaptureCameraComponent): void {
        if (!scene || !cap) return;
        const list = this._sceneCaptureCameras.get(scene);
        if (!list) return;
        const idx = list.indexOf(cap);
        if (idx !== -1) list.splice(idx, 1);
    }

    /** Active capture cameras for a scene; SceneCapturePass iterates
     *  this list each frame. Returns an empty array when none are
     *  registered. */
    public getSceneCaptureCameras(scene: Scene3D): SceneCaptureCameraComponent[] {
        return this._sceneCaptureCameras.get(scene) ?? [];
    }

    // sort renderers by renderOrder and camera depth
    public autoSortRenderNodes(scene: Scene3D): this {
        let renderList: RenderNode[] = this._tr_RenderNodes.get(scene);
        if (!renderList)
            return;

        let needSort = false;
        let allWeighted = true;
        for (const renderNode of renderList) {
            if (renderNode.isRenderOrderChange || renderNode.needSortOnCameraZ) {
                needSort = true;
            }
            // WBOIT (oitMode='weighted') is order-independent — its
            // accum / reveal accumulation commutes. If every transparent
            // node opts in, we can skip the per-frame sort entirely
            // and let the hardware blend deal with it. Saves the
            // O(N log N) JS sort on dense particle / glass scenes.
            const mat = renderNode.materials?.[0];
            if (!mat || mat.oitMode !== 'weighted') {
                allWeighted = false;
            }
            // Bail early on the first dirty + non-weighted node — both
            // conditions answered, no need to keep scanning.
            if (needSort && !allWeighted) break;
        }

        const view = scene.view;
        const useOIT = !!(view?.engine3D?.setting.render as any)?.useOIT;
        if (allWeighted && useOIT && renderList.length > 0) {
            // All transparents go through WBOIT and OIT is enabled —
            // the GPU compositor doesn't care about order. Reset dirty
            // flags so the next frame doesn't re-detect "needs sort".
            for (const renderNode of renderList) {
                renderNode.isRenderOrderChange = false;
            }
            return this;
        }

        if (needSort) {
            for (const renderNode of renderList) {
                let __renderOrder = renderNode.renderOrder;
                if (renderNode.needSortOnCameraZ) {
                    let cameraDepth = zSorterUtil.worldToCameraDepth(renderNode.object3D);
                    cameraDepth = 1 - Math.max(0, Math.min(1, cameraDepth));//clamp to [0, 1]
                    __renderOrder += cameraDepth;
                }
                renderNode['__renderOrder'] = __renderOrder;
                //resume unchange status
                renderNode.isRenderOrderChange = false;
            }
            renderList.sort((a: RenderNode, b: RenderNode) => {
                return a['__renderOrder'] > b['__renderOrder'] ? 1 : -1;
            });
        }
        return this;
    }


    public getRenderNodes(scene: Scene3D, camera: Camera3D): CollectInfo {
        this.autoSortRenderNodes(scene);
        this._collectInfo.clean();
        this._collectInfo.sky = this.getSky(scene);

        if (scene.view?.engine3D?.setting.occlusionQuery.octree) {
            this.rendererOctree = this.getOctree(scene);
            this.rendererOctree.getRenderNode(camera.frustum, this._collectInfo);
        } else {
            let list2 = this._op_RenderNodes.get(scene);
            if (list2) {
                this._collectInfo.opaqueList = list2.concat();
            }
            let list5 = this._tr_RenderNodes.get(scene);
            if (list5) {
                this._collectInfo.transparentList = list5.concat();
            }
        }
        return this._collectInfo;
    }

    /**
     * Layer-aware variant of {@link getRenderNodes}. Returns freshly
     * built opaque + transparent arrays whose nodes pass the bitwise
     * AND test:
     *
     *     (node.visibleLayer & layerMask & cullingMask) !== 0
     *
     * Internally delegates the heavy lifting to {@link getRenderNodes}
     * so octree frustum culling, transparent z-sort, and the WBOIT
     * fast-path all stay shared with the legacy code path. The
     * filtering step is a single linear scan over the (already
     * frustum-culled) lists.
     *
     * When `(layerMask & cullingMask) === VisibleLayer.All`, the result
     * arrays are populated from the same scan rather than aliased to
     * the singleton's lists — callers can safely mutate / store the
     * returned arrays without affecting subsequent calls.
     *
     * @param scene       Scene to draw from.
     * @param camera      Active camera (required for octree frustum
     *                    culling on octree-enabled scenes).
     * @param layerMask   Pass-side layer mask, e.g. from
     *                    {@link RenderGraphPass.layerMask}.
     * @param cullingMask Camera-side culling mask, defaults to
     *                    {@link VisibleLayer.All}.
     */
    public getLayerLists(
        scene: Scene3D,
        camera: Camera3D,
        layerMask: number,
        cullingMask: number = VisibleLayer.All,
    ): { opaque: RenderNode[]; transparent: RenderNode[] } {
        const mask = (layerMask & cullingMask) >>> 0;
        if (mask === 0) {
            // Empty intersection — pass either consumes no layers or
            // camera sees no layers. Bail without invoking the
            // heavyweight collect path.
            return { opaque: [], transparent: [] };
        }
        const info = this.getRenderNodes(scene, camera);
        const opIn = info.opaqueList;
        const trIn = info.transparentList;
        const opOut: RenderNode[] = [];
        for (let i = 0, n = opIn.length; i < n; i++) {
            const node = opIn[i];
            if (EntityCollect.matchesLayer(node.visibleLayer, mask, VisibleLayer.All)) opOut.push(node);
        }
        const trOut: RenderNode[] = [];
        for (let i = 0, n = trIn.length; i < n; i++) {
            const node = trIn[i];
            if (EntityCollect.matchesLayer(node.visibleLayer, mask, VisibleLayer.All)) trOut.push(node);
        }
        return { opaque: opOut, transparent: trOut };
    }

    /**
     * Layer-visibility predicate shared by every pass / collector that
     * filters renderables by composition layer. Returns true when
     * `layer`, `layerMask`, and `cullingMask` share at least one set
     * bit — i.e. the renderable is opted into a layer that both the
     * pass and the camera want to see.
     *
     * Centralising the bitwise idiom here keeps the semantics
     * consistent between {@link EntityCollect.getLayerLists} (RenderNode
     * path) and {@link ComponentCollect.collectByTypeLayered}
     * (ComponentBase path); callers should not re-implement the
     * `(a & b & c) !== 0` test by hand.
     *
     * @param layer       The renderable's own layer membership value
     *                    (e.g. `RenderNode.visibleLayer`).
     * @param layerMask   Pass-side mask (e.g. {@link RenderGraphPass.layerMask}).
     * @param cullingMask Camera-side mask (e.g. {@link Camera3D.cullingMask}).
     *                    Pass {@link VisibleLayer.All} when the caller has
     *                    already AND-ed the camera mask into `layerMask`.
     */
    public static matchesLayer(layer: number, layerMask: number, cullingMask: number = VisibleLayer.All): boolean {
        return ((layer | 0) & (layerMask & cullingMask)) !== 0;
    }

    public getOpRenderGroup(scene: Scene3D): EntityBatchCollect {
        return this._op_renderGroup.get(scene);
    }

    public getTrRenderGroup(scene: Scene3D): EntityBatchCollect {
        return this._tr_renderGroup.get(scene);
    }

    public getGraphicList(): RenderNode[] {
        return this._graphics;
    }

    public getRenderShaderCollect(view: View3D) {
        let viewList = this._renderShaderCollect.renderShaderUpdateList.get(view);
        return viewList;
    }

    // Engine3D.dispose() calls this so the singleton's scene-keyed maps
    // don't accumulate one entry per disposed engine. Each entry pins a
    // Scene3D plus its render-node / light / probe / sky arrays.
    public removeScene(scene: Scene3D) {
        this._sceneLights?.delete(scene);
        this._sceneGIProbes?.delete(scene);
        this._op_RenderNodes?.delete(scene);
        this._tr_RenderNodes?.delete(scene);
        this._octreeRenderNodes?.delete(scene);
        this._reflections?.delete(scene);
        this._sceneCaptureCameras?.delete(scene);
        this._op_renderGroup?.delete(scene);
        this._tr_renderGroup?.delete(scene);
        this._skyMap?.delete(scene);
    }

    // Engine3D.dispose() also calls this — `_renderShaderCollect` is keyed by
    // View3D (not Scene3D) so removeScene() above can't reach it, and a stale
    // view-keyed entry here pins the view's camera, scene graph, and every
    // RenderNode that was ever enqueued for this view.
    public removeView(view: View3D) {
        this._renderShaderCollect?.removeView(view);
    }
}
