import { Camera3D } from "../../core/Camera3D";
import { GeometryBase } from "../../core/geometry/GeometryBase";
import { ProfilerUtil } from "../../util/ProfilerUtil";
import { bindCtx, Context3D, _registerGpuContextFactory } from "../graphics/webGpu/Context3D";
import { GlobalBindGroup } from "../graphics/webGpu/core/bindGroups/GlobalBindGroup";
import { Texture } from "../graphics/webGpu/core/texture/Texture";
import { ComputeShader } from "../graphics/webGpu/shader/ComputeShader";
import { RenderShaderPass } from "../graphics/webGpu/shader/RenderShaderPass";
import { RendererPassState } from "./passRenderer/state/RendererPassState";

/**
 * Per-Context3D GPU command/pipeline state. Owned by exactly one Context3D
 * via `Context3D.gpuContext`. Multi-engine isolation: no mutable state is
 * shared across engines. Access via `ctx.gpuContext.foo()`.
 *
 * @group GFX
 */
export class GPUContextInstance {
    /** The Context3D (one engine) this instance is bound to. */
    public readonly ctx: Context3D;

    /** Last geometry bound by {@link bindGeometryBuffer}; used to skip redundant vertex/index buffer rebinds. */
    public lastGeometry: GeometryBase = null;
    /** Last render pipeline set on the encoder; used to skip redundant setPipeline calls. */
    public lastPipeline: GPURenderPipeline = null;
    /** Last shader pass bound by {@link bindPipeline}; used to detect material switches. */
    public lastShader: RenderShaderPass = null;
    /** Number of draw calls submitted since the last reset (profiling counter). */
    public drawCount: number = 0;
    /** Number of render passes begun since the last reset (profiling counter). */
    public renderPassCount: number = 0;
    /** Number of geometries processed since the last reset (profiling counter). */
    public geometryCount: number = 0;
    /** Number of pipelines created since the last reset (profiling counter). */
    public pipelineCount: number = 0;
    /** Number of matrix uploads since the last reset (profiling counter). */
    public matrixCount: number = 0;
    /** Render-pass state of the most recently begun render pass. */
    public lastRenderPassState: RendererPassState = null;
    /** Command encoder currently open via {@link beginCommandEncoder}, or null. */
    public LastCommand: GPUCommandEncoder = null;
    /** Device that owns {@link LastCommand}; used to submit on the matching queue. */
    public LastCommandDevice: GPUDevice = null;

    constructor(ctx: Context3D) {
        this.ctx = ctx;
    }

    /**
     * Bind a shader pass's pipeline and bind groups onto the encoder.
     * Skips the work and returns `false` when `renderShader` matches the
     * last bound shader; otherwise binds and returns `true`. Re-issues the
     * stencil reference on every material switch since it is render-pass
     * (not pipeline) state.
     */
    public bindPipeline(encoder: GPURenderPassEncoder | GPURenderBundleEncoder, renderShader: RenderShaderPass) {
        if (this.lastShader != renderShader) {
            this.lastShader = renderShader;
        } else {
            return false;
        }

        if (this.lastPipeline != renderShader.pipeline) {
            this.lastPipeline = renderShader.pipeline;
            encoder.setPipeline(renderShader.pipeline);
        }

        // Stencil reference is render-pass state, not pipeline state — it
        // resets to 0 at every renderPassBegin and is not carried by
        // setPipeline. Issue it on every material switch (lastShader change)
        // so two materials sharing the same pipeline but different stencilRef
        // still get the right reference, and so the value survives the
        // per-pass reset after cleanCache(). GPURenderBundleEncoder does not
        // support setStencilReference — bundles inherit it from the outer
        // pass, so we skip it there.
        if ('setStencilReference' in encoder) {
            (encoder as GPURenderPassEncoder).setStencilReference(renderShader.shaderState.stencilRef ?? 0);
        }

        for (let i = 1; i < renderShader.bindGroups.length; i++) {
            const bindGroup = renderShader.bindGroups[i];
            if (bindGroup) {
                encoder.setBindGroup(i, bindGroup);
            }
        }
        return true;
    }

    /** Bind the camera's global bind group at slot 0. */
    public bindCamera(encoder: GPURenderPassEncoder | GPURenderBundleEncoder, camera: Camera3D) {
        let cameraBindGroup = GlobalBindGroup.getCameraGroup(camera);
        encoder.setBindGroup(0, cameraBindGroup.globalBindGroup);
    }

