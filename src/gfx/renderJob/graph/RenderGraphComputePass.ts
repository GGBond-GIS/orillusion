import { Context3D } from '../../graphics/webGpu/Context3D';
import { RenderGraphPassContext } from './RenderGraphPass';

/**
 * Descriptor for the compute pipeline owned by a
 * {@link RenderGraphComputePass}.
 *
 * @group Graph
 */
export interface ComputePipelineDesc {
    label: string;
    /** WGSL source. */
    shaderCode: string;
    /** Defaults to `'CsMain'` to match the rest of the engine. */
    entryPoint?: string;
    bindGroupLayouts: GPUBindGroupLayoutDescriptor[];
    /** Shader-side pipeline constants (specialization). */
    constants?: Record<string, number>;
}

/**
 * Single dispatch payload — bind groups + workgroup count. Pass
 * authors build this fresh per frame (bind groups generally hold
 * references to per-frame textures so must be reconstructed when the
 * underlying GPU resources rebuild on resize).
 *
 * @group Graph
 */
export interface ComputeDispatchCall {
    bindGroups: GPUBindGroup[];
    workgroups: [number, number, number];
}

/**
 * Handle for "open a compute pass". Owns the pipeline + bind-group
 * layouts (built lazily on first {@link begin}) and the per-call
 * encoder lifecycle.
 *
 * Storage texture / buffer dependencies are still declared through the
 * standard `b.read` / `b.write` builder API — this handle is strictly
 * the encoder + pipeline wrapper. Pass authors that need finer control
 * can call `setPipeline` / `setBindGroup` / `dispatchWorkgroups`
 * directly on the returned encoder.
 *
 * @group Graph
 */
export class RenderGraphComputePass {
    public readonly name: string;
    public readonly desc: Readonly<ComputePipelineDesc>;

    public pipeline: GPUComputePipeline | null = null;
    public bindGroupLayouts: GPUBindGroupLayout[] | null = null;

    /** Runtime fields — valid between {@link begin} and {@link end}. */
    public encoder: GPUComputePassEncoder | null = null;
    public command: GPUCommandEncoder | null = null;

    constructor(name: string, desc: ComputePipelineDesc) {
        this.name = name;
        this.desc = desc;
    }

    /**
     * Open a fresh command encoder + compute pass encoder. Lazily
     * builds the pipeline on first call. The pipeline survives across
     * frames; layouts can be reused for bind-group creation by pass
     * authors via {@link bindGroupLayouts}.
     */
    public begin(ctx: RenderGraphPassContext): GPUComputePassEncoder {
        if (this.encoder) {
            throw new Error(`RenderGraphComputePass '${this.name}': begin() called twice without end().`);
        }
        const engineCtx = ctx.view.engine3D.context3D;
        this._ensurePipeline(engineCtx);
        const gpu = engineCtx.gpuContext;
        this.command = gpu.beginCommandEncoder();
        this.encoder = this.command.beginComputePass({ label: this.desc.label });
        this.encoder.setPipeline(this.pipeline!);
        return this.encoder;
    }

    /**
     * Convenience: bind the provided bind groups (one per layout
     * index) and dispatch. Equivalent to manually iterating
     * `setBindGroup` + calling `dispatchWorkgroups` on
     * {@link encoder}.
     */
    public dispatch(call: ComputeDispatchCall): void {
        if (!this.encoder) {
            throw new Error(`RenderGraphComputePass '${this.name}': dispatch() called outside begin()/end().`);
        }
        for (let i = 0; i < call.bindGroups.length; i++) {
            this.encoder.setBindGroup(i, call.bindGroups[i]);
        }
        this.encoder.dispatchWorkgroups(call.workgroups[0], call.workgroups[1], call.workgroups[2]);
    }

    public end(ctx: RenderGraphPassContext): void {
        const gpu = ctx.view.engine3D.context3D.gpuContext;
        if (this.encoder) this.encoder.end();
        if (this.command) gpu.endCommandEncoder(this.command);
        this.encoder = null;
        this.command = null;
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
        const compute: GPUProgrammableStage = {
            module,
            entryPoint: this.desc.entryPoint ?? 'CsMain',
        };
        if (this.desc.constants) {
            compute.constants = this.desc.constants;
        }
        this.pipeline = device.createComputePipeline({
            label: this.desc.label,
            layout,
            compute,
        });
    }
}
