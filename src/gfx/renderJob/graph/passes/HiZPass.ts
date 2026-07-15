import { HiZ_Init_cs, HiZ_Reduce_cs } from '../../../../assets/shader/compute/HiZGenerate_cs';
import { RenderTexture } from '../../../../textures/RenderTexture';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { GBufferFrame } from '../../frame/GBufferFrame';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { TextureHandle } from '../transient/ResourceHandle';
import { TextureIdentityWatcher } from '../transient/TextureIdentityWatcher';

export const HIZ_PYRAMID = '_HiZPyramid';

/**
 * Hi-Z depth pyramid generation. Reads `gBuffer.x` from the compressed
 * GBuffer; writes a r32float mip chain where each mip stores the
 * **maximum** NDC z over its 2×2 footprint. Downstream consumers
 * (GPU occlusion culling, SSR cone-trace, Volumetric Fog visibility)
 * sample the pyramid at a mip level matching the screen-space size of
 * their query for log2(N) lookups instead of per-pixel ray marches.
 *
 * Two pipelines:
 *  - `HiZ_Init_cs`: extracts depth from compressGBuffer.x into pyramid
 *    mip 0 at full scene resolution.
 *  - `HiZ_Reduce_cs`: 2×2 max reduction from mip N to mip N+1.
 *
 * Per-frame: one init dispatch + (numMips-1) reduction dispatches.
 *
 * Phase-3 migration: the pyramid is declared as a transient texture
 * with `aliasable: false` (mip-chain bind groups must keep stable
 * GPUTexture identity across compiles) and `publishToLegacyMap: true`
 * so {@link GPUCullSystem} (which still looks the texture up through
 * `RTResourceMap.getTexture(ctx, '_HiZPyramid')`) keeps finding it
 * after the migration. Sizing follows `ctx.presentationSize` — this
 * matches the default `GBufferFrame` (canvas-sized depth) and is the
 * only configuration HiZ is wired to today.
 *
 * @group Graph
 */
export class HiZPass extends RenderGraphPass {
    public readonly name = 'HiZPass';

    protected _ctx!: Context3D;
    protected _handle!: TextureHandle;
    protected _pyramid: RenderTexture | null = null;
    protected _numMips: number = 1;
    protected _initPipeline: GPUComputePipeline | null = null;
    protected _reducePipeline: GPUComputePipeline | null = null;
    protected _bindGroupLayout: GPUBindGroupLayout | null = null;
    protected _initBindGroup: GPUBindGroup | null = null;
    protected _reduceBindGroups: GPUBindGroup[] = [];
    // Identities of the GPUTextures the cached bind groups reference.
    // The compressGBuffer source has autoResize=true and is recreated by
    // the canvas-resize listener; the pyramid wrapper is owned by the
    // transient pool and may be re-allocated when presentationSize
    // changes between compiles. Compare-and-rebuild on identity change.
    protected _lastCompressGpuTex: GPUTexture | null = null;
    protected _lastPyramidGpuTex: GPUTexture | null = null;
    protected readonly _watcher: TextureIdentityWatcher = new TextureIdentityWatcher();

