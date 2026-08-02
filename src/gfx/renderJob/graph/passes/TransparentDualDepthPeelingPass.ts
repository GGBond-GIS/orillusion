import { RenderTexture } from '../../../../textures/RenderTexture';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { RTDescriptor } from '../../../graphics/webGpu/descriptor/RTDescriptor';
import { WebGPUDescriptorCreator } from '../../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { RTFrame } from '../../frame/RTFrame';
import { PassType } from '../../passRenderer/state/PassType';
import { RendererPassState } from '../../passRenderer/state/RendererPassState';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { TextureHandle } from '../transient/ResourceHandle';
import { TextureIdentityWatcher } from '../transient/TextureIdentityWatcher';
import { ClusterLightingPass } from './ClusterLightingPass';
import { COLOR_BUFFER } from './ColorPass';
import { SCENE_COLOR_PYRAMID } from './SceneColorPyramidPass';
import { dependOnIfRegistered } from './_helpers';

export const DDP_FRONT_TEX = '_DDPFront';
export const DDP_FRONT_DEPTH_TEX = '_DDPFrontDepth';

// Legacy multi-pass scaffolding from stage 1 (kept exported so other
// modules can reference future expanded ping-pong / back-color passes
// without an additional engine refactor).
export const DDP_DEPTH_TEX_0 = '_DDPDepth0';
export const DDP_DEPTH_TEX_1 = '_DDPDepth1';
export const DDP_FRONT_TEX_0 = '_DDPFront0';
export const DDP_FRONT_TEX_1 = '_DDPFront1';
export const DDP_BACK_TEX = '_DDPBack';

/** All DDP RT names exposed for the resolve / debug features. */
export const DDP_TEX_NAMES = [
    DDP_FRONT_TEX,
    DDP_FRONT_DEPTH_TEX,
    DDP_DEPTH_TEX_0,
    DDP_DEPTH_TEX_1,
    DDP_FRONT_TEX_0,
    DDP_FRONT_TEX_1,
    DDP_BACK_TEX,
] as const;

/** Default peel pass count. Stage-3 MVP uses just init + 1 iteration's
 *  front layer; this constant stays for future expansion. */
export const DDP_DEFAULT_PASS_COUNT = 5;

/**
 * Dual Depth Peeling OIT pass (stage-3 MVP).
 *
 * STAGE 3 IMPLEMENTATION SCOPE: single-layer depth peeling.
 *
 * - Each transparent fragment with `oitMode === 'depth-peel'` runs
 *   through the {@link DDPFrontPass} pipeline (one/zero overwrite
 *   blend + depth-write enabled + less-equal depth-test) into a
 *   private depth buffer.
 * - Result: per pixel, the front-most fragment wins via GPU depth-
 *   test. At α=1 this is fully opaque (front blocks bg). At α<1 the
 *   front layer's premultiplied colour overwrites the buffer with
 *   alpha=α, and the {@link TransparentDualDepthPeelingResolvePass}
 *   composites it over the existing _ColorBuffer using the over
 *   operator.
 *
 * STAGE 3 MVP TRADE-OFF: only the FRONT layer renders. Back layers
 * are occluded by depth-test rather than peeled and recomposed. The
 * N-iteration loop is plumbed (RT names DDP_DEPTH_TEX_0/1, _FRONT_0/1,
 * _BACK; createDepthPeelPasses generates DEPTH/FRONT/BACK derived
 * passes per material) and ready for future expansion; stage 3 just
 * keeps the renderer simple to validate end-to-end first.
 *
 * Coexists with {@link TransparentOITPass} (WBOIT) — each pass
 * filters to materials matching its own oitMode, so a scene can
 * mix `'sorted'`, `'weighted'`, and `'depth-peel'` materials and
 * each runs through the right pipeline.
 *
 * @group Graph
 */
export class TransparentDualDepthPeelingPass extends RenderGraphPass {
    public readonly name = 'TransparentDualDepthPeelingPass';

    protected _ctx!: Context3D;
    protected readonly _passType: PassType = PassType.OIT_DEPTH_PEEL_FRONT;
    protected _rendererPassState: RendererPassState | null = null;
    protected _frontHandle!: TextureHandle;
    protected _depthHandle!: TextureHandle;
    protected readonly _watcher: TextureIdentityWatcher = new TextureIdentityWatcher();

