import { Context3D } from '../../graphics/webGpu/Context3D';
import { RendererPassState } from '../passRenderer/state/RendererPassState';
import { RenderGraphPassContext } from './RenderGraphPass';
import {
    BeginPassOptions,
    OpenedRenderPass,
    RenderGraphRenderTarget,
} from './RenderGraphRenderTarget';

/**
 * Descriptor for the render pipeline owned by a
 * {@link RenderGraphRenderPass}.
 *
 * Format-dependent fields ({@link fragmentTargets}, {@link depthStencil},
 * {@link multisample}) are auto-derived from the bound
 * {@link RenderGraphRenderTarget} when omitted — formats and MSAA sample
 * count must match the target the pipeline draws into. Pass authors
 * supply these fields only when they need to override blend state,
 * depth-compare ops, write masks, etc.
 *
 * @group Graph
 */
export interface RenderPipelineDesc {
    label: string;
    /** Combined WGSL source containing the vertex + fragment entry
     *  points. */
    shaderCode: string;
    /** Defaults to `'main'` to match the engine's WGSL convention. */
    vertexEntry?: string;
    /** Defaults to `'main'`. */
    fragmentEntry?: string;
    bindGroupLayouts: GPUBindGroupLayoutDescriptor[];
    /** Vertex buffer layouts. Omit for fullscreen-triangle passes that
     *  source positions from `@builtin(vertex_index)`. */
    vertexBuffers?: GPUVertexBufferLayout[];
    /** Primitive topology, cull mode, front-face, etc. Defaults to
     *  WebGPU defaults (triangle list, no culling). */
    primitive?: GPUPrimitiveState;
    /** Depth/stencil state. `format` is auto-filled from the target's
     *  depth attachment when omitted. Pass `null` to opt out even when
     *  the target has a depth attachment (rare — usually you want at
     *  least `{ depthWriteEnabled: false, depthCompare: 'always' }`). */
    depthStencil?: Omit<GPUDepthStencilState, 'format'> & { format?: GPUTextureFormat };
    /** Per-color-attachment fragment targets. Length must match the
     *  target's color count when provided. `format` is auto-filled from
     *  each color attachment's texture when omitted. */
    fragmentTargets?: Array<Omit<GPUColorTargetState, 'format'> & { format?: GPUTextureFormat }>;
    /** Multisample state. `count` is auto-filled from the target's
     *  sample count when omitted. */
    multisample?: GPUMultisampleState;
    /** Shader-side pipeline constants (specialization). Applied to both
     *  vertex and fragment stages. */
    constants?: Record<string, number>;
}

/**
 * Optional convenience payload for {@link RenderGraphRenderPass.draw}.
 * Pass authors that need finer control (multiple draws per begin, custom
 * scissor/viewport, manual encoder calls) can drive
 * {@link RenderGraphRenderPass.encoder} directly instead.
 *
 * @group Graph
 */
export interface RenderDrawCall {
    bindGroups: GPUBindGroup[];
    vertexBuffers?: GPUBuffer[];
    indexBuffer?: { buffer: GPUBuffer; format: GPUIndexFormat; offset?: number; size?: number };
    draw:
        | { kind: 'draw'; vertexCount: number; instanceCount?: number; firstVertex?: number; firstInstance?: number }
        | { kind: 'drawIndexed'; indexCount: number; instanceCount?: number; firstIndex?: number; baseVertex?: number; firstInstance?: number };
}

/**
 * Handle for "open a render pass driven by a single owned pipeline".
 * The render-side analog of {@link RenderGraphComputePass}: owns a
 * {@link GPURenderPipeline} + bind-group layouts (built lazily on first
 * {@link begin}) and the per-call encoder lifecycle. Encoder lifecycle
 * itself is delegated to the bound {@link RenderGraphRenderTarget} so
 * the load-op resolution + {@link RendererPassState} caching live on
 * the target where they belong.
 *
 * Created via `b.createRenderPass(name, target, desc, openOpts?)` from
 * inside another pass's `setup()`. Pass authors typically build several
 * of these to compose a custom rendering feature (e.g. a depth-only
 * pre-pass + a fullscreen lighting resolve) without falling back to the
 * heavyweight material-driven pipeline.
 *
 * Scene passes that draw many heterogeneous materials per frame (the
 * canonical {@link ColorPass}-style flow) skip this class and call
 * `target.beginPass(ctx, opts)` directly — they don't have a single
 * pipeline to own.
 *
 * @group Graph
 */
export class RenderGraphRenderPass {
    public readonly name: string;
    public readonly target: RenderGraphRenderTarget;
    public readonly desc: Readonly<RenderPipelineDesc>;
    public readonly openOptions: Readonly<BeginPassOptions>;

    public pipeline: GPURenderPipeline | null = null;
    public bindGroupLayouts: GPUBindGroupLayout[] | null = null;

    /** Runtime fields — valid between {@link begin} and {@link end}. */
    public encoder: GPURenderPassEncoder | null = null;
    public command: GPUCommandEncoder | null = null;
    public passState: RendererPassState | null = null;

    constructor(
        name: string,
        target: RenderGraphRenderTarget,
        desc: RenderPipelineDesc,
        openOptions: BeginPassOptions = {},
    ) {
        this.name = name;
        this.target = target;
        this.desc = desc;
        this.openOptions = openOptions;
    }

