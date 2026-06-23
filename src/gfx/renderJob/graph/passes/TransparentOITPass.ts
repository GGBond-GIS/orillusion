import { RenderTexture } from '../../../../textures/RenderTexture';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { RTDescriptor } from '../../../graphics/webGpu/descriptor/RTDescriptor';
import { WebGPUDescriptorCreator } from '../../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { GBufferFrame } from '../../frame/GBufferFrame';
import { RTFrame } from '../../frame/RTFrame';
import { PassType } from '../../passRenderer/state/PassType';
import { RendererPassState } from '../../passRenderer/state/RendererPassState';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { TextureHandle } from '../transient/ResourceHandle';
import { TextureIdentityWatcher } from '../transient/TextureIdentityWatcher';
import { ClusterLightingPass } from './ClusterLightingPass';
import { COLOR_BUFFER } from './ColorPass';
import { MAIN_DEPTH_TEXTURE } from './PreDepthPass';
import { SCENE_COLOR_PYRAMID } from './SceneColorPyramidPass';
import { dependOnIfRegistered } from './_helpers';

export const OIT_ACCUM_TEX = '_OITAccum';
export const OIT_REVEAL_TEX = '_OITReveal';

/**
 * Weighted-Blended OIT accumulation pass (McGuire & Bavoil 2013).
 * Renders all transparent materials marked `oitMode === 'weighted'`
 * into two side-band attachments:
 *
 * - `_OITAccum` (RGBA16F, additive) — `Σ color·α·w` in RGB, `Σ α·w` in A
 * - `_OITReveal` (R8) — `Π (1 - α)` per pixel
 *
 * Depth comes from the main color pass's GBuffer (read-only) so
 * transparent fragments occluded by opaque geometry are correctly
 * culled. Companion {@link TransparentResolvePass} composites the
 * two attachments back into `_ColorBuffer` at AfterTransparent.
 *
 * @group Graph
 */
export class TransparentOITPass extends RenderGraphPass {
    public readonly name = 'TransparentOITPass';

    protected _ctx!: Context3D;
    protected readonly _passType: PassType = PassType.OIT_ACCUM;
    protected _rendererPassState: RendererPassState | null = null;
    protected _zPreTexture: RenderTexture | null = null;
    protected _accumHandle!: TextureHandle;
    protected _revealHandle!: TextureHandle;
    /** Detect pool-driven attachment identity swaps (canvas resize ⇒
     *  pool re-allocates same-bucket-but-different-size slot, or
     *  re-aliasing across compiles). Forces RTFrame + RendererPassState
     *  rebuild on hit. */
    protected readonly _watcher: TextureIdentityWatcher = new TextureIdentityWatcher();

    public setup(b: RenderGraphBuilder): void {
        this._ctx = b.context3D;
        b.read(COLOR_BUFFER);
        b.read(SCENE_COLOR_PYRAMID);
        // When zPrePass is on, the COLOR pass uses MAIN_DEPTH_TEXTURE
        // (PreDepthPass output) as its depth attachment, NOT the GBuffer's
        // own depth texture. Match that here — otherwise OIT loads an
        // unwritten depth (cleared to 0), depth-test 'less-equal' rejects
        // every transparent fragment (depth > 0), accum/reveal stay at
        // their clear values, and the resolve composites nothing.
        if (b.view.engine3D.setting.render.zPrePass) {
            b.read(MAIN_DEPTH_TEXTURE);
            this._zPreTexture = b.graph.pool.get(MAIN_DEPTH_TEXTURE) as RenderTexture;
        }
        // Declare the two side-band attachments as transient. The
        // physical pool may alias them with any other rgba16f / r8 screen-
        // sized scratch (e.g. Phase-1 MotionVector for the rgba16f bucket)
        // whose lifetime ends before OIT runs.
        this._accumHandle = b.declareTexture(OIT_ACCUM_TEX, {
            format: GPUTextureFormat.rgba16float,
            width: 'screen', height: 'screen',
            label: OIT_ACCUM_TEX,
        });
        b.write(this._accumHandle, 'attachment');
        this._revealHandle = b.declareTexture(OIT_REVEAL_TEX, {
            format: GPUTextureFormat.r8unorm,
            width: 'screen', height: 'screen',
            label: OIT_REVEAL_TEX,
        });
        b.write(this._revealHandle, 'attachment');

        dependOnIfRegistered(b, 'GPUCullPass');
    }

