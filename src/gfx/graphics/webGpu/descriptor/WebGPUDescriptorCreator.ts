import { RTFrame } from '../../../renderJob/frame/RTFrame';
import { RTResourceConfig } from '../../../renderJob/config/RTResourceConfig';
import { Context3D } from '../Context3D';
import { RendererPassState } from '../../../renderJob/passRenderer/state/RendererPassState';
/**
 * @internal
 */
export class WebGPUDescriptorCreator {

    /** Per-Context3D cache of RTFrame→RendererPassState so descriptors built
     *  against one device are not reused for another. */
    private static _perContextPassState: WeakMap<Context3D, Map<RTFrame, RendererPassState>> = new WeakMap();
    private static _passStateMap(ctx: Context3D): Map<RTFrame, RendererPassState> {
        let m = this._perContextPassState.get(ctx);
        if (!m) {
            m = new Map<RTFrame, RendererPassState>();
            this._perContextPassState.set(ctx, m);
        }
        return m;
    }

    public static createRendererPassState(ctx: Context3D, rtFrame: RTFrame, loadOp: GPULoadOp = null) {
        const passMap = WebGPUDescriptorCreator._passStateMap(ctx);
        let rps: RendererPassState = passMap.get(rtFrame);
        if (!rps) {
            rps = new RendererPassState();
            rps.label = rtFrame.label;
            rps.customSize = rtFrame.customSize;
            rps.rtFrame = rtFrame;
            rps.zPreTexture = rtFrame.zPreTexture;
            rps.depthTexture = rtFrame.depthTexture;
            rps.depthViewIndex = rtFrame.depthViewIndex;
            rps.isOutTarget = rtFrame.isOutTarget;
            rps.depthCleanValue = rtFrame.depthCleanValue;
            rps.depthLoadOp = rtFrame.depthLoadOp;
            rps.stateVersion = 1;
            // MSAA: an rtFrame authored with `sampleCount > 0` — e.g. a
            // GBufferFrame created with `engine.setting.render.msaa` — needs
            // side-band multisample textures for each color attachment
            // plus a matching pipeline sample count. Allocate once up-front
            // and let the beginRenderPass path re-use them.
            rps.multisample = rtFrame.sampleCount | 0;
            passMap.set(rtFrame, rps);
        }

        if (rtFrame && rtFrame.renderTargets.length > 0) {
            // Bump stateVersion when the attached RT array identity
            // changes — scene resize / reflection probe rebuild /
            // reconfiguration of the RTFrame all flow through here
            // and must invalidate any cached render bundle.
            if (rps.renderTargets !== rtFrame.renderTargets) {
                rps.stateVersion++;
            }
            rps.renderTargets = rtFrame.renderTargets;
            rps.rtTextureDescriptors = rtFrame.rtDescriptors;
            rps.renderPassDescriptor = WebGPUDescriptorCreator.getRenderPassDescriptor(ctx, rps);
            if (rps.renderPassDescriptor.depthStencilAttachment) {
                rps.renderPassDescriptor.depthStencilAttachment.depthLoadOp = rtFrame.depthLoadOp;
            }
            rps.depthLoadOp = rtFrame.depthLoadOp;
            rps.renderBundleEncoderDescriptor = WebGPUDescriptorCreator.getRenderBundleDescriptor(ctx, rps);
            rps.renderTargetTextures = [];
            for (let i = 0; i < rtFrame.renderTargets.length; i++) {
                const element = rtFrame.renderTargets[i];
                rps.renderTargetTextures[i] = {
                    format: element.format,
                };
                if (element.name.indexOf(RTResourceConfig.colorBufferTex_NAME) != -1) {
                    rps.outColor = i;
                }
            }

            // Allocate per-attachment MSAA side-band textures. Done here
            // (not in beginRenderPass) because this is the one hook that
            // already runs on resize (via customSize descriptors being
            // rebuilt) and owns the lifetime tied to the rtFrame cache key.
            if (rps.multisample > 0) {
                rps.multiTextures = [];
                for (let i = 0; i < rtFrame.renderTargets.length; i++) {
                    const rt = rtFrame.renderTargets[i];
                    rps.multiTextures[i] = ctx.device.createTexture({
                        label: `${rps.label || 'MSAA'}_ms_${i}`,
                        size: { width: rt.width, height: rt.height },
                        sampleCount: rps.multisample,
                        format: rt.format,
                        usage: GPUTextureUsage.RENDER_ATTACHMENT,
                    });
                }
            }

        } else {
            rps.renderPassDescriptor = WebGPUDescriptorCreator.getRenderPassDescriptor(ctx, rps, loadOp);
            rps.renderBundleEncoderDescriptor = WebGPUDescriptorCreator.getRenderBundleDescriptor(ctx, rps);
            if (rtFrame && rtFrame.depthTexture) {
                // Depth-only pass (e.g. directional / CSM shadow uses
                // RTFrame([], []) with just a depth attachment). Don't
                // fabricate a phantom bgra8unorm color target — the pipeline
                // would then be created with a color target that has no
                // matching fragment output, which Metal silently accepts but
                // Dawn's D3D12 backend rejects with
                //   "Color target has no corresponding fragment stage output
                //    but writeMask is not zero"
                // The whole shadow render pipeline becomes invalid, the
                // shadow map never gets written, and every receiver tests as
                // fully lit → no shadows on Windows.
                rps.renderTargetTextures = [];
                rps.outColor = -1;
            } else {
                // Presentation-to-canvas default.
                rps.renderTargetTextures = [
                    {
                        format: ctx.presentationFormat,
                    },
                ];
                rps.outColor = 0;
            }
        }
        return rps;
    }

