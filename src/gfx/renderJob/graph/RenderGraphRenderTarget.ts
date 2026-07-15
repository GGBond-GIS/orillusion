import { RenderTexture } from '../../../textures/RenderTexture';
import { Context3D } from '../../graphics/webGpu/Context3D';
import { RTDescriptor } from '../../graphics/webGpu/descriptor/RTDescriptor';
import { WebGPUDescriptorCreator } from '../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { RTFrame } from '../frame/RTFrame';
import { RTResourceMap } from '../frame/RTResourceMap';
import { RendererPassState } from '../passRenderer/state/RendererPassState';
import { RenderGraphPassContext } from './RenderGraphPass';

/**
 * Per-call open options for {@link RenderGraphRenderTarget.beginPass}.
 *
 * Any field left `undefined` (or any array slot left `undefined`)
 * defaults via the auto-derive rule:
 *
 *   - first writer of the RT this frame ⇒ `'clear'`
 *   - subsequent writer of the same RT ⇒ `'load'`
 *
 * Callers explicitly set a field when they need to override the
 * default — typical case is a mid-frame ClearDepth that wants
 * `depthLoadOp: 'clear'` even though it isn't the first writer.
 *
 * @group Graph
 */
export interface BeginPassOptions {
    /** Per-color-attachment loadOp. Length matches the RT's color
     *  count. Each slot independently auto-derives when left
     *  `undefined`. */
    colorLoadOps?: (GPULoadOp | undefined)[];
    /** Optional override of per-attachment clearValue (defaults to the
     *  RT descriptor's clearValue). */
    colorClearValues?: GPUColor[];
    depthLoadOp?: GPULoadOp;
    depthClearValue?: number;
    stencilLoadOp?: GPULoadOp;
    /** Suffix appended to the underlying command encoder + render pass
     *  for devtools. Defaults to the target name. */
    label?: string;
}

/**
 * Live handle returned by {@link RenderGraphRenderTarget.beginPass}.
 * Carries the WebGPU encoder + the resolved {@link RendererPassState}
 * for the open invocation. Pass to {@link RenderGraphRenderTarget.endPass}
 * to close the pass + submit the per-call command buffer.
 *
 * @group Graph
 */
export interface OpenedRenderPass {
    encoder: GPURenderPassEncoder;
    command: GPUCommandEncoder;
    passState: RendererPassState;
}

/**
 * Per-color-attachment description.
 *
 * @group Graph
 */
export interface RTColorAttachmentDesc {
    /** Logical attachment name. Used as the sub-key in
     *  {@link RTResourceMap} when the RT allocates fresh, and as a
     *  human-readable label for debug. Inside one
     *  {@link RenderGraphRenderTargetDesc} every `name` must be unique. */
    name: string;
    format: GPUTextureFormat;
    /** Default clearValue used by the first writer's auto-clear path.
     *  Can be overridden per-`beginPass` via
     *  {@link BeginPassOptions.colorClearValues}. */
    clearValue?: GPUColor;
    /** Default storeOp. Defaults to `'store'`. */
    storeOp?: GPUStoreOp;
    /** Adopt mode: pre-existing texture. If provided the RT does not
     *  allocate a new one through {@link RTResourceMap}. */
    texture?: RenderTexture;
}

/**
 * Depth (+ optional stencil) attachment description.
 *
 * @group Graph
 */
export interface RTDepthAttachmentDesc {
    format: GPUTextureFormat;
    /** Default 1.0. */
    depthClearValue?: number;
    /** Default `'store'`. */
    depthStoreOp?: GPUStoreOp;
    stencilLoadOp?: GPULoadOp;
    stencilStoreOp?: GPUStoreOp;
    texture?: RenderTexture;
}

/**
 * Declarative description of a render target.
 *
 * @group Graph
 */
export interface RenderGraphRenderTargetDesc {
    label: string;
    /** 0 / undefined => canvas-sized; the underlying {@link RenderTexture}
     *  installs its own {@link CResizeEvent.RESIZE} listener so the GPU
     *  resource follows the canvas. */
    width?: number;
    height?: number;
    customSize?: boolean;
    /** MSAA sample count — 0 disables. Forwarded to
     *  {@link RTFrame.sampleCount} so
     *  {@link WebGPUDescriptorCreator.createRendererPassState} allocates
     *  matching side-band textures. */
    sampleCount?: number;
    colors: RTColorAttachmentDesc[];
    depth?: RTDepthAttachmentDesc;
    /** When true the RT participates in the canvas swapchain present
     *  path. Mirrors {@link RTFrame.isOutTarget}; default `false`. */
    isOutTarget?: boolean;
}

