import { GPUAddressMode, GPUFilterMode } from '../../WebGPUConst';
import { TextureMipmapGenerator } from './TextureMipmapGenerator';
import { Context3D, bindCtx, resolveDefaultCtx } from '../../Context3D';

/**
 * Texture — CPU-authoritative scene-graph object (Plan B).
 *
 * `gpuTexture`, `view`, `gpuSampler`, `gpuSampler_comparison` are
 * single-slot fields materialized lazily on first access. The first
 * access binds this Texture to exactly one `Context3D` via `bindCtx()`;
 * subsequent use from a different engine throws. To share the CPU
 * descriptor across engines, clone the Texture.
 *
 * @group GFX
 */
export class Texture implements GPUSamplerDescriptor {

    /** The Context3D this texture is bound to. Set on first GPU use. */
    public _boundCtx: Context3D | null = null;

    /**
     * Ensure this texture is bound to a Context3D and return it. Resolution
     * order: explicit arg, prior `bindCtx()`, then the single-engine default
     * (same contract as Engine3D._defaultContext() for no-arg material
     * constructors). Throws only when the choice is ambiguous — no engine
     * yet, or several engines alive without an explicit ctx.
     */
    public _ensureBound(ctx?: Context3D): Context3D {
        if (ctx) { bindCtx(this, ctx); return ctx; }
        if (this._boundCtx) return this._boundCtx;
        const fallback = resolveDefaultCtx();
        if (fallback) { bindCtx(this, fallback); return fallback; }
        throw new Error(`Texture(${this.constructor.name}) used before bindCtx — with zero or multiple engines alive, thread a Context3D from the owning Engine3D.`);
    }

    /**
     * name of texture
     */
    public name: string;

    /**
     * source url
     */
    public url: string;

    /**
     * Single GPU texture slot. Reads auto-materialize on first access
     * when a descriptor is set: creates the GPUTexture on `_boundCtx` and
     * replays the cached source image upload (if any). Bound to one
     * Context3D for the lifetime of the texture.
     */
    private _gpuTexture: GPUTexture | null = null;
    /** Latch guarding against re-entrant auto-mipmap generation on the 2D path. */
    private _mipmapMaterialized: boolean = false;
    protected get gpuTexture(): GPUTexture {
        if (!this._gpuTexture && this.textureDescriptor) {
            this._ensureBound();
            this._gpuTexture = this._boundCtx!.device.createTexture(this.textureDescriptor);
            this._uploadSourceImage(this._gpuTexture);
            // Auto-mipmap only for single-layer 2D textures. Cube / 2d-array
            // / cube-array textures have their own mipmap pipeline (e.g.
            // TextureCubeFaceData.generateMipmap → IBLEnvMapCreator). The
            // generic 2D `webGPUGenerateMipmap` creates default-dimension
            // views (defaults to `2d-array` on a 6-layer texture) and binds
            // them into a shader layout that declares `Cube` — which emits
            // the "dimension doesn't match Cube" and "layer count > 1"
            // WebGPU validation warnings. Also re-enters this getter, so a
            // latch guards against recursion on the 2D path.
            if (this.useMipmap && !this._mipmapMaterialized && this._isAutoMipmappable()) {
                this._mipmapMaterialized = true;
                TextureMipmapGenerator.webGPUGenerateMipmap(this);
            }
        }
        return this._gpuTexture;
    }
    protected set gpuTexture(v: GPUTexture) {
        this._gpuTexture = v ?? null;
    }

    /**
     * Single-layer 2D textures can go through the generic render-to-mip
     * pipeline. Anything else (cube, 2d-array, cube-array, 3d) manages its
     * own mipmap chain.
     */
    protected _isAutoMipmappable(): boolean {
        const layers = this.textureDescriptor?.size?.['depthOrArrayLayers'] ?? 1;
        const dim = this.textureDescriptor?.dimension ?? '2d';
        return dim === '2d' && layers === 1;
    }

    /**
     * Return index in texture array
     */
    public pid: number;

