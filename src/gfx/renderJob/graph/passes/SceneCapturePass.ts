import { SceneCaptureCameraComponent } from '../../../../components/SceneCaptureCameraComponent';
import { RenderNode } from '../../../../components/renderer/RenderNode';
import { Camera3D } from '../../../../core/Camera3D';
import { View3D } from '../../../../core/View3D';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { EntityCollect } from '../../collect/EntityCollect';
import { OcclusionSystem } from '../../occlusion/OcclusionSystem';
import { ClusterLightingBuffer } from '../../passRenderer/cluster/ClusterLightingBuffer';
import { RenderContext } from '../../passRenderer/RenderContext';
import { PassType } from '../../passRenderer/state/PassType';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { ClusterLightingPass } from './ClusterLightingPass';
import { POINT_SHADOW_CUBE_ARRAY } from './PointShadowPass';
import { MAIN_SHADOW_MAP } from './ShadowPass';
import { dependOnIfRegistered, preInitPassPipelines } from './_helpers';

/**
 * Renders every scene-registered {@link SceneCaptureCameraComponent}
 * into its own render texture so other materials can sample the
 * captured scene. Mirrors, security-camera screens, portals, and
 * picture-in-picture mini-maps all sit on top of this pass.
 *
 * Ordering
 * --------
 *
 * Runs after {@link ShadowPass} + {@link PointShadowPass} +
 * {@link ReflectionPass} (so captures include directional + point
 * shadows and the pre-filtered reflection cube), and before
 * {@link ColorPass} (so captured textures are ready when main-pass
 * materials sample them in the same frame). Shadow ordering is
 * pinned by the `b.read` calls below; the ColorPass ordering is
 * pinned by an explicit `b.dependsOn('SceneCapturePass')` in
 * ColorPass.setup since this pass writes no graph-pool handle.
 *
 * Reads
 * -----
 *
 * Declares read dependencies on {@link MAIN_SHADOW_MAP} and
 * {@link POINT_SHADOW_CUBE_ARRAY} so the validator orders this
 * pass after the shadow producers. The capture's lit shaders
 * sample those textures via {@link GlobalBindGroup}, the same
 * way the main color pass does.
 *
 * Writes
 * ------
 *
 * Does NOT publish a single graph-pool handle. Each
 * {@link SceneCaptureCameraComponent} owns its own RT (lazily
 * allocated through GBufferFrame), and consumer materials bind
 * those RTs directly via the component's
 * {@link SceneCaptureCameraComponent.getCaptureTexture}. This
 * matches the use case (one RT per off-screen camera, possibly
 * many cameras) and avoids a name-collision when more than one
 * capture exists.
 *
 * Mask filtering
 * --------------
 *
 * Per-component {@link SceneCaptureCameraComponent.captureMask}
 * (allowlist) and {@link SceneCaptureCameraComponent.excludeMask}
 * (denylist) are tested against each renderer's `rendererMask`
 * before drawing. The default masks include every renderer.
 *
 * @group Graph
 */
export class SceneCapturePass extends RenderGraphPass {
    public readonly name = 'SceneCapturePass';
    public readonly materialPasses: readonly PassType[] = [PassType.COLOR];

    protected readonly _passType: PassType = PassType.COLOR;

    public setup(b: RenderGraphBuilder): void {
        // Reading shadow handles forces this pass to run after the
        // shadow producers, even though the captured shaders pick up
        // the textures via GlobalBindGroup rather than ctx.get(...).
        // The validator only checks declared deps, so the read calls
        // are how we tell the topo-sort "we need shadows first".
        b.read(MAIN_SHADOW_MAP);
        b.read(POINT_SHADOW_CUBE_ARRAY);

        dependOnIfRegistered(b, 'GPUCullPass');
    }