/**
 * Typed render target = color attachment(s) + (optional) depth +
 * creation description. Wraps {@link RTFrame} without replacing it —
 * the rtFrame field is still the single source of truth that
 * {@link WebGPUDescriptorCreator.createRendererPassState} consumes.
 *
 * Two construction modes:
 *
 * - **Adopt** via {@link fromRTFrame}: bind to an externally-allocated
 *   {@link RTFrame} (typical: {@link GBufferFrame}). The RT does not
 *   own the underlying {@link RenderTexture}s; cleanup is the source's
 *   responsibility.
 * - **Allocate** via {@link allocate}: allocate fresh
 *   {@link RenderTexture}s through {@link RTResourceMap.createRTTexture}
 *   (auto-resize via the texture's built-in resize handler) and
 *   compose them into a private {@link RTFrame}.
 *
 * Multi-writer rule: only one pass creates the RT (calls
 * `b.createRenderTarget` / `b.adoptRenderTarget`). Downstream passes
 * call `b.useRenderTarget(name)` (or `b.borrowRenderTarget(name)`) to
 * record a mutator-write and obtain the same RT handle; the encoder
 * is opened in `execute()` via {@link beginPass}.
 *
 * @group Graph
 */
export class RenderGraphRenderTarget {
    /** Pool handle name. */
    public readonly name: string;
    public readonly desc: Readonly<RenderGraphRenderTargetDesc>;
    public readonly rtFrame: RTFrame;
    public readonly colorTextures: ReadonlyArray<RenderTexture>;
    public readonly depthTexture: RenderTexture | null;
    public readonly sampleCount: number;
    /** True if this RT owns the underlying textures (allocate mode).
     *  False for adopt mode — textures are owned by the upstream
     *  {@link RTFrame} source (e.g. {@link GBufferFrame}). */
    public readonly owned: boolean;

    /** Per-frame flag flipped by the first {@link beginPass} call against
     *  this RT, reset by {@link RenderGraph.execute} at the start of every
     *  frame. Drives the load-op auto-derive rule (first writer => 'clear'
     *  default, subsequent => 'load' default). */
    /** @internal */
    public _firstWriterFiredThisFrame: boolean = false;

    /** Cache of `(loadOp/clearValue combination)` → cloned {@link RTFrame}
     *  + cached {@link RendererPassState}. Keyed by a stable string built
     *  from the resolved open options. Each entry's clonedFrame.renderTargets
     *  array identity is stable across frames, so
     *  {@link WebGPUDescriptorCreator}'s internal `stateVersion` does not
     *  bump on every begin — only on actual rebuilds (e.g. resize). */
    /** @internal */
    public _stateCache: Map<string, { rtFrame: RTFrame; passState: RendererPassState }> = new Map();

    /** Names of passes that have called `b.useRenderTarget(this.name)`.
     *  Populated in registration order; used by tooling (`dumpDot`) and
     *  by the validator's dev-mode assertion. */
    /** @internal */
    public readonly _writers: string[] = [];

    /** Use {@link fromRTFrame} or {@link allocate} — direct construction
     *  is reserved for internal use. */
    constructor(
        name: string,
        desc: RenderGraphRenderTargetDesc,
        rtFrame: RTFrame,
        owned: boolean,
    ) {
        this.name = name;
        this.desc = desc;
        this.rtFrame = rtFrame;
        this.colorTextures = rtFrame.renderTargets;
        this.depthTexture = rtFrame.depthTexture ?? null;
        this.sampleCount = rtFrame.sampleCount | 0;
        this.owned = owned;
    }

    /**
     * Adopt an externally-allocated {@link RTFrame}. The wrapper does
     * not own the textures; only descriptor / cache state is reset on
     * {@link destroy}. Typical use: {@link GBufferResourcePass} wraps a
     * {@link GBufferFrame}.
     */
    public static fromRTFrame(
        name: string,
        rtFrame: RTFrame,
        opts?: { label?: string },
    ): RenderGraphRenderTarget {
        const colors: RTColorAttachmentDesc[] = rtFrame.renderTargets.map((tex, i) => ({
            name: tex.name || `color${i}`,
            format: tex.format,
            clearValue: rtFrame.rtDescriptors[i]?.clearValue,
            storeOp: rtFrame.rtDescriptors[i]?.storeOp as GPUStoreOp,
            texture: tex,
        }));
        const depth: RTDepthAttachmentDesc | undefined = rtFrame.depthTexture
            ? {
                format: rtFrame.depthTexture.format,
                depthClearValue: rtFrame.depthCleanValue,
                texture: rtFrame.depthTexture,
            }
            : undefined;
        const desc: RenderGraphRenderTargetDesc = {
            label: opts?.label ?? rtFrame.label ?? name,
            customSize: rtFrame.customSize,
            sampleCount: rtFrame.sampleCount,
            colors,
            depth,
            isOutTarget: rtFrame.isOutTarget,
        };
        return new RenderGraphRenderTarget(name, desc, rtFrame, /*owned*/ false);
    }