    /**
     * Single GPU texture view slot. Auto-materializes from `viewDescriptor`
     * on first access when `gpuTexture` is a real GPUTexture.
     */
    private _view: GPUTextureView | GPUExternalTexture | null = null;
    public get view(): GPUTextureView | GPUExternalTexture {
        if (!this._view && this.viewDescriptor) {
            const t = this.gpuTexture;
            if (t instanceof GPUTexture) {
                this._view = t.createView(this.viewDescriptor);
                if (this.name) (this._view as GPUTextureView).label = this.name;
            }
        }
        return this._view;
    }
    public set view(v: GPUTextureView | GPUExternalTexture) {
        this._view = v ?? null;
    }

    /**
     * Single GPU sampler slot. Auto-materializes using this Texture as its
     * own GPUSamplerDescriptor on first access.
     */
    private _gpuSampler: GPUSampler | null = null;
    public get gpuSampler(): GPUSampler {
        if (!this._gpuSampler) {
            this._ensureBound();
            this._gpuSampler = this._boundCtx!.device.createSampler(this);
        }
        return this._gpuSampler;
    }
    public set gpuSampler(v: GPUSampler) {
        this._gpuSampler = v ?? null;
    }

    /**
     * Single GPU comparison sampler slot. Auto-materializes with
     * `compare: 'less'` (or `_compare`) on first access.
     */
    private _gpuSampler_cmp: GPUSampler | null = null;
    public get gpuSampler_comparison(): GPUSampler {
        if (!this._gpuSampler_cmp) {
            this._ensureBound();
            this._gpuSampler_cmp = this._boundCtx!.device.createSampler({
                compare: this._compare || 'less',
                label: 'sampler_comparison',
            });
        }
        return this._gpuSampler_cmp;
    }
    public set gpuSampler_comparison(v: GPUSampler) {
        this._gpuSampler_cmp = v ?? null;
    }

    /**
     * GPUTextureFormat
     */
    public format: GPUTextureFormat;

    /**
     * GPUTextureUsage
     */
    public usage: GPUFlagsConstant;

    /**
     * texture width
     */
    public width: number = 4;

    /**
     * texture height
     */
    public height: number = 4;

    /**
     * depth or layers, default value is 1
     */
    public depthOrArrayLayers: number = 1;

    /**
     * depth or layers, default value is 1
     */
    public numberLayer: number = 1;

    /**
     * GPUTextureViewDescriptor
     */
    public viewDescriptor: GPUTextureViewDescriptor;

    /**
     * GPUTextureDescriptor
     */
    public textureDescriptor: GPUTextureDescriptor;

    /**
     * GPUShaderStage
     */
    public visibility: number = GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;


    /**
     * GPUTextureBindingLayout, contains viewDimension and multisampled
     */
    public textureBindingLayout: GPUTextureBindingLayout = {
        viewDimension: `2d`,
        multisampled: false,
    };

    /**
     * GPUSamplerBindingLayout
     */
    public samplerBindingLayout: GPUSamplerBindingLayout = {
        type: `filtering`,
    };

    /**
     * GPUSamplerBindingLayout
     */
    public sampler_comparisonBindingLayout: GPUSamplerBindingLayout = {
        type: `comparison`,
    };

    /**
     * whether to flip the image on the y-axis
     */
    public flipY: boolean;

    /**
     *  whether is video texture
     */
    public isVideoTexture?: boolean;
    /**
     * whether this texture holds HDR (high dynamic range) image data
     */
    public isHDRTexture?: boolean;

    /** Backing field for {@link useMipmap}. */
    private _useMipmap: boolean = false;

    /** Cached CPU source image, replayed onto the GPU texture when it is (re)materialized. */
    private _sourceImageData: HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

    //****************************************/
    /** Backing field for the U-coordinate address mode (see {@link addressModeU}). */
    private _addressModeU?: GPUAddressMode;

    /** Backing field for the V-coordinate address mode (see {@link addressModeV}). */
    private _addressModeV?: GPUAddressMode;