    /**
     * Bind a geometry's index and vertex buffers onto the encoder.
     * Skips the rebind when `geometry` matches the last bound geometry.
     * Lazily binds each GPU buffer to this context on first use.
     */
    public bindGeometryBuffer(encoder: GPURenderPassEncoder | GPURenderBundleEncoder, geometry: GeometryBase) {
        if (this.lastGeometry != geometry) {
            this.lastGeometry = geometry;

            if (geometry.indicesBuffer) {
                const idx = geometry.indicesBuffer.indicesGPUBuffer;
                if (!idx._boundCtx) bindCtx(idx, this.ctx);
                encoder.setIndexBuffer(idx.buffer, geometry.indicesBuffer.indicesFormat);
            }

            let vertexBuffer = geometry.vertexBuffer.vertexGPUBuffer;
            if (vertexBuffer && !vertexBuffer._boundCtx) bindCtx(vertexBuffer, this.ctx);
            let vertexBufferLayouts = geometry.vertexBuffer.vertexBufferLayouts;
            for (let i = 0; i < vertexBufferLayouts.length; i++) {
                const vbLayout = vertexBufferLayouts[i];
                encoder.setVertexBuffer(i, vertexBuffer.buffer, vbLayout.offset, vbLayout.size);
            }
        }
    }

    /** Reset the cached geometry/pipeline/shader so the next bind always issues. */
    public cleanCache() {
        this.lastGeometry = null;
        this.lastPipeline = null;
        this.lastShader = null;
    }

    /** Create a render pipeline on this context's device. */
    public createPipeline(gpuRenderPipeline: GPURenderPipelineDescriptor) {
        ProfilerUtil.countStart("GPUContext", "pipeline");
        return this.ctx.device.createRenderPipeline(gpuRenderPipeline);
    }

    /**
     * Open a new command encoder. Submits any previously open encoder
     * first, so only one encoder is in flight at a time per context.
     */
    public beginCommandEncoder(): GPUCommandEncoder {
        ProfilerUtil.countStart("GPUContext", "beginCommandEncoder");
        if (this.LastCommand) {
            this.LastCommandDevice.queue.submit([this.LastCommand.finish()]);
        }
        this.LastCommandDevice = this.ctx.device;
        this.LastCommand = this.LastCommandDevice.createCommandEncoder();
        return this.LastCommand;
    }

    /** Finish and submit `command` if it is the currently open encoder. */
    public endCommandEncoder(command: GPUCommandEncoder) {
        if (this.LastCommand == command) {
            this.LastCommandDevice.queue.submit([this.LastCommand.finish()]);
            this.LastCommand = null;
            this.LastCommandDevice = null;
            ProfilerUtil.countStart("GPUContext", "endCommandEncoder");
        }
    }

    /** Create a render bundle encoder on this context's device. */
    public recordBundleEncoder(des: GPURenderBundleEncoderDescriptor): GPURenderBundleEncoder {
        return this.ctx.device.createRenderBundleEncoder(des);
    }

    /**
     * Begin a render pass from `renderPassState`. Resolves the attachment
     * views (depth, color RTs, MSAA side-bands + resolve targets, or the
     * swapchain present view when no RTs are set) before opening the pass.
     */
    public beginRenderPass(command: GPUCommandEncoder, renderPassState: RendererPassState): GPURenderPassEncoder {
        this.cleanCache();
        this.renderPassCount++;
        this.lastRenderPassState = renderPassState;
        if (renderPassState.depthTexture) {
            let depth = renderPassState.renderPassDescriptor.depthStencilAttachment;
            depth.view = renderPassState.depthTexture.getGPUView() as any;
        }
        if (renderPassState.renderTargets && renderPassState.renderTargets.length > 0) {
            for (let i = 0; i < renderPassState.renderTargets.length; ++i) {
                const renderTarget = renderPassState.renderTargets[i];
                let att = renderPassState.renderPassDescriptor.colorAttachments[i];
                if (renderPassState.multisample > 0 && renderPassState.multiTextures && renderPassState.multiTextures[i]) {
                    // Render into the MSAA side-band and resolve into
                    // the single-sample RT — but only for formats that
                    // WebGPU can actually resolve. rgba32float (compress
                    // g-buffer) isn't resolvable; in that case the
                    // multisample samples are discarded after the pass,
                    // which is acceptable because SSR / SSAO / the
                    // compress-gbuffer consumers are not used in the
                    // MSAA path.
                    att.view = renderPassState.multiTextures[i].createView();
                    const fmt = renderTarget.format;
                    const resolvable = (
                        fmt === 'rgba8unorm' || fmt === 'rgba8unorm-srgb' ||
                        fmt === 'bgra8unorm' || fmt === 'bgra8unorm-srgb' ||
                        fmt === 'rgba16float' || fmt === 'r16float' ||
                        fmt === 'rg16float' || fmt === 'r8unorm' || fmt === 'rg8unorm'
                    );
                    if (resolvable) {
                        att.resolveTarget = renderTarget.getGPUView();
                    } else {
                        att.resolveTarget = undefined;
                    }
                } else if (renderPassState.multisample > 0 && renderPassState.renderTargets.length == 1) {
                    att.view = renderPassState.multiTexture.createView();
                    att.resolveTarget = renderTarget.getGPUView();
                } else {
                    // Use the wrapper's prepared view (from viewDescriptor,
                    // mipLevelCount=1 by construction) rather than a raw
                    // `getGPUTexture().createView()` (which defaults to all
                    // mips). The two are equivalent for today's
                    // mipLevelCount=1 RenderTextures, but if any
                    // future RT carries a mip chain (transient pool's
                    // SceneColorPyramid, or GBuffer.colorBuffer once its
                    // useMipmap intent is honored), the raw default-view
                    // path would be multi-mip and WebGPU rejects multi-mip
                    // views used as attachments. The prepared view is also
                    // cached on first access, avoiding a per-frame createView.
                    att.view = renderTarget.getGPUView() as GPUTextureView;
                }
            }
            return command.beginRenderPass(renderPassState.renderPassDescriptor);
        } else {
            let att0 = renderPassState.renderPassDescriptor.colorAttachments[0];
            if (att0) {
                // Create the swapchain view in the publicized
                // `presentationFormat` (sRGB variant). The underlying
                // canvas texture is the non-sRGB configure format,
                // and `viewFormats` registered the sRGB variant so
                // the view does the linear→sRGB encode on write.
                // Match this format to what pipelines were built
                // against — pipelines use `ctx.presentationFormat`.
                const viewDesc: GPUTextureViewDescriptor = {
                    format: this.ctx.presentationFormat,
                };
                if (renderPassState.multisample > 0) {
                    att0.view = renderPassState.multiTexture.createView();
                    att0.resolveTarget = this.ctx.context.getCurrentTexture().createView(viewDesc);
                } else {
                    att0.view = this.ctx.context.getCurrentTexture().createView(viewDesc);
                }
            }
            return command.beginRenderPass(renderPassState.renderPassDescriptor);
        }
    }