    /**
     * Allocate fresh textures via {@link RTResourceMap} (auto-resize
     * inherited) and assemble a private {@link RTFrame}. The
     * per-attachment cache key in `RTResourceMap` is
     * `"<rt-name>::<attachment-name>"` to avoid colliding with other
     * registries that use bare attachment names.
     */
    public static allocate(
        name: string,
        ctx: Context3D,
        desc: RenderGraphRenderTargetDesc,
    ): RenderGraphRenderTarget {
        const presentation = ctx.presentationSize;
        const width = desc.width && desc.width > 0 ? desc.width : presentation[0];
        const height = desc.height && desc.height > 0 ? desc.height : presentation[1];
        const sampleCount = desc.sampleCount ?? 0;

        const colorTextures: RenderTexture[] = [];
        const rtDescriptors: RTDescriptor[] = [];
        for (const c of desc.colors) {
            const tex = c.texture ?? RTResourceMap.createRTTexture(
                ctx,
                `${name}::${c.name}`,
                width,
                height,
                c.format,
                /*useMipmap*/ false,
                sampleCount,
            );
            colorTextures.push(tex);
            const rtDesc = new RTDescriptor();
            rtDesc.loadOp = 'clear';
            rtDesc.storeOp = (c.storeOp ?? 'store') as GPUStoreOp;
            rtDesc.clearValue = c.clearValue ?? [0, 0, 0, 0];
            rtDescriptors.push(rtDesc);
        }

        let depthTexture: RenderTexture | undefined;
        if (desc.depth) {
            depthTexture = desc.depth.texture ?? RTResourceMap.createRTTexture(
                ctx,
                `${name}::depth`,
                width,
                height,
                desc.depth.format,
                /*useMipmap*/ false,
                sampleCount,
            );
        }

        const rtFrame = new RTFrame(
            colorTextures,
            rtDescriptors,
            depthTexture,
            undefined,
            desc.isOutTarget ?? false,
        );
        rtFrame.label = desc.label;
        rtFrame.sampleCount = sampleCount;
        rtFrame.customSize = desc.customSize ?? false;
        if (desc.depth) {
            rtFrame.depthCleanValue = desc.depth.depthClearValue ?? 1;
        }
        return new RenderGraphRenderTarget(name, desc, rtFrame, /*owned*/ true);
    }