    public setup(b: RenderGraphBuilder): void {
        this._ctx = b.context3D;
        // Pre-init the colorPass_GBuffer here with the default sampleCount=0
        // so it lands in the per-context cache before GBufferResourcePass.setup
        // (which runs later in ForwardRendererJob and would otherwise create
        // the GBuffer with `setting.render.msaa`). The legacy HiZPass did
        // this implicitly via its lazy `_getOrAllocate` at execute time —
        // removing the lazy path in this migration accidentally unmasked a
        // pre-existing engine bug where MSAA + the rgba32float compressGBuffer
        // attachment trips WebGPU's "RGBA32Float does not support
        // multisampling" validation (samples like Sample_Glass with msaa:4
        // render pure black as a result). Calling getGBufferFrame here
        // preserves the original behaviour: ColorPassGBuffer is sampleCount=0
        // (matching the engine's `useCompressGBuffer:false` default semantics),
        // and MSAA still affects the upstream color attachment via per-pipeline
        // sample count. Fixing the engine-side MSAA path properly is its own
        // task — this preserves status quo for the migration.
        GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, this._ctx);
        const [w, h] = this._ctx.presentationSize;
        const mips = this._mipCount(w, h);
        this._handle = b.declareTexture(HIZ_PYRAMID, {
            // r32float is in WebGPU's default storage-texture format
            // set (r16float is NOT — needs the `r16float-renderable`
            // proposal). Single channel; precision more than
            // sufficient for [0,1] NDC z.
            format: GPUTextureFormat.r32float,
            width: 'screen', height: 'screen',
            mipLevelCount: mips,
            aliasable: false,
            publishToLegacyMap: true,
            // Explicit usage: STORAGE_BINDING (init/reduce pipelines
            // write the output mips) + TEXTURE_BINDING (reduce step
            // samples the previous mip) + COPY_SRC/COPY_DST for
            // dev-time debug captures.
            usage: GPUTextureUsage.STORAGE_BINDING
                 | GPUTextureUsage.TEXTURE_BINDING
                 | GPUTextureUsage.COPY_SRC
                 | GPUTextureUsage.COPY_DST,
            label: HIZ_PYRAMID,
        });
        b.write(this._handle, 'storage');
    }

    protected _mipCount(w: number, h: number): number {
        return 1 + Math.floor(Math.log2(Math.max(w, h)));
    }

    protected _ensurePipelines(): void {
        if (this._initPipeline && this._reducePipeline && this._bindGroupLayout) return;
        const device = this._ctx.device;
        // One layout reused by both pipelines (they have identical
        // bindings — sampleable input + storage write output).
        this._bindGroupLayout = device.createBindGroupLayout({
            label: 'HiZBindGroupLayout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'r32float', viewDimension: '2d' } },
            ],
        });
        const pipelineLayout = device.createPipelineLayout({
            label: 'HiZPipelineLayout',
            bindGroupLayouts: [this._bindGroupLayout],
        });
        this._initPipeline = device.createComputePipeline({
            label: 'HiZ_Init',
            layout: pipelineLayout,
            compute: {
                module: device.createShaderModule({ code: HiZ_Init_cs }),
                entryPoint: 'CsMain',
            },
        });
        this._reducePipeline = device.createComputePipeline({
            label: 'HiZ_Reduce',
            layout: pipelineLayout,
            compute: {
                module: device.createShaderModule({ code: HiZ_Reduce_cs }),
                entryPoint: 'CsMain',
            },
        });
    }

    protected _ensureBindGroups(): void {
        const device = this._ctx.device;
        const pyramid = this._pyramid!;
        const compressGBuffer = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, this._ctx).getCompressGBufferTexture();
        // Materialize once — both the source and destination textures may
        // have been destroyed-and-recreated by their own resize handlers
        // since we last ran. Compare GPUTexture identity (not just size)
        // so a recreated-but-same-size texture still triggers a rebuild.
        const compressGpuTex = compressGBuffer.getGPUTexture();
        const pyramidGpuTex = pyramid.getGPUTexture();
        const fresh =
            this._initBindGroup &&
            this._reduceBindGroups.length === this._numMips - 1 &&
            this._lastCompressGpuTex === compressGpuTex &&
            this._lastPyramidGpuTex === pyramidGpuTex;
        if (fresh) return;

        // Init bind group: input = compressGBuffer (full mip view via
        // its default view); output = pyramid mip 0.
        this._initBindGroup = device.createBindGroup({
            label: 'HiZ_InitBG',
            layout: this._bindGroupLayout!,
            entries: [
                { binding: 0, resource: compressGpuTex.createView({ format: compressGBuffer.format, dimension: '2d', baseMipLevel: 0, mipLevelCount: 1 }) },
                { binding: 1, resource: pyramidGpuTex.createView({ format: pyramid.format, dimension: '2d', baseMipLevel: 0, mipLevelCount: 1 }) },
            ],
        });

        // Reduce bind groups, one per (mip N → mip N+1).
        this._reduceBindGroups = [];
        for (let i = 0; i < this._numMips - 1; i++) {
            const srcView = pyramidGpuTex.createView({
                format: pyramid.format, dimension: '2d',
                baseMipLevel: i, mipLevelCount: 1,
            });
            const dstView = pyramidGpuTex.createView({
                format: pyramid.format, dimension: '2d',
                baseMipLevel: i + 1, mipLevelCount: 1,
            });
            this._reduceBindGroups.push(device.createBindGroup({
                label: `HiZ_ReduceBG_mip${i + 1}`,
                layout: this._bindGroupLayout!,
                entries: [
                    { binding: 0, resource: srcView },
                    { binding: 1, resource: dstView },
                ],
            }));
        }
        this._lastCompressGpuTex = compressGpuTex;
        this._lastPyramidGpuTex = pyramidGpuTex;
    }

    public execute(ctx: RenderGraphPassContext): void {
        this._pyramid = ctx.getTexture(this._handle);
        this._numMips = (this._pyramid.textureDescriptor as GPUTextureDescriptor | undefined)?.mipLevelCount ?? 1;
        // Pool-driven wrapper swap (canvas resize ⇒ next compile
        // re-allocated this slot) invalidates the cached bind groups.
        // The watcher fires once per such swap so the next execute
        // re-binds against the fresh GPUTexture.
        if (this._watcher.update([{ key: 'pyramid', tex: this._pyramid }])) {
            this._initBindGroup = null;
            this._reduceBindGroups = [];
        }
        this._ensurePipelines();
        this._ensureBindGroups();
        const gpu = this._ctx.gpuContext;
        const command = gpu.beginCommandEncoder();
        const pass = command.beginComputePass({ label: 'HiZGenerate' });

        // Init: extract depth into mip 0 at full scene resolution.
        const w = this._pyramid.width;
        const h = this._pyramid.height;
        pass.setPipeline(this._initPipeline!);
        pass.setBindGroup(0, this._initBindGroup!);
        pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8), 1);

        // Reduce per mip.
        let mipW = Math.max(1, w >> 1);
        let mipH = Math.max(1, h >> 1);
        pass.setPipeline(this._reducePipeline!);
        for (let i = 0; i < this._reduceBindGroups.length; i++) {
            pass.setBindGroup(0, this._reduceBindGroups[i]);
            pass.dispatchWorkgroups(Math.max(1, Math.ceil(mipW / 8)), Math.max(1, Math.ceil(mipH / 8)), 1);
            mipW = Math.max(1, mipW >> 1);
            mipH = Math.max(1, mipH >> 1);
        }
        pass.end();
        gpu.endCommandEncoder(command);
    }
}
