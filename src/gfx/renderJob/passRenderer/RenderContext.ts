import { Context3D } from "../../graphics/webGpu/Context3D";
import { WebGPUDescriptorCreator } from "../../graphics/webGpu/descriptor/WebGPUDescriptorCreator";
import { GPUContextInstance } from "../GPUContext";
import { RTFrame } from "../frame/RTFrame";
import { RendererPassState } from "./state/RendererPassState";

/**
 * Drives one {@link RTFrame}'s render through the GPU: opens command
 * encoders and render-pass encoders, and builds the
 * {@link RendererPassState} sequence (opaque / transparent / continuation
 * passes) for the frame. Wraps {@link GPUContextInstance} so passes work
 * against a single frame's attachments without touching the device API.
 *
 * @group GFX
 */
export class RenderContext {
    /** The command encoder currently open for this frame. */
    public command: GPUCommandEncoder;
    /** The render-pass encoder currently open for this frame. */
    public encoder: GPURenderPassEncoder;
    /** The per-context GPU helper this render context issues through. */
    public gpu: GPUContextInstance;
    private ctx: Context3D;
    private rendererPassStates: RendererPassState[];
    private rtFrame: RTFrame;

    constructor(ctx: Context3D, rtFrame: RTFrame) {
        this.ctx = ctx;
        this.rtFrame = rtFrame;
        this.rendererPassStates = [];
    }

    /** Reset the accumulated pass states and the GPU bind cache for a new frame. */
    public clean() {
        this.rendererPassStates.length = 0;
        this.gpu.cleanCache();
    }

    /**
     * Push a renderer pass state for the current frame and return it.
     * When earlier states already exist this is a continuation pass that
     * loads (rather than clears) prior attachment contents; otherwise it
     * applies the given color/depth load ops to the frame's first pass.
     */
    public beginContinueRendererPassState(color_loadOp: GPULoadOp = 'load', depth_loadOp: GPULoadOp = 'load') {
        if (this.rendererPassStates.length > 0) {
            let splitRtFrame = this.rtFrame.clone();
            for (const iterator of splitRtFrame.rtDescriptors) {
                iterator.loadOp = `load`;
            }
            splitRtFrame.depthLoadOp = depth_loadOp;
            let splitRendererPassState = WebGPUDescriptorCreator.createRendererPassState(this.ctx, splitRtFrame, color_loadOp);
            this.rendererPassStates.push(splitRendererPassState);
            return splitRendererPassState;
        } else {
            this.rtFrame.depthLoadOp = depth_loadOp;
            let splitRendererPassState = WebGPUDescriptorCreator.createRendererPassState(this.ctx, this.rtFrame, color_loadOp);
            if (splitRendererPassState.renderPassDescriptor?.colorAttachments?.[0]) {
                (splitRendererPassState.renderPassDescriptor.colorAttachments[0] as any).loadOp = color_loadOp;
            }
            this.rendererPassStates.push(splitRendererPassState);
            return splitRendererPassState;
        }
    }

    /** The most recently pushed renderer pass state (the active one). */
    public get rendererPassState() {
        return this.rendererPassStates[this.rendererPassStates.length - 1];
    }

    /** Begin the opaque pass: clear color + depth, then open a fresh command and encoder. */
    public beginOpaqueRenderPass() {
        this.beginContinueRendererPassState('clear', 'clear');
        this.begineNewCommand();
        this.beginNewEncoder();
    }

    /** Begin a transparent pass: load color + depth (continuation), then open a fresh command and encoder. */
    public beginTransparentRenderPass() {
        this.beginContinueRendererPassState('load', 'load');
        this.begineNewCommand();
        this.beginNewEncoder();
    }

    /** Begin a special-purpose continuation pass: load color + depth, then open a fresh command and encoder. */
    public specialtRenderPass() {
        this.beginContinueRendererPassState('load', 'load');
        this.begineNewCommand();
        this.beginNewEncoder();
    }

    /** End the current render pass: close the encoder then submit the command. */
    public endRenderPass() {
        this.endEncoder();
        this.endCommand();
    }

    /** Open a new command encoder for this frame. */
    public begineNewCommand(): GPUCommandEncoder {
        this.command = this.gpu.beginCommandEncoder();
        return this.command;
    }

    /** Submit and clear the current command encoder. */
    public endCommand() {
        this.gpu.endCommandEncoder(this.command);
        this.command = null;
    }

    /** Begin a render-pass encoder for the active pass state on the open command. */
    public beginNewEncoder() {
        this.encoder = this.gpu.beginRenderPass(this.command, this.rendererPassState);
        return this.encoder;
    }

    /** End and clear the current render-pass encoder. */
    public endEncoder() {
        this.gpu.endPass(this.encoder);
        this.encoder = null;
    }

}
