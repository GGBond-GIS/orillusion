import { OITResolveShader } from '../../../../assets/shader/post/OITResolveShader';
import { RenderTexture } from '../../../../textures/RenderTexture';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { GBufferFrame } from '../../frame/GBufferFrame';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { COLOR_BUFFER } from './ColorPass';
import { MAIN_COLOR_RT } from './GBufferResourcePass';
import { OIT_ACCUM_TEX, OIT_REVEAL_TEX } from './TransparentOITPass';

/**
 * Composite the WBOIT accum + reveal attachments back into
 * `_ColorBuffer` via a full-screen pass with hardware blend
 * `(SRC=ONE, DST=ONE_MINUS_SRC_ALPHA)`. Pairs with
 * {@link TransparentOITPass}.
 *
 * Builds a private WebGPU pipeline + bind group on first execute —
 * the resolve shader is intentionally NOT a Material so it can run
 * with its own bind layout (raw texture bindings on group 0) without
 * paying the material/uniform setup cost on every frame.
 *
 * @group Graph
 */
export class TransparentResolvePass extends RenderGraphPass {
    public readonly name = 'TransparentResolvePass';

    protected _ctx!: Context3D;
    protected _pipeline: GPURenderPipeline | null = null;
    protected _bindGroupLayout: GPUBindGroupLayout | null = null;
    protected _sampler: GPUSampler | null = null;

    public setup(b: RenderGraphBuilder): void {
        this._ctx = b.context3D;
        // Hint 'sample' contributes TEXTURE_BINDING to the accum/reveal
        // usage union, so the transient pool allocates them with
        // RENDER_ATTACHMENT (from OIT's write) | TEXTURE_BINDING (from
        // this read). Without the hint usage would lack TEXTURE_BINDING
        // and createBindGroup would throw at the createView() below.
        b.read(OIT_ACCUM_TEX, 'sample');
        b.read(OIT_REVEAL_TEX, 'sample');
        b.write(COLOR_BUFFER);              // legacy mutator-write
        b.useRenderTarget(MAIN_COLOR_RT);   // typed mutator on the main RT
    }

    protected _ensurePipeline(colorBuffer: RenderTexture): void {
        if (this._pipeline) return;
        const device = this._ctx.device;
        const module = device.createShaderModule({
            label: 'OITResolveShader',
            code: OITResolveShader,
        });
        this._sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });
        this._bindGroupLayout = device.createBindGroupLayout({
            label: 'OITResolveBindGroupLayout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
            ],
        });
        const pipelineLayout = device.createPipelineLayout({
            label: 'OITResolvePipelineLayout',
            bindGroupLayouts: [this._bindGroupLayout],
        });
        this._pipeline = device.createRenderPipeline({
            label: 'OITResolvePipeline',
            layout: pipelineLayout,
            vertex: { module, entryPoint: 'vs_main' },
            fragment: {
                module,
                entryPoint: 'fs_main',
                targets: [{
                    format: colorBuffer.format,
                    // Pre-multiplied composite: shader outputs
                    // (avg * visibility, visibility), and hardware
                    // blends with (1 - visibility) on the existing
                    // background — net effect is the WBOIT formula.
                    blend: {
                        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    },
                }],
            },
            primitive: { topology: 'triangle-list' },
        });
    }

    public execute(ctx: RenderGraphPassContext): void {
        // Pull from the graph pool — the OIT pass declared these as
        // transient, so the pool may have aliased them to share
        // physical storage with another rgba16f / r8 screen-sized
        // resource whose lifetime ended before OIT ran.
        const accum = ctx.getTexture(OIT_ACCUM_TEX);
        const reveal = ctx.getTexture(OIT_REVEAL_TEX);
        const colorBuffer = ctx.get<RenderTexture>(COLOR_BUFFER);
        if (!accum || !reveal || !colorBuffer) return;

        this._ensurePipeline(colorBuffer);

        const gpu = ctx.view.engine3D.context3D.gpuContext;
        const command = gpu.beginCommandEncoder();

        // Build the bind group fresh every frame. Texture views on
        // RenderTexture can rotate when the canvas resizes (the
        // underlying GPUTexture is destroyed and re-created); a cached
        // bind group would point at a destroyed view. Per-frame
        // re-creation is cheap (3-4 µs typical).
        const bindGroup = this._ctx.device.createBindGroup({
            label: 'OITResolveBindGroup',
            layout: this._bindGroupLayout!,
            entries: [
                { binding: 0, resource: this._sampler! },
                { binding: 1, resource: accum.getGPUTexture().createView() },
                { binding: 2, resource: this._sampler! },
                { binding: 3, resource: reveal.getGPUTexture().createView() },
            ],
        });

        const passDesc: GPURenderPassDescriptor = {
            label: 'OITResolvePass',
            colorAttachments: [{
                // Use the wrapper's prepared single-mip view rather
                // than `getGPUTexture().createView()` (defaults to all
                // mips). Multi-mip views as attachments are rejected
                // by WebGPU; the prepared view is cached too.
                view: colorBuffer.getGPUView() as GPUTextureView,
                loadOp: 'load',
                storeOp: 'store',
                clearValue: [0, 0, 0, 0],
            }],
        };
        const encoder = command.beginRenderPass(passDesc);
        encoder.setPipeline(this._pipeline!);
        encoder.setBindGroup(0, bindGroup);
        // Three-vertex big triangle covers the screen. No vertex
        // buffer — the shader hard-codes positions via @builtin.
        encoder.draw(3, 1, 0, 0);
        encoder.end();
        gpu.endCommandEncoder(command);

        // Suppress unused-import warning while GBufferFrame is here
        // for potential future "depth peel for occluded transparents".
        void GBufferFrame;
    }
}