    /**
     * Specifies the {{GPUAddressMode|address modes}} for the texture width, height, and depth
     * coordinates, respectively.
     */
    private _addressModeW?: GPUAddressMode;

    /**
     * Specifies the sampling behavior when the sample footprint is smaller than or equal to one
     * texel.
     */
    private _magFilter?: GPUFilterMode;

    /**
     * Specifies the sampling behavior when the sample footprint is larger than one texel.
     */
    private _minFilter?: GPUFilterMode;

    /**
     * Specifies behavior for sampling between mipmap levels.
     */
    private _mipmapFilter?: GPUMipmapFilterMode;

    /**
     * Specifies the minimum level of detail used internally when sampling a texture.
     */
    private _lodMinClamp?: number;

    /**
     * Specifies the minimum and maximum levels of detail, respectively, used internally when
     * sampling a texture.
     */
    private _lodMaxClamp?: number;

    /**
     * When provided the sampler will be a comparison sampler with the specified
     * {@link GPUCompareFunction}.
     * Note: Comparison samplers may use filtering, but the sampling results will be
     * implementation-dependent and may differ from the normal filtering rules.
     */
    private _compare?: GPUCompareFunction;

    /**
     * Specifies the maximum anisotropy value clamp used by the sampler.
     * Note: Most implementations support {@link GPUSamplerDescriptor#maxAnisotropy} values in range
     * between 1 and 16, inclusive. The used value of {@link GPUSamplerDescriptor#maxAnisotropy} will
     * be clamped to the maximum value that the platform supports.
     */
    private _maxAnisotropy?: number;

    /**
     *  mipmap Count, default value is 1
     */
    public mipmapCount: number = 1;

    /** Flag set when the mipmap state changes, signalling the texture needs rebuilding. */
    protected _textureChange: boolean = false;

    /**
     * Create a texture2D
     * @param width size of texture width
     * @param height height of texture width
     * @param numberLayer number layer of texture
     * @returns
     */
    constructor(width: number = 32, height: number = 32, numberLayer: number = 1) {
        this.width = width;
        this.height = height;
        this.numberLayer = numberLayer;

        this.minFilter = GPUFilterMode.linear;
        this.magFilter = GPUFilterMode.linear;
        this.mipmapFilter = GPUFilterMode.linear;
        this.addressModeU = GPUAddressMode.repeat;
        this.addressModeV = GPUAddressMode.repeat;
        // this.visibility = GPUShaderStage.FRAGMENT;
    }

    /**
     * Run the optional internal create hooks (binding layout, texture, view,
     * sampler) if a subclass provides them.
     * @returns this texture, for chaining
     */
    public init(): this {
        let self = this;
        if (self[`internalCreateBindingLayoutDesc`]) {
            self[`internalCreateBindingLayoutDesc`]();
        }
        if (self[`internalCreateTexture`]) {
            self[`internalCreateTexture`]();
        }
        if (self[`internalCreateView`]) {
            self[`internalCreateView`]();
        }
        if (self[`internalCreateSampler`]) {
            self[`internalCreateSampler`]();
        }
        return this;
    }

    /**
     * creatTextureDescriptor
     */
    protected createTextureDescriptor(
        width: number,
        height: number,
        mipLevelCount: number,
        format: GPUTextureFormat,
        usage: number = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING,
        sizeCount: number = 1,
        sampleCount: number = 0,
    ) {
        // sRGB-encoded LDR formats are not in the WebGPU
        // storage-binding-capable list; requesting STORAGE_BINDING
        // on them throws a validation error at GPUTexture create.
        // BitmapTexture2D / BitmapTextureCube switched to
        // `rgba8unorm-srgb` for hardware sRGB decode; they never
        // need to be storage-bound (storage-write paths run on
        // separate compute RTs in `rgba16float` / `rgba8unorm`),
        // so it's safe to drop the bit unconditionally for sRGB
        // formats.
        if (typeof format === 'string' && format.endsWith('-srgb')) {
            usage &= ~GPUTextureUsage.STORAGE_BINDING;
        }
        this.width = width;
        this.height = height;
        this.format = format;
        this.usage = usage;
        this.textureDescriptor = {
            size: [width, height, sizeCount],
            mipLevelCount: mipLevelCount,
            format: format,
            usage: usage,
            label: `${this.name + this.width + this.height + this.format}`
        };

        if (sampleCount > 0) {
            this.textureDescriptor.sampleCount = sampleCount;
        }

        if (sizeCount > 1) {
            this.viewDescriptor = {
                format: format,
                dimension: `2d-array`,
            };
        } else {
            this.viewDescriptor = {
                format: format,
                dimension: this.textureBindingLayout.viewDimension,
                mipLevelCount: mipLevelCount,
                baseMipLevel: 0
            };
        }
    }

