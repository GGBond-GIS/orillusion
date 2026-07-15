import { View3D } from '../../../../core/View3D';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { EntityCollect } from '../../collect/EntityCollect';
import { ClusterLightingBuffer } from '../../passRenderer/cluster/ClusterLightingBuffer';
import { PassType } from '../../passRenderer/state/PassType';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { ClusterLightingPass, CLUSTER_LIGHTING_BUFFER } from './ClusterLightingPass';
import { COLOR_BUFFER } from './ColorPass';
import { MAIN_COLOR_RT } from './GBufferResourcePass';
import { TRANSPARENT_DRAW_CTX, TransparentDrawContext } from './_transparentDraw';

/**
 * Atmosphere / cubemap sky background. Drawn as its own render-graph
 * node so opaque-pass composition stays free of the sky toggle: a
 * subclassed {@link ColorPass} no longer has to override
 * `shouldDrawSky()` to suppress a redundant sky draw, and a renderer
 * that wants no sky at all simply omits this pass.
 *
 * Ordering: declared as a {@link COLOR_BUFFER} mutator + reader of
 * {@link TRANSPARENT_DRAW_CTX}. The graph orders mutators after the
 * creator ({@link GBufferResourcePass}) and tie-breaks among multiple
 * mutators by insertion order — adding `SkyPass` right after the
 * primary opaque pass in the renderer job is sufficient to position it
 * correctly (sky after opaque, before any
 * {@link SceneColorPyramidPass}-style read of the color attachment).
 *
 * Behaviour: opens a continuation render pass on the shared GBuffer
 * with `loadOp='load'` / `depthLoadOp='load'`, so the depth written by
 * the upstream opaque pass gates sky drawing — sky's
 * `depthCompare='less_equal' + writeDepth=false` only paints pixels
 * where the opaque half left depth at the cleared far value. Same
 * early-z optimization the legacy in-ColorPass sky relied on.
 *
 * When no {@link SkyRenderer} is registered in the scene, `execute`
 * skips the encoder open entirely — no cost beyond a map lookup.
 *
 * @group Graph
 */
export class SkyPass extends RenderGraphPass {
    public readonly name: string = 'SkyPass';

    protected readonly _passType: PassType = PassType.COLOR;

    public setup(b: RenderGraphBuilder): void {
        b.read(TRANSPARENT_DRAW_CTX);
        b.read(CLUSTER_LIGHTING_BUFFER);
        b.write(COLOR_BUFFER); // legacy mutator-write (keeps SceneColorPyramidPass topo edge)
        // New-style declaration: also chain on the typed MAIN_COLOR_RT
        // mutator chain so custom passes that key off the RT see a
        // proper writer here. Execute still drives the encoder through
        // the shared RenderContext (`TRANSPARENT_DRAW_CTX`) because
        // sky-on-glass cases can hit splitTexture materials below it
        // in the same frame — that mid-pass split path lives on
        // RenderContext for now.
        b.useRenderTarget(MAIN_COLOR_RT);
    }

    public execute(ctx: RenderGraphPassContext): void {
        const view = ctx.view;
        const sky = EntityCollect.instance.getSky(view.scene);
        if (!sky) return;

        const drawCtx = ctx.get<TransparentDrawContext>(TRANSPARENT_DRAW_CTX);
        const camera = view.camera;
        const cluster = this._getCluster(view);

        const gpu = view.engine3D.context3D.gpuContext;
        drawCtx.renderContext.gpu = gpu;
        drawCtx.rendererPassState.camera3D = camera;

        GlobalBindGroup.updateCameraGroup(camera);

        // Continuation pass — color/depth load, so the prior opaque
        // half's contents stay and sky's depth test gates on already-
        // written z.
        drawCtx.renderContext.beginContinueRendererPassState('load', 'load');
        drawCtx.renderContext.begineNewCommand();
        drawCtx.renderContext.beginNewEncoder();
        const encoder = drawCtx.renderContext.encoder;

        gpu.bindCamera(encoder, camera);
        if (!sky.preInit(this._passType)) {
            sky.nodeUpdate(view, this._passType, drawCtx.rendererPassState, cluster);
        }
        sky.renderPass2(view, this._passType, drawCtx.rendererPassState, cluster, encoder);

        drawCtx.renderContext.endRenderPass();
    }

    protected _getCluster(view: View3D): ClusterLightingBuffer | undefined {
        return view.renderGraph?.getPass<ClusterLightingPass>('ClusterLightingPass')?.clusterLightingBuffer;
    }
}