    public setup(b: RenderGraphBuilder): void {
        this._ctx = b.context3D;
        b.read(COLOR_BUFFER);
        b.read(SCENE_COLOR_PYRAMID);
        // Single-layer DDP front-color (HDR) + private depth. Both
        // declared as transient — the pool may alias the front colour
        // with any other screen-sized rgba16f scratch (e.g. OIT accum,
        // MotionVector) whose lifetime ends before DDP runs, and the
        // depth attachment with any other screen-sized depth24plus
        // scratch.
        this._frontHandle = b.declareTexture(DDP_FRONT_TEX, {
            format: GPUTextureFormat.rgba16float,
            width: 'screen', height: 'screen',
            label: DDP_FRONT_TEX,
        });
        b.write(this._frontHandle, 'attachment');
        this._depthHandle = b.declareTexture(DDP_FRONT_DEPTH_TEX, {
            format: GPUTextureFormat.depth24plus,
            width: 'screen', height: 'screen',
            label: DDP_FRONT_DEPTH_TEX,
        });
        b.write(this._depthHandle, 'attachment');

        dependOnIfRegistered(b, 'GPUCullPass');
    }

    public execute(ctx: RenderGraphPassContext): void {
        const front = ctx.getTexture(this._frontHandle);
        const depth = ctx.getTexture(this._depthHandle);
        const dirty = this._watcher.update([
            { key: 'front', tex: front },
            { key: 'depth', tex: depth },
        ]);
        if (dirty) this._rendererPassState = null;
        this._ensureRtFrame(front, depth);
        const view = ctx.view;
        const cluster = ctx.graph.getPass<ClusterLightingPass>('ClusterLightingPass')?.clusterLightingBuffer;
        const gpu = view.engine3D.context3D.gpuContext;
        const camera = view.camera;
        GlobalBindGroup.updateCameraGroup(camera);

        const passState = this._rendererPassState!;
        passState.camera3D = camera;

        const transparents = this.collectLayered(view).transparent;

        // Always open/close the pass so the clear loadOp zeroes _DDPFront
        // and resets depth to 1.0 even on frames where no depth-peel
        // material is in the transparent list. Mirrors the OIT pass —
        // without this the resolve pass would composite last-frame DDP
        // front colour over the new opaque scene.

        const command = gpu.beginCommandEncoder();
        // Side-band: save/restore lastRenderPassState so the post chain
        // reader keeps pointing at the colorBuffer pass state set by
        // SortedTransparent / Resolve, not at our DDP front MRT.
        const savedLastPS = gpu.lastRenderPassState;
        const encoder = gpu.beginRenderPass(command, passState);

        gpu.bindCamera(encoder, camera);
        for (const node of transparents) {
            const mat = node.materials?.[0];
            if (!mat || mat.oitMode !== 'depth-peel') continue;
            // ALWAYS call nodeUpdate — see the OIT pass commentary on
            // why preInit early-returns hide dirty-uniform uploads.
            node.nodeUpdate(view, this._passType, passState, cluster);
            node.renderPass2(view, this._passType, passState, cluster, encoder);
        }

        gpu.endPass(encoder);
        gpu.endCommandEncoder(command);
        gpu.lastRenderPassState = savedLastPS;
    }

    protected _ensureRtFrame(front: RenderTexture, depth: RenderTexture): void {
        if (this._rendererPassState) return;
        const ctx = this._ctx;

        // Pinning the human-readable label across pool re-aliases so
        // DevTools captures stay grep-able.
        front.name = DDP_FRONT_TEX;
        depth.name = DDP_FRONT_DEPTH_TEX;

        const frontDesc = new RTDescriptor();
        frontDesc.loadOp = 'clear';
        frontDesc.clearValue = [0, 0, 0, 0];

        const rtFrame = new RTFrame([front], [frontDesc], depth, undefined, true);
        rtFrame.depthLoadOp = 'clear';
        // Cleared to 1.0 (far plane) so any incoming fragment can pass
        // depth-test on the first write at that pixel.
        (rtFrame as any).depthClearValue = 1.0;
        rtFrame.label = 'DDPFront';

        this._rendererPassState = WebGPUDescriptorCreator.createRendererPassState(ctx, rtFrame);
        this._rendererPassState.label = 'DDPFront';
        this._rendererPassState.outColor = 0;
    }
}
