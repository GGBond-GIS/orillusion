/**
 * Resource descriptors for the transient resource subsystem of
 * {@link RenderGraph}. A pass calls
 * `b.declareTexture(name, desc)` / `b.declareBuffer(name, desc)`
 * during `setup()` to declare a *requirement* for a transient GPU
 * resource. The actual allocation happens after graph compilation,
 * inside the physical pool, which is free to alias the resource onto
 * an existing wrapper whose lifetime ends before this resource's
 * starts.
 *
 * @group Graph
 */

/**
 * Symbolic size token. Resolved against the owning view's
 * `ctx.presentationSize` each time the graph compiles, so passes can
 * declare "screen-sized scratch" without knowing the concrete viewport
 * resolution at setup time.
 *
 * Numeric value => literal pixels (use for fixed-size lookups like
 * shadow atlases or LUTs).
 *
 * @group Graph
 */
export type SizeSpec = number | 'screen' | 'screen/2' | 'screen/4' | 'screen/8';

/**
 * Per-edge access hint attached to a `b.read` / `b.write` /
 * `b.readWrite` call. The compiler unions these into the resource's
 * final `GPUTextureUsage` mask when the descriptor's `usage === 'auto'`.
 *
 * - `'sample'`     → `TEXTURE_BINDING`
 * - `'storage'`    → `STORAGE_BINDING`
 * - `'attachment'` → `RENDER_ATTACHMENT`
 * - `'copy'`       → `COPY_SRC` (on read) or `COPY_DST` (on write)
 *
 * Every hint additionally contributes `COPY_SRC | COPY_DST` to the
 * unioned usage, giving dev-time friction-free debug copies without
 * forcing every pass to remember the bit.
 *
 * @group Graph
 */
export type AccessHint = 'sample' | 'storage' | 'attachment' | 'copy';

/**
 * Declarative description of a transient texture. Passes hand this to
 * `b.declareTexture(name, desc)` during setup; the pool allocates
 * (or aliases) a {@link RenderTexture} after compilation and the pass
 * fetches it through `ctx.getTexture(name)` at execute time.
 *
 * @group Graph
 */
export interface TextureDesc {
    format: GPUTextureFormat;
    /** Width spec; `'screen'` etc. resolved per-compile against
     *  `ctx.presentationSize[0]`. */
    width: SizeSpec;
    /** Height spec; `'screen'` etc. resolved per-compile against
     *  `ctx.presentationSize[1]`. */
    height: SizeSpec;
    /** Mip levels. Default 1. >1 unlocks mip-chain mode — note that
     *  mip-chain resources should usually opt out of aliasing via
     *  `aliasable: false` because cached bind groups can survive across
     *  compiles and reference specific mip views. */
    mipLevelCount?: number;
    /** WebGPU sample count; 0 or 1 => non-MSAA. Default 0. */
    sampleCount?: number;
    /** Array layers (>=1). Default 1. */
    numberLayer?: number;
    /** `'auto'` (default) ⇒ the compiler unions the final usage from
     *  every `read/write/readWrite` access hint that targets this
     *  resource. Otherwise an explicit bitmask. Even when explicit,
     *  the analyzer still unions any access hints it sees and emits a
     *  `console.warn` if a hint bit is missing from the user mask. */
    usage?: GPUTextureUsageFlags | 'auto';
    /** When `false`, the physical pool MUST NOT alias this resource
     *  with another. Use for mip pyramids, history textures (TAA),
     *  arrays consumed via cached bind-group views — anything whose
     *  `GPUTexture` identity must remain stable across compile windows.
     *  Default `true`. */
    aliasable?: boolean;
    /** When `true`, the graph also publishes the pool-bound wrapper
     *  into the legacy {@link RTResourceMap} under the resource's
     *  logical name after each compile. This is a back-compat shim
     *  for resources that historical material / system code reads
     *  via `RTResourceMap.getTexture(ctx, name)` (e.g. transmission
     *  materials looking up `_SceneColorPyramid`, GPU culling looking
     *  up `_HiZPyramid`). Should only be set when `aliasable: false`
     *  — publishing a pool-aliased wrapper to RTResourceMap would
     *  hand readers a stale pointer the next time the wrapper is
     *  reused by another logical resource. Default `false`. */
    publishToLegacyMap?: boolean;
    /** Debug label suffix forwarded to the underlying GPUTexture. */
    label?: string;
}

/**
 * Declarative description of a transient buffer. The pool reuses
 * underlying `GPUBufferBase` wrappers by `(roundedSize, usage)` bucket;
 * if a reused buffer is smaller than the new requirement, it is
 * grown in place via `GPUBufferBase.resizeBuffer(...)`.
 *
 * @group Graph
 */
export interface BufferDesc {
    /** Byte size. The pool rounds this up to the next power-of-two to
     *  reduce bucket fragmentation; use {@link createBuffer} +
     *  {@link resizeBuffer} directly for capacity-mutable use cases. */
    size: number;
    usage: GPUBufferUsageFlags;
    /** Default `true`. */
    aliasable?: boolean;
    label?: string;
}