    /**
     * Open a render pass on this target. Resolves the load-op combination
     * against the auto-derive rule (first-writer ⇒ clear, subsequent ⇒
     * load) unless `opts` overrides it, looks up (or builds) the cached
     * {@link RendererPassState} for that resolved bucket, opens a fresh
     * {@link GPUCommandEncoder} + render-pass encoder, and returns the
     * encoder + state.
     *
     * Each invocation opens an **independent** command encoder. WebGPU
     * does not require encoders to be shared across passes for
     * `loadOp='load'` chaining — the attachment contents carry over, not
     * the encoder identity.
     *
     * Pair every successful call with {@link endPass} (typically in a
     * `try/finally`).
     */
    public beginPass(ctx: RenderGraphPassContext, opts: BeginPassOptions): OpenedRenderPass {
        const engineCtx = ctx.view.engine3D.context3D;
        const firstWriter = !this._firstWriterFiredThisFrame;
        const colorCount = this.rtFrame.rtDescriptors.length;

        const resolvedColorLoadOps: GPULoadOp[] = new Array(colorCount);
        for (let i = 0; i < colorCount; i++) {
            const userOp = opts.colorLoadOps?.[i];
            resolvedColorLoadOps[i] = userOp ?? (firstWriter ? 'clear' : 'load');
        }
        const resolvedDepthLoadOp: GPULoadOp =
            opts.depthLoadOp ?? (firstWriter ? 'clear' : 'load');

        // Resolve per-attachment storeOp ahead of cache key building so
        // discard-vs-store sliced state never collides in `_stateCache`.
        // The base storeOp comes from the source RTFrame descriptor
        // (default 'store'); we override to 'discard' when the
        // analyzer says this attachment's logical resource is at its
        // last-use boundary in the current pass — see compile()'s
        // `_lastUseByName` and `isLastUseInCurrentPass`.
        const graph = ctx.graph;
        const resolvedColorStoreOps: GPUStoreOp[] = new Array(colorCount);
        for (let i = 0; i < colorCount; i++) {
            const base = (this.rtFrame.rtDescriptors[i]?.storeOp as GPUStoreOp) ?? 'store';
            const colorName = this.desc.colors[i]?.name;
            const canDiscard = colorName && graph?.isLastUseInCurrentPass(colorName);
            resolvedColorStoreOps[i] = canDiscard ? 'discard' : base;
        }

        const key = RenderGraphRenderTarget._stateKey(opts, resolvedColorLoadOps, resolvedDepthLoadOp, resolvedColorStoreOps);
        let entry = this._stateCache.get(key);
        if (!entry) {
            // Clone the source rtFrame and stamp the resolved ops on
            // the clone so the cached RendererPassState in
            // WebGPUDescriptorCreator (keyed by rtFrame identity)
            // matches this options bucket alone.
            const clonedFrame = this.rtFrame.clone();
            clonedFrame.label = `${this.rtFrame.label ?? this.name}::${key}`;
            clonedFrame.depthLoadOp = resolvedDepthLoadOp;
            clonedFrame.depthCleanValue =
                opts.depthClearValue ?? this.rtFrame.depthCleanValue;
            clonedFrame.sampleCount = this.rtFrame.sampleCount;
            clonedFrame.customSize = this.rtFrame.customSize;
            clonedFrame.isOutTarget = this.rtFrame.isOutTarget;
            // Apply resolved load + store ops onto the cloned RTFrame
            // descriptors. The resolvedColorStoreOps array was built
            // above with `discard` overrides from the analyzer's
            // last-use info; safe default for missing lifetime info
            // is the source RTFrame's storeOp (typically 'store').
            for (let i = 0; i < colorCount; i++) {
                const d = clonedFrame.rtDescriptors[i];
                d.loadOp = resolvedColorLoadOps[i];
                d.storeOp = resolvedColorStoreOps[i];
                const override = opts.colorClearValues?.[i];
                if (override !== undefined) {
                    d.clearValue = override;
                }
            }
            // Depth-attachment discard is a follow-up: RTFrame has
            // depthLoadOp but no symmetric depthStoreOp field, and
            // RendererPassState's renderPassDescriptor.depthStencilAttachment
            // is built once + cached, so we'd need to patch it after
            // createRendererPassState. Color attachments alone already
            // capture the common discard wins (transparency side-band
            // accums, multi-target intermediates).
            const passState = WebGPUDescriptorCreator.createRendererPassState(engineCtx, clonedFrame);
            entry = { rtFrame: clonedFrame, passState };
            this._stateCache.set(key, entry);
        } else {
            // Re-call so any external resize-driven stateVersion bump
            // propagates into the cached entry (no-op when nothing
            // changed; the inner cache short-circuits by rtFrame
            // identity).
            WebGPUDescriptorCreator.createRendererPassState(engineCtx, entry.rtFrame);
        }

        const gpu = engineCtx.gpuContext;
        const command = gpu.beginCommandEncoder();
        const encoder = gpu.beginRenderPass(command, entry.passState);
        this._firstWriterFiredThisFrame = true;
        return { encoder, command, passState: entry.passState };
    }

    /**
     * Close a pass opened with {@link beginPass} and submit the per-pass
     * command buffer.
     */
    public endPass(ctx: RenderGraphPassContext, opened: OpenedRenderPass): void {
        const gpu = ctx.view.engine3D.context3D.gpuContext;
        gpu.endPass(opened.encoder);
        gpu.endCommandEncoder(opened.command);
    }

    private static _stateKey(
        opts: BeginPassOptions,
        colorLoadOps: GPULoadOp[],
        depthLoadOp: GPULoadOp,
        colorStoreOps: GPUStoreOp[],
    ): string {
        // Cheap stable serialization. Avoids JSON.stringify allocation
        // on the hot path while remaining deterministic across
        // identical option buckets. Includes storeOps so the
        // analyzer-driven discard derivation doesn't collide with a
        // prior store-only cache entry under the same loadOp key —
        // without it, an RT opened first with 'store' then later with
        // 'discard' would reuse the wrong RendererPassState.
        let s = '';
        for (let i = 0; i < colorLoadOps.length; i++) {
            s += colorLoadOps[i];
            s += '|';
        }
        s += depthLoadOp;
        s += '|';
        s += opts.depthClearValue ?? '';
        s += '|';
        for (let i = 0; i < colorStoreOps.length; i++) {
            s += colorStoreOps[i];
            s += '|';
        }
        if (opts.colorClearValues) {
            for (const cv of opts.colorClearValues) {
                s += JSON.stringify(cv);
                s += ',';
            }
        }
        return s;
    }

    /**
     * Release per-RT framework state. Owned textures are not destroyed
     * here — {@link RTResourceMap} retains them so that a subsequent
     * graph rebuild can reuse them without reallocating. Pass authors
     * that want explicit destruction must do it themselves.
     */
    public destroy(_ctx: Context3D): void {
        this._stateCache.clear();
        this._writers.length = 0;
        this._firstWriterFiredThisFrame = false;
    }
}
