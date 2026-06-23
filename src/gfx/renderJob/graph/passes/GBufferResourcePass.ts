import { RenderTexture } from '../../../../textures/RenderTexture';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { WebGPUDescriptorCreator } from '../../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { GBufferFrame } from '../../frame/GBufferFrame';
import { RTFrame } from '../../frame/RTFrame';
import { RenderContext } from '../../passRenderer/RenderContext';
import { RendererPassState } from '../../passRenderer/state/RendererPassState';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { RenderGraphRenderTarget } from '../RenderGraphRenderTarget';
import { COLOR_BUFFER, NORMAL_BUFFER } from './ColorPass';
import { MAIN_DEPTH_TEXTURE } from './PreDepthPass';
import { TRANSPARENT_DRAW_CTX, TransparentDrawContext } from './_transparentDraw';

/**
 * Graph-pool handle for the engine's main color render target.
 * Published by {@link GBufferResourcePass} (adopt mode — wraps the
 * shared {@link GBufferFrame}). Downstream opaque + transparent
 * passes declare a mutator-write via `b.useRenderTarget(MAIN_COLOR_RT)`
 * and open per-frame render passes through the returned handle.
 *
 * Replaces the legacy {@link TRANSPARENT_DRAW_CTX} channel for new
 * code — the latter remains published as a backwards-compatibility
 * shim for the `Sample_PassOrderControl` sample.
 *
 * @group Graph
 */
export const MAIN_COLOR_RT = '_MainColorRT';

/**
 * Resource-only pass that owns the shared main-color G-buffer and the
 * render-context plumbing that downstream opaque + transparent passes
 * consume. Splits the "graph resource creator" responsibility out of
 * {@link ColorPass} so multiple `ColorPass` instances (e.g. a GIS-style
 * "draw terrain → clear depth → draw world" pipeline) can coexist
 * without any of them having to no-op `registerSharedOutputs`.
 *
 * Owns:
 *   - The `colorPass_GBuffer` {@link RTFrame} (singleton, allocated here).
 *   - {@link RendererPassState} for the first (clear) opaque sub-pass.
 *   - A second {@link RendererPassState} with loadOp='load' /
 *     depthLoadOp='load' for any continuation sub-pass (transparent
 *     half, chained second opaque half).
 *   - The {@link RenderContext} shared between halves so the WebGPU
 *     command encoder threads cleanly across them.
 *
 * Publishes:
 *   - {@link COLOR_BUFFER} — the rgba16float color texture.
 *   - {@link NORMAL_BUFFER} — the packed g-buffer attachment.
 *   - {@link TRANSPARENT_DRAW_CTX} — the {@link TransparentDrawContext}
 *     bundle of `rendererPassState` / `splitRendererPassState` /
 *     `renderContext`.
 *
 * `execute()` is a no-op: every published handle has a lazy getter, so
 * consumers resolve them on demand without this pass needing to open a
 * render pass of its own.
 *
 * @group Graph
 */
export class GBufferResourcePass extends RenderGraphPass {
    public readonly name: string = 'GBufferResourcePass';

    public rendererPassState!: RendererPassState;
    public splitRendererPassState!: RendererPassState;
    public renderContext!: RenderContext;
    /** Typed RT handle wrapping the shared {@link GBufferFrame}. Adopt
     *  mode — owns no textures. Consumers reach it through the pool
     *  via `b.useRenderTarget(MAIN_COLOR_RT)`. */
    public mainColorRT!: RenderGraphRenderTarget;

    protected _ctx!: Context3D;

    public setup(b: RenderGraphBuilder): void {
        this._ctx = b.context3D;
        const rtFrame = this._allocateRtFrame(b);
        this.mainColorRT = b.adoptRenderTarget(MAIN_COLOR_RT, rtFrame, { label: 'MainColor' });
        this._buildRenderStates(b, rtFrame);
        this._publish(b);
    }

    private _allocateRtFrame(b: RenderGraphBuilder): RTFrame {
        const view = b.view;
        const ctx = b.context3D;
        const setting = view.engine3D.setting;

        // A7: validate MSAA value. WebGPU only mandates support for
        // sampleCount 1 and 4. 2 and 8 are device-dependent and most
        // desktop adapters expose them, but iOS Safari only surfaces
        // 4. Anything outside {0, 2, 4, 8} is rejected at pipeline
        // creation — clamp here so the user gets a clear warning
        // instead of an opaque pipeline error.
        const rawMsaa = (setting.render as any).msaa | 0;
        let msaa = rawMsaa;
        if (msaa !== 0 && msaa !== 2 && msaa !== 4 && msaa !== 8) {
            console.warn(`[transparency] engine.setting.render.msaa = ${rawMsaa} is not a supported sample count. Valid values: 0 | 2 | 4 | 8. Falling back to 0 (MSAA disabled).`);
            msaa = 0;
        }
        // A6: MSAA + compressGBuffer combination is broken because
        // rgba32float can't be MSAA-resolved by WebGPU. Don't
        // auto-disable post effects (users may not have any wired up)
        // but emit a one-time warning so developers know what they
        // signed up for.
        if (msaa > 0 && (setting.render as any).useCompressGBuffer) {
            console.warn(`[transparency] msaa=${msaa} with useCompressGBuffer=true. The rgba32float g-buffer cannot be MSAA-resolved; post-effects that read it (SSR, SSAO, GTAO, GodRay, GlobalFog, DepthOfField, TAA) will see undefined contents. Either disable MSAA or disable useCompressGBuffer.`);
        }

        const rtFrame = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, ctx, 0, 0, true, undefined, msaa);

        // Wire the prepass depth (when zPrePass is on) by reading the
        // graph pool's external handle. `b.read` declares the
        // dependency for the validator (so a missing PreDepthPass
        // surfaces at compile() with UnresolvedResourceError instead
        // of a raw pool throw); the imperative `pool.get` then fetches
        // the texture for eager binding into rtFrame.zPreTexture.
        if (setting.render.zPrePass) {
            b.read(MAIN_DEPTH_TEXTURE);
            rtFrame.zPreTexture = b.graph.pool.get(MAIN_DEPTH_TEXTURE) as RenderTexture;
        }
        return rtFrame;
    }

    private _buildRenderStates(b: RenderGraphBuilder, rtFrame: RTFrame): void {
        const ctx = b.context3D;
        this.rendererPassState = WebGPUDescriptorCreator.createRendererPassState(ctx, rtFrame);
        const splitRtFrame = rtFrame.clone();
        splitRtFrame.depthLoadOp = 'load';
        for (const desc of splitRtFrame.rtDescriptors) desc.loadOp = 'load';
        this.splitRendererPassState = WebGPUDescriptorCreator.createRendererPassState(ctx, splitRtFrame);
        this.renderContext = new RenderContext(ctx, rtFrame);
    }

    private _publish(b: RenderGraphBuilder): void {
        b.write<RenderTexture>(COLOR_BUFFER, () =>
            GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, this._ctx).getColorTexture()
        );
        b.write<RenderTexture>(NORMAL_BUFFER, () =>
            GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, this._ctx).getCompressGBufferTexture()
        );
        b.write<TransparentDrawContext>(TRANSPARENT_DRAW_CTX, () => ({
            rendererPassState: this.rendererPassState,
            splitRendererPassState: this.splitRendererPassState,
            renderContext: this.renderContext,
        }));
    }

    public execute(_ctx: RenderGraphPassContext): void {
        // Pure resource provider — no draws, no encoder.
    }
}