    /**
     * Derive the texture size from the given source image and (re)create the
     * GPU texture from it.
     * @param imageBitmap source image to upload into the texture
     */
    protected generate(imageBitmap: HTMLCanvasElement | ImageBitmap | OffscreenCanvas) {
        let width = 32;
        let height = 32;

        if ('width' in imageBitmap) {
            width = imageBitmap.width;
            height = imageBitmap.height;
        }

        if (width < 32 || height < 32) {
            console.warn(imageBitmap['name'] + 'Size must be greater than 32!');
        }

        this.width = width;
        this.height = height;

        // this.visibility = GPUShaderStage.FRAGMENT;

        this.createTexture(imageBitmap);
    }

    /**
     * Cache the source image and rebuild the texture descriptor, then
     * invalidate the materialized GPU resources so consumers rebind.
     * @param imageBitmap source image to cache for later GPU upload
     */
    private createTexture(imageBitmap: HTMLCanvasElement | ImageBitmap | OffscreenCanvas) {
        this._sourceImageData = imageBitmap;
        this.updateTextureDescription();

        // Descriptor + source image only — do NOT materialize the GPUTexture
        // here. The owning Context3D is often unknown at texture-load time
        // (e.g. `new BitmapTexture2D(); await tex.load(url)`); forcing
        // `this.gpuTexture` now would hit _ensureBound() before the texture
        // is threaded into a material/engine. First real GPU access from a
        // bound consumer creates the texture, uploads `_sourceImageData`,
        // and generates mipmaps (see the gpuTexture getter).
        this.updateGPUTexture();

        // Tell downstream consumers (material bind groups) that this texture's
        // underlying GPU resource is gone and needs rebinding. Without this,
        // `UIUtil.updateTextTexture(tex, ...)` silently leaves the pipeline
        // reading the destroyed view — visible on screen as "HP slider
        // doesn't change the label".
        this.noticeChange();
    }

    /**
     * Upload the cached source image (if any) into the given GPU texture.
     * Called from the gpuTexture getter when materializing the GPU texture
     * on first access.
     */
    private _uploadSourceImage(tex: GPUTexture) {
        if (!this._sourceImageData) return;
        this._ensureBound();
        this._boundCtx!.device.queue.copyExternalImageToTexture(
            { source: this._sourceImageData },
            { texture: tex },
            [this.width, this.height],
        );
    }

    /**
     * enable/disable mipmap
     */
    public get useMipmap(): boolean {
        return this._useMipmap;
    }

    /**
     * get mipmap
     */
    public set useMipmap(value: boolean) {
        if (value) {
            this.samplerBindingLayout.type = 'filtering';
            if (this._useMipmap == false && this._sourceImageData) {
                this._useMipmap = true;
                this.updateTextureDescription();
                this.updateGPUTexture();

                if (this.gpuTexture instanceof GPUTexture) {
                    TextureMipmapGenerator.webGPUGenerateMipmap(this);
                }
            }
        } else {
            this.samplerBindingLayout.type = 'non-filtering';
            if (this._useMipmap == true && this._sourceImageData) {
                this._useMipmap = false;
                this.updateTextureDescription();
                this.updateGPUTexture();
                // gpuTexture getter re-uploads _sourceImageData on access.
                void this.gpuTexture;
            }
        }

        this._textureChange = true;
        this._useMipmap = value;
        this.noticeChange();
    }