    /**
     * Lazily build the pipeline (first call), open a fresh command +
     * render-pass encoder on the bound target with the resolved
     * load-op combination, bind the pipeline, and return the encoder.
     * Pass authors then call {@link draw} (or drive the returned
     * encoder directly) before invoking {@link end}.
     */
    public begin(ctx: RenderGraphPassContext): GPURenderPassEncoder {
        if (this.encoder) {
            throw new Error(`RenderGraphRenderPass '${this.name}': begin() called twice without end().`);
        }
        const engineCtx = ctx.view.engine3D.context3D;
        this._ensurePipeline(engineCtx);
        const opened = this.target.beginPass(ctx, this.openOptions);
        this.encoder = opened.encoder;
        this.command = opened.command;
        this.passState = opened.passState;
        this.encoder.setPipeline(this.pipeline!);
        return this.encoder;
    }

    /**
     * Convenience: bind groups + (optional) vertex/index buffers +
     * dispatch one draw or drawIndexed call. Equivalent to manually
     * iterating `setBindGroup` / `setVertexBuffer` / `setIndexBuffer`
     * and calling the matching `draw*` on {@link encoder}.
     */
    public draw(call: RenderDrawCall): void {
        if (!this.encoder) {
            throw new Error(`RenderGraphRenderPass '${this.name}': draw() called outside begin()/end().`);
        }
        const enc = this.encoder;
        for (let i = 0; i < call.bindGroups.length; i++) {
            enc.setBindGroup(i, call.bindGroups[i]);
        }
        if (call.vertexBuffers) {
            for (let i = 0; i < call.vertexBuffers.length; i++) {
                enc.setVertexBuffer(i, call.vertexBuffers[i]);
            }
        }
        if (call.indexBuffer) {
            enc.setIndexBuffer(
                call.indexBuffer.buffer,
                call.indexBuffer.format,
                call.indexBuffer.offset,
                call.indexBuffer.size,
            );
        }
        const d = call.draw;
        if (d.kind === 'drawIndexed') {
            enc.drawIndexed(
                d.indexCount,
                d.instanceCount ?? 1,
                d.firstIndex ?? 0,
                d.baseVertex ?? 0,
                d.firstInstance ?? 0,
            );
        } else {
            enc.draw(
                d.vertexCount,
                d.instanceCount ?? 1,
                d.firstVertex ?? 0,
                d.firstInstance ?? 0,
            );
        }
    }

    /**
     * Close the render-pass encoder and submit the per-pass command
     * buffer. Clears runtime fields so a stale handle from the previous
     * frame surfaces as a clear error rather than encoder misuse.
     */
    public end(ctx: RenderGraphPassContext): void {
        if (this.encoder && this.command && this.passState) {
            this.target.endPass(ctx, {
                encoder: this.encoder,
                command: this.command,
                passState: this.passState,
            });
        }
        this.encoder = null;
        this.command = null;
        this.passState = null;
    }

    private _ensurePipeline(ctx: Context3D): void {
        if (this.pipeline) return;
        const device = ctx.device;
        this.bindGroupLayouts = this.desc.bindGroupLayouts.map((l) => device.createBindGroupLayout(l));
        const layout = device.createPipelineLayout({ bindGroupLayouts: this.bindGroupLayouts });
        const module = device.createShaderModule({
            code: this.desc.shaderCode,
            label: `${this.desc.label}_module`,
        });
        const vertex: GPUVertexState = {
            module,
            entryPoint: this.desc.vertexEntry ?? 'main',
        };
        if (this.desc.vertexBuffers) vertex.buffers = this.desc.vertexBuffers;
        if (this.desc.constants) vertex.constants = this.desc.constants;

        const fragment: GPUFragmentState = {
            module,
            entryPoint: this.desc.fragmentEntry ?? 'main',
            targets: this._resolveFragmentTargets(),
        };
        if (this.desc.constants) fragment.constants = this.desc.constants;

        const descriptor: GPURenderPipelineDescriptor = {
            label: this.desc.label,
            layout,
            vertex,
            fragment,
        };
        if (this.desc.primitive) descriptor.primitive = this.desc.primitive;

        const depthStencil = this._resolveDepthStencil();
        if (depthStencil) descriptor.depthStencil = depthStencil;

        const multisample = this._resolveMultisample();
        if (multisample) descriptor.multisample = multisample;

        this.pipeline = device.createRenderPipeline(descriptor);
    }

    private _resolveFragmentTargets(): GPUColorTargetState[] {
        const colorCount = this.target.rtFrame.rtDescriptors.length;
        const userTargets = this.desc.fragmentTargets;
        const out: GPUColorTargetState[] = new Array(colorCount);
        for (let i = 0; i < colorCount; i++) {
            const format = this.target.colorTextures[i].format as GPUTextureFormat;
            const user = userTargets?.[i];
            if (user) {
                out[i] = { ...user, format: user.format ?? format } as GPUColorTargetState;
            } else {
                out[i] = { format };
            }
        }
        return out;
    }

    private _resolveDepthStencil(): GPUDepthStencilState | undefined {
        const depthTex = this.target.depthTexture;
        const user = this.desc.depthStencil;
        if (!depthTex) {
            if (user) {
                throw new Error(
                    `RenderGraphRenderPass '${this.name}': desc.depthStencil set but target '${this.target.name}' has no depth attachment.`,
                );
            }
            return undefined;
        }
        const format = depthTex.format as GPUTextureFormat;
        if (user) {
            return { ...user, format: user.format ?? format } as GPUDepthStencilState;
        }
        // Default: depth attachment present but no user state — pipeline
        // still needs a depthStencil block to be valid. Conservative
        // read-only no-test default; pass authors override when they
        // want depthWriteEnabled / a real compare op.
        return { format, depthWriteEnabled: false, depthCompare: 'always' };
    }

    private _resolveMultisample(): GPUMultisampleState | undefined {
        const targetSamples = this.target.sampleCount | 0;
        const user = this.desc.multisample;
        if (user) {
            return { ...user, count: user.count ?? (targetSamples > 0 ? targetSamples : 1) };
        }
        if (targetSamples > 0) return { count: targetSamples };
        return undefined;
    }
}