    public execute(ctx: RenderGraphPassContext): void {
        const accum = ctx.getTexture(this._accumHandle);
        const reveal = ctx.getTexture(this._revealHandle);
        // Rebuild RTFrame + RendererPassState if the pool handed us a
        // different RenderTexture (resize / new alias slot).
        const dirty = this._watcher.update([
            { key: 'accum', tex: accum },
            { key: 'reveal', tex: reveal },
        ]);
        if (dirty) this._rendererPassState = null;
        this._ensureRtFrame(accum, reveal);
        const view = ctx.view;
        const cluster = ctx.graph.getPass<ClusterLightingPass>('ClusterLightingPass')?.clusterLightingBuffer;
        const gpu = view.engine3D.context3D.gpuContext;
        const camera = view.camera;
        GlobalBindGroup.updateCameraGroup(camera);

        const passState = this._rendererPassState!;
        passState.camera3D = camera;

        const transparents = this.collectLayered(view).transparent;
        // Don't early-return when there are no weighted materials. The
        // companion TransparentResolvePass runs unconditionally and
        // composites OIT_ACCUM / OIT_REVEAL onto the colour buffer
        // every frame; if we skip the begin/end of THIS render pass,
        // those side-band textures retain their previous-frame contents
        // and the resolve pass blends a ghost of the last weighted-OIT
        // scene over today's opaque-only render. Always open/close the
        // pass so the rendererPassState's clear loadOp zeroes accum and
        // re-fills reveal to white before the resolve reads.

        const command = gpu.beginCommandEncoder();
        // OIT writes to side-band accum/reveal targets, not to the main
        // color cursor. Save/restore `gpu.lastRenderPassState` around
        // the OIT pass so the post-chain reader (PostPass →
        // _FinalColor → lastRenderPassState.getLastRenderTexture) keeps
        // pointing at the colorBuffer pass state set by SortedTransparent
        // / Resolve, not at the OIT_ACCUM RT.
        const savedLastPS = gpu.lastRenderPassState;
        const encoder = gpu.beginRenderPass(command, passState);

        gpu.bindCamera(encoder, camera);
        for (const node of transparents) {
            const mat = node.materials?.[0];
            if (!mat || mat.oitMode !== 'weighted') continue;
            // ALWAYS call nodeUpdate — not just on first init.
            //
            // nodeUpdate is where `renderShader.apply()` runs, and apply
            // is where `materialDataUniformBuffer.apply()` uploads the
            // dirty uniform buffer to the GPU. The earlier guard
            // `if (!node.preInit(passType))` skipped nodeUpdate after
            // the first frame, freezing the OIT pass's uniforms — so
            // dragging the alpha slider in WBOIT mode appeared to do
            // nothing (the buffer was marked dirty but apply never ran
            // to flush it). nodeUpdate itself contains an
            // `if (renderShader.pipeline) renderShader.apply(...); return;`
            // early-return at the top, so per-frame calls don't re-do
            // the heavy texture/binding setup once the pipeline exists.
            node.nodeUpdate(view, this._passType, passState, cluster);
            node.renderPass2(view, this._passType, passState, cluster, encoder);
        }

        gpu.endPass(encoder);
        gpu.endCommandEncoder(command);
        gpu.lastRenderPassState = savedLastPS;
    }

    protected _ensureRtFrame(accum: RenderTexture, reveal: RenderTexture): void {
        if (this._rendererPassState) return;
        const ctx = this._ctx;
        const colorGBuffer = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, ctx);

        // Naming attachments after their logical handles keeps DevTools
        // labels stable across pool re-aliases — easier to follow in
        // captures than the pool's auto-generated UUID name.
        accum.name = OIT_ACCUM_TEX;
        reveal.name = OIT_REVEAL_TEX;

        const accumDesc = new RTDescriptor();
        accumDesc.loadOp = 'clear';
        accumDesc.clearValue = [0, 0, 0, 0];
        const revealDesc = new RTDescriptor();
        revealDesc.loadOp = 'clear';
        revealDesc.clearValue = [1, 1, 1, 1];

        // Share the upstream depth attachment so OIT depth-tests against
        // opaque depth: zPreTexture path picks MAIN_DEPTH_TEXTURE when
        // zPrePass=true (the texture ColorPass actually writes), and falls
        // back to GBuffer's depthTexture otherwise. depthLoadOp='load'
        // preserves the prepass + opaque writes; OITAccumPass's own
        // shaderState.depthWriteEnabled=false keeps OIT from refining it.
        const rtFrame = new RTFrame(
            [accum, reveal],
            [accumDesc, revealDesc],
            colorGBuffer.depthTexture,
            this._zPreTexture ?? undefined,
            true,
        );
        rtFrame.depthLoadOp = 'load';
        rtFrame.label = 'OITAccum';

        this._rendererPassState = WebGPUDescriptorCreator.createRendererPassState(ctx, rtFrame);
        this._rendererPassState.label = 'OITAccum';
        // outColor index of the "primary" attachment (accum). Default
        // initialization in WebGPUDescriptorCreator looks for a name
        // matching colorBufferTex_NAME; OIT attachments don't, so set
        // it manually so per-pipeline blend wiring picks up target 0.
        this._rendererPassState.outColor = 0;
    }
}