    /**
     * Get RenderPass Descriptor
     * Use AttachMentTextures , Texture Format Is Key
     * @param attachMentTextures
     * @param useDepth
     * @param cleanColor
     * @returns
     */
    // static getRenderPassDescriptor(attachMentTextures: VirtualTexture[], renderPassState:RenderPassState): any {
    public static getRenderPassDescriptor(ctx: Context3D, renderPassState: RendererPassState, loadOp: GPULoadOp = null): any {
        if (renderPassState.renderPassDescriptor) return renderPassState.renderPassDescriptor;
        let presentationSize = ctx.presentationSize;
        let attachMentTexture = [];

        let size = [];
        if (renderPassState.renderTargets && renderPassState.renderTargets.length > 0) {
            size = [renderPassState.renderTargets[0].width, renderPassState.renderTargets[0].height];
            for (let i = 0; i < renderPassState.renderTargets.length; i++) {
                const texture = renderPassState.renderTargets[i];
                const rtDesc = renderPassState.rtTextureDescriptors[i];
                attachMentTexture.push({
                    view: texture.getGPUView(),
                    resolveTarget: undefined,
                    loadOp: rtDesc.loadOp,
                    clearValue: rtDesc.clearValue,
                    storeOp: rtDesc.storeOp,
                });
            }
        } else {
            if (!renderPassState.customSize) {
                let clearValue = ctx.canvasConfig && ctx.canvasConfig.alpha ? [1.0, 1.0, 1.0, 0.0] : [0.0, 0.0, 0.0, 1.0]
                size = presentationSize;
                if (renderPassState.isOutTarget == true) {
                    attachMentTexture.push({
                        view: undefined,
                        resolveTarget: undefined,
                        loadOp: (ctx.canvasConfig && ctx.canvasConfig.alpha) || loadOp != null ? `load` : `clear`,
                        clearValue: clearValue,
                        storeOp: 'store',
                    });
                }
            }
        }

        let renderPassDescriptor: GPURenderPassDescriptor = null;
        if (renderPassState.depthTexture || renderPassState.zPreTexture) {
            //if set zPreTexture
            if (renderPassState.zPreTexture) {
                renderPassState.depthTexture = renderPassState.zPreTexture;
            }

            // depth+stencil formats (depth24plus-stencil8 etc.) require
            // stencilLoadOp + stencilStoreOp on every BeginRenderPass —
            // omitting them triggers a Dawn validation error and the
            // whole command buffer is rejected. Mirror the depth
            // load/store choice: `load` when chaining a prepass, `clear`
            // (to 0) otherwise.
            const hasStencil = typeof renderPassState.depthTexture.format === 'string'
                && (renderPassState.depthTexture.format as string).includes('stencil');
            const dsAttach: GPURenderPassDepthStencilAttachment = {
                view: renderPassState.depthTexture.getGPUView() as GPUTextureView,
                depthLoadOp: renderPassState.zPreTexture ? `load` : renderPassState.depthLoadOp,
                depthClearValue: renderPassState.zPreTexture ? 1 : renderPassState.depthCleanValue,
                depthStoreOp: "store",
            };
            if (hasStencil) {
                dsAttach.stencilLoadOp = renderPassState.zPreTexture ? 'load' : 'clear';
                dsAttach.stencilClearValue = 0;
                dsAttach.stencilStoreOp = 'store';
            }
            renderPassDescriptor = {
                label: `${renderPassState.label} renderPassDescriptor zPreTexture${renderPassState.zPreTexture ? `load` : `clear`}`,
                colorAttachments: attachMentTexture,
                depthStencilAttachment: dsAttach,
            };
        } else {
            renderPassDescriptor = {
                colorAttachments: attachMentTexture,
                label: 'renderPassDescriptor not writeDepth',
            };
        }
        renderPassState.renderPassDescriptor = renderPassDescriptor;
        return renderPassDescriptor;
    }

    /**
     * Get RenderPass Descriptor
     * Use AttachMentTextures , Texture Format Is Key
     * @param attachMentTextures
     * @param useDepth
     * @param cleanColor
     * @returns
     */
    public static getRenderBundleDescriptor(ctx: Context3D, renderPassState: RendererPassState): GPURenderBundleEncoderDescriptor {
        if (renderPassState.renderBundleEncoderDescriptor) return renderPassState.renderBundleEncoderDescriptor;
        let presentationSize = ctx.presentationSize;
        let attachMentTexture = [];
        let size = [];
        if (renderPassState.renderTargets && renderPassState.renderTargets.length > 0) {
            size = [renderPassState.renderTargets[0].width, renderPassState.renderTargets[0].height];
            for (let i = 0; i < renderPassState.renderTargets.length; i++) {
                const renderTarget = renderPassState.renderTargets[i];
                attachMentTexture.push(renderTarget.format);
            }
        } else {
            size = presentationSize;
            // attachMentTexture.push(GPUTextureFormat.bgra8unorm);
            // attachMentTexture.push();
        }

        let renderPassDescriptor: GPURenderBundleEncoderDescriptor = null;
        if (renderPassState.depthTexture) {
            renderPassDescriptor = {
                colorFormats: attachMentTexture,
                depthStencilFormat: renderPassState.depthTexture.format,
            };
        } else {
            renderPassDescriptor = {
                colorFormats: attachMentTexture,
            };
        }
        renderPassState.renderBundleEncoderDescriptor = renderPassDescriptor;
        return renderPassState.renderBundleEncoderDescriptor;
    }
}