    /**
     * the cached CPU source image used to (re)upload the GPU texture
     */
    public get sourceImageData() {
        return this._sourceImageData;
    }

    /**
     * Compute the full mipmap chain length for the current texture size.
     * @returns number of mip levels
     */
    public getMipmapCount() {
        let w = this.width;
        let h = this.height;
        let maxSize = Math.max(w, h);
        return 1 + Math.log2(maxSize) | 0;
    }

    /**
     * Recompute the mip level count and rebuild the texture descriptor.
     */
    protected updateTextureDescription() {
        // let mipmapCount = this.useMipmap ? Math.floor(Math.log2(this.width)) : 1;
        this.mipmapCount = Math.floor(this.useMipmap ? this.getMipmapCount() : 1);
        this.createTextureDescriptor(this.width, this.height, this.mipmapCount, this.format);
    }

    /**
     * Destroy the materialized GPU texture and invalidate the cached view and
     * samplers so they re-materialize lazily from the current descriptor.
     */
    protected updateGPUTexture() {
        // Descriptor changed: destroy the materialized GPU texture and
        // invalidate the view/samplers. Next access re-materializes lazily
        // from the current descriptor via the getters.
        if (this._gpuTexture instanceof GPUTexture) {
            try { this._gpuTexture.destroy(); } catch { /* ignore */ }
        }
        this._gpuTexture = null;
        this._view = null;
        this._gpuSampler = null;
        this._gpuSampler_cmp = null;
        this._mipmapMaterialized = false;
    }

    /**
     * create or get GPUTexture (delegates to the per-context gpuTexture
     * getter, which handles lazy creation + source-image upload).
     */
    public getGPUTexture() {
        return this.gpuTexture;
    }

    /**
     * create or get GPUTextureView (delegates to the per-context view
     * getter, which handles lazy creation from `viewDescriptor`).
     */
    public getGPUView(_index: number = 0): GPUTextureView | GPUExternalTexture {
        return this.view;
    }

    /** Registered state-change callbacks, keyed by their owner reference. */
    protected _stateChangeRef: Map<any, Function> = new Map();

    /**
     * Register a callback invoked when this texture's GPU resources change.
     * @param fun callback to invoke on change
     * @param ref owner reference used as the key for later unbinding
     */
    public bindStateChange(fun: Function, ref: any) {
        this._stateChangeRef.set(ref, fun);
    }

    /**
     * Remove a previously registered state-change callback.
     * @param ref owner reference used when binding the callback
     */
    public unBindStateChange(ref: any) {
        this._stateChangeRef.delete(ref);
    }

    /**
     * Drop the cached samplers and notify all registered listeners that this
     * texture's descriptor changed.
     */
    protected noticeChange() {
        // Descriptor-affecting change: drop cached samplers so the next
        // access rebuilds from the updated GPUSamplerDescriptor.
        this._gpuSampler = null;
        this._gpuSampler_cmp = null;
        this._stateChangeRef.forEach((v) => {
            v();
        });
    }

    /**
     * release the materialized texture and all GPU slots
     */
    public destroy(force?: boolean) {
        if (force) {
            if (this._gpuTexture instanceof GPUTexture) {
                try { this._gpuTexture.destroy(); } catch { /* ignore */ }
            }
            this._gpuTexture = null;
            this._view = null;
            this._gpuSampler = null;
            this._gpuSampler_cmp = null;
            this._boundCtx = null;
            this.textureBindingLayout = null;
            this.textureDescriptor = null;
        }
        this._stateChangeRef.clear();
    }

    /**
     * Sampler address mode for the U (width) texture coordinate.
     */
    public get addressModeU(): GPUAddressMode {
        return this._addressModeU;
    }

    public set addressModeU(value: GPUAddressMode) {
        if (this._addressModeU != value) {
            this._addressModeU = value;
            this.noticeChange();
        }
    }

