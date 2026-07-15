import { GPUTextureFormat } from '../gfx/graphics/webGpu/WebGPUConst';
import { ITexture } from '../gfx/graphics/webGpu/core/texture/ITexture';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
/**
 * Depth 2D TextureArray
 * @internal
 * @group Texture
 */
export class Depth2DTextureArray extends Texture implements ITexture {

    /**
     * @constructor
     * @width texture width (pixel)
     * @width texture height (pixel)
     * @width texture format, default value is depth32float
     */
    constructor(width: number, height: number, format: GPUTextureFormat = GPUTextureFormat.depth32float, numberLayer: number = 4, ctx?: Context3D) {
        super(width, height, numberLayer);

        // this.visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;

        // texture_depth_2d_array
        this.format = format;
        this.mipmapCount = 1;

        this._ensureBound(ctx);
        this.init();
    }

    internalCreateBindingLayoutDesc() {
        this.textureBindingLayout.sampleType = `depth`;
        this.textureBindingLayout.viewDimension = `2d-array`;
        // WebGPU: a depth texture with sampleType 'depth' can pair with
        // either a 'comparison' sampler or a 'non-filtering' sampler, but
        // NOT a 'filtering' sampler (no bilinear on depth). PCSS blocker
        // search uses the non-comparison path to read raw depth, so this
        // must be 'non-filtering' for pipeline validation.
        this.samplerBindingLayout.type = `non-filtering`;
        this.sampler_comparisonBindingLayout.type = `comparison`;
    }

    internalCreateTexture() {
        this.textureDescriptor = {
            format: this.format,
            size: { width: this.width, height: this.height, depthOrArrayLayers: this.numberLayer },
            dimension: '2d',
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        }
        this.gpuTexture = this.getGPUTexture();
    }

    internalCreateView() {
        this.viewDescriptor = {
            dimension: `2d-array`,
        };
        this.view = this.getGPUView();
        // this.view = this.gpuTexture.createView(this.viewDescriptor);
    }

    internalCreateSampler() {
        this._ensureBound();
        const device = this._boundCtx!.device;
        this.gpuSampler = device.createSampler({});
        // Linear filter on a sampler_comparison triggers the hardware's 2x2
        // compare-and-bilinear-filter ("free PCF") path — each
        // textureSampleCompareLevel call returns a weighted average of 4
        // sub-samples. Combined with our 9-tap 3x3 PCF, effective kernel is
        // ~5x5 with no extra tap cost. Depth textures with sampleType 'depth'
        // are allowed to pair with a 'comparison' sampler in linear mode
        // (the 'non-filtering' restriction only applies to the non-comparison
        // sampler used for PCSS blocker search).
        this.gpuSampler_comparison = device.createSampler({
            compare: 'less',
            minFilter: 'linear',
            magFilter: 'linear',
            label: "sampler_comparison"
        });
    }

}