    /**
     * Indirect indexed draw — the draw call counts (indexCount, instanceCount,
     * firstIndex, baseVertex, firstInstance) come from a GPU buffer at the
     * given offset. Companion of {@link drawIndexed}; used by GPU-driven
     * culling so the visibility decision and the draw submission both live
     * on the GPU.
     *
     * The `indirect-first-instance` adapter feature must be enabled if the
     * indirect buffer's `firstInstance` field is non-zero (Orillusion
     * requests it in Context3D init).
     */
    public drawIndexedIndirect(encoder: GPURenderPassEncoder, indirectBuffer: GPUBuffer, indirectOffset: GPUSize64) {
        encoder.drawIndexedIndirect(indirectBuffer, indirectOffset);
        this.drawCount++;
    }

    /**
     * Indexed draw with CPU-provided counts. No-ops when `indexCount` or
     * `instanceCount` is zero — WebGPU flags empty indexed draws as
     * unusual, and dynamic geometry starts with empty buffers.
     */
    public drawIndexed(encoder: GPURenderPassEncoder, indexCount: GPUSize32,
        instanceCount?: GPUSize32,
        firstIndex?: GPUSize32,
        baseVertex?: GPUSignedOffset32,
        firstInstance?: GPUSize32) {
        // Dynamic geometry (Graphic3D, debug boxes, physics bodies, trails)
        // starts with empty index/instance buffers before any shapes are added,
        // and WebGPU correctly flags drawIndexed(0,...) / drawIndexed(_,0)
        // as "unusual". Nothing to draw is not a draw — skip the call.
        if (!indexCount || (instanceCount !== undefined && !instanceCount)) return;
        encoder.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance);
        this.drawCount++;
    }

    /** Non-indexed draw. No-ops when `vertexCount` or `instanceCount` is zero. */
    public draw(encoder: GPURenderPassEncoder, vertexCount: GPUSize32,
        instanceCount?: GPUSize32,
        firstVertex?: GPUSize32,
        firstInstance?: GPUSize32) {
        if (!vertexCount || (instanceCount !== undefined && !instanceCount)) return;
        encoder.draw(vertexCount, instanceCount, firstVertex, firstInstance);
        this.drawCount++;
    }

    /** End the given render pass. */
    public endPass(encoder: GPURenderPassEncoder) {
        encoder.insertDebugMarker("end")
        encoder.end();
    }

    /** Run a list of compute shaders inside a single compute pass on `command`. */
    public computeCommand(command: GPUCommandEncoder, computes: ComputeShader[]) {
        let computePass = command.beginComputePass();
        for (let i = 0; i < computes.length; i++) {
            const compute = computes[i];
            compute.compute(computePass);
        }
        computePass.end();
    }

    /** Copy mip 0 of `source` into mip 0 of `dest`, sized to `dest`. */
    public copyTexture(command: GPUCommandEncoder, source: Texture, dest: Texture) {
        command.copyTextureToTexture(
            {
                texture: source.getGPUTexture(),
                mipLevel: 0,
                origin: { x: 0, y: 0, z: 0 },
            },
            {
                texture: dest.getGPUTexture(),
                mipLevel: 0,
                origin: { x: 0, y: 0, z: 0 },
            },
            {
                width: dest.width,
                height: dest.height,
                depthOrArrayLayers: 1,
            },
        );
    }
}

// Register the instance factory so Context3D.ts can lazy-materialize
// `gpuContext` without statically importing this module (circular).
_registerGpuContextFactory((ctx) => new GPUContextInstance(ctx));