    /**
     * Sampler address mode for the V (height) texture coordinate.
     */
    public get addressModeV(): GPUAddressMode {
        return this._addressModeV;
    }

    public set addressModeV(value: GPUAddressMode) {
        if (this._addressModeV != value) {
            this._addressModeV = value;
            this.noticeChange();
        }
    }

    /**
     * Sampler address mode for the W (depth) texture coordinate.
     */
    public get addressModeW(): GPUAddressMode {
        return this._addressModeW;
    }

    public set addressModeW(value: GPUAddressMode) {
        if (this._addressModeW != value) {
            this._addressModeW = value;
            this.noticeChange();
        }
    }

    /**
     * Sampling filter used when the sample footprint is smaller than or equal
     * to one texel (magnification).
     */
    public get magFilter(): GPUFilterMode {
        return this._magFilter;
    }

    public set magFilter(value: GPUFilterMode) {
        if (this._magFilter != value) {
            this._magFilter = value;
            this.noticeChange();
        }
    }

    /**
     * Sampling filter used when the sample footprint is larger than one texel
     * (minification).
     */
    public get minFilter(): GPUFilterMode {
        return this._minFilter;
    }

    public set minFilter(value: GPUFilterMode) {
        if (this._minFilter != value) {
            this._minFilter = value;
            this.noticeChange();
        }
    }

    /**
     * Filter used when sampling between mipmap levels.
     */
    public get mipmapFilter(): GPUMipmapFilterMode {
        return this._mipmapFilter;
    }

    public set mipmapFilter(value: GPUMipmapFilterMode) {
        if (this._mipmapFilter != value) {
            this._mipmapFilter = value;
            this.noticeChange();
        }
    }

    /**
     * Minimum level-of-detail clamp used internally when sampling.
     */
    public get lodMinClamp(): number {
        return this._lodMinClamp;
    }

    public set lodMinClamp(value: number) {
        if (this._lodMinClamp != value) {
            this._lodMinClamp = value;
            this.noticeChange();
        }
    }

    /**
     * Maximum level-of-detail clamp used internally when sampling.
     */
    public get lodMaxClamp(): number {
        return this._lodMaxClamp;
    }

    public set lodMaxClamp(value: number) {
        if (this._lodMaxClamp != value) {
            this._lodMaxClamp = value;
            this.noticeChange();
        }
    }

    /**
     * Comparison function; when set the sampler becomes a comparison sampler.
     */
    public get compare(): GPUCompareFunction {
        return this._compare;
    }

    public set compare(value: GPUCompareFunction) {
        if (this._compare != value) {
            this._compare = value;
            this.noticeChange();
        }
    }

    /**
     * Maximum anisotropy clamp used by the sampler.
     */
    public get maxAnisotropy(): number {
        return this._maxAnisotropy;
    }

    public set maxAnisotropy(value: number) {
        if (this._maxAnisotropy != value) {
            this._maxAnisotropy = value;
            this.noticeChange();
        }
    }

    /**
     * Per-context list of GPU textures queued for deferred destruction.
     * @param ctx the context whose pending-destroy list is returned
     * @returns the context-scoped list of textures awaiting destruction
     */
    private static _texs(ctx: Context3D): GPUTexture[] {
        return ctx.cache(Texture, () => [] as GPUTexture[]);
    }
    /**
     * Queue a GPU texture for deferred destruction on the given context.
     * @param ctx the owning context
     * @param tex the GPU texture to destroy later
     */
    public static delayDestroyTexture(ctx: Context3D, tex: GPUTexture) {
        let list = this._texs(ctx);
        if (!list.includes(tex)) {
            list.push(tex);
        }
    }

    /**
     * Destroy all GPU textures queued for deferred destruction on the context.
     * @param ctx the context whose queued textures are destroyed
     */
    public static destroyTexture(ctx: Context3D) {
        let list = this._texs(ctx);
        if (list.length > 0) {
            while (list.length > 0) {
                list.shift().destroy();
            }
        }
    }
}