    public execute(ctx: RenderGraphPassContext): void {
        const view = ctx.view;
        const scene = view.scene;
        if (!scene) return;
        const captures = EntityCollect.instance.getSceneCaptureCameras(scene);
        if (!captures || captures.length === 0) return;

        const cluster = view.renderGraph?.getPass<ClusterLightingPass>('ClusterLightingPass')?.clusterLightingBuffer;

        for (const cap of captures) {
            if (!cap.enable) continue;
            if (cap.updateMode === 'manual' && !cap.needUpdate) continue;
            const camera = cap.camera;
            if (!camera) continue;
            this._renderOne(view, cap, camera, ctx.occlusion, cluster);
            if (cap.updateMode === 'manual') cap.needUpdate = false;
        }

        // Rebind the main camera's group so the next pass (ColorPass)
        // sees the main view's matrices, not the last capture's. Mirrors
        // ReflectionPass's contract — ReflectionPass also leaves the
        // GlobalBindGroup pointing at its cube camera, but ColorPass
        // calls updateCameraGroup(view.camera) at the top of its
        // execute, which restores. We do the same here defensively in
        // case a downstream pass forgets.
        if (view.camera) {
            GlobalBindGroup.updateCameraGroup(view.camera);
        }
    }

    protected _renderOne(
        view: View3D,
        cap: SceneCaptureCameraComponent,
        camera: Camera3D,
        occlusion: OcclusionSystem,
        cluster: ClusterLightingBuffer | undefined,
    ): void {
        const ctx3D = view.engine3D.context3D;
        const { rendererPassState, renderContext } = cap._ensureRenderTargets(ctx3D);

        // Bind the capture camera into the global camera bind group.
        // updateWorldMatrix() refreshes view+proj from the camera's
        // current world transform; updateCameraGroup uploads to the
        // shared GPU buffer the bound pipelines read.
        camera.transform.scene3D = view.scene;
        camera.transform.updateWorldMatrix();
        GlobalBindGroup.updateCameraGroup(camera);
        rendererPassState.camera3D = camera;

        // Scene-capture passes render through the capture component's
        // own camera; thread its cullingMask through so per-capture
        // layer restrictions (e.g. a minimap RT that drops Overlay)
        // take effect.
        const layered = this.collectLayered(view, camera);

        const gpu = view.engine3D.context3D.gpuContext;
        renderContext.gpu = gpu;
        renderContext.clean();
        renderContext.beginOpaqueRenderPass();
        const opaqueEncoder = renderContext.encoder;

        // Sky first — it draws under depth=1.0 (cleared) so depth
        // writes from opaque later overwrite where geometry exists.
        // Same pattern as ColorPass.
        if (cap.includeSky) {
            const sky = EntityCollect.instance.getSky(view.scene);
            if (sky) {
                gpu.bindCamera(opaqueEncoder, camera);
                if (!sky.preInit(this._passType)) {
                    sky.nodeUpdate(view, this._passType, rendererPassState, cluster);
                }
                sky.renderPass2(view, this._passType, rendererPassState, cluster, opaqueEncoder);
            }
        }

        // Unconditional bindCamera: keeps downstream encoder users
        // (e.g. transparent half on the same encoder, when enabled)
        // valid even on frames where the layered list is empty.
        gpu.bindCamera(opaqueEncoder, camera);
        if (layered.opaque.length > 0) {
            this._drawNodes(view, renderContext, layered.opaque, cap, occlusion, cluster);
        }

        if (cap.includeTransparent && layered.transparent.length > 0) {
            this._drawNodes(view, renderContext, layered.transparent, cap, occlusion, cluster);
        }

        renderContext.endRenderPass();
    }

    protected _drawNodes(
        view: View3D,
        renderContext: RenderContext,
        nodes: RenderNode[],
        cap: SceneCaptureCameraComponent,
        _occlusion: OcclusionSystem,
        cluster: ClusterLightingBuffer | undefined,
    ): void {
        // Pre-init walk so any newly-registered shaders compile before
        // the first draw. The predicate skips renderers that fail the
        // capture's mask filter so we don't preInit pipelines for
        // nodes that won't be drawn this frame.
        preInitPassPipelines(view, this._passType, renderContext.rendererPassState, cluster, (n: any) => this._maskAccepts(cap, n));

        for (const node of nodes) {
            if (!this._maskAccepts(cap, node)) continue;
            if (!node.transform.enable) continue;
            if (!node.enable) continue;
            if (node.isDestroyed) continue;
            if (!node.preInit(this._passType)) {
                node.nodeUpdate(view, this._passType, renderContext.rendererPassState, cluster);
            }
            node.renderPass(view, this._passType, renderContext);
        }
    }

    protected _maskAccepts(cap: SceneCaptureCameraComponent, node: RenderNode): boolean {
        const rm = node.rendererMask;
        if ((rm & cap.captureMask) === 0) return false;
        if (cap.excludeMask !== 0 && (rm & cap.excludeMask) !== 0) return false;
        return true;
    }
}
