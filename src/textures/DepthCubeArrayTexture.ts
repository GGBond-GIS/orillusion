import { GPUFilterMode, GPUTextureFormat } from '../gfx/graphics/webGpu/WebGPUConst';
import { ITexture } from '../gfx/graphics/webGpu/core/texture/ITexture';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
/**
 * depth cube array texture
 * @internal
 * @group Texture
 */
export class DepthCubeArrayTexture extends Texture implements ITexture {

    /**
     * @constructor
     */
    constructor(width: number, height: number, numberLayer: number, ctx?: Context3D) {
        super(width, height, numberLayer);

        // this.visibility = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;

        // texture_depth_2d_array
        this.format = GPUTextureFormat.depth32float;
        this.mipmapCount = 1;

        this._ensureBound(ctx);
        this.init();
    }

    internalCreateBindingLayoutDesc() {
        this.textureBindingLayout.sampleType = `depth`;
        this.textureBindingLayout.viewDimension = `cube-array`;
        // See Depth2DTextureArray for the 'non-filtering' rationale: WebGPU
        // disallows pairing a 'filtering' sampler with a depth texture.
        this.samplerBindingLayout.type = `non-filtering`;
        this.sampler_comparisonBindingLayout.type = `comparison`;
    }

    internalCreateTexture() {
        this.textureDescriptor = {
            format: this.format,
            size: { width: this.width, height: this.height, depthOrArrayLayers: 6 * this.numberLayer },
            dimension: '2d',
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
        }
        this.gpuTexture = this.getGPUTexture();
    }

    internalCreateView() {
        this.viewDescriptor = {
            dimension: `cube-array`,
        };
        this.view = this.getGPUView();
        // this.view = this.gpuTexture.createView(this.viewDescriptor);
    }

    internalCreateSampler() {
        this._ensureBound();
        const device = this._boundCtx!.device;
        // Must match samplerBindingLayout.type = 'non-filtering': nearest
        // filter on both axes. PCSS blocker search reads one texel at a
        // time anyway, so filtering gains nothing here.
        this.gpuSampler = device.createSampler({
            minFilter: GPUFilterMode.nearest,
            magFilter: GPUFilterMode.nearest,
        });
        // Cube sampler stays NEAREST on the comparison side. Reason: LINEAR
        // hardware compare on a cube depth texture interpolates across
        // texels within a face, and depending on the driver, ALSO across
        // face boundaries — producing visible radial banding on the lit
        // area of a receiver plane as the filter footprint straddles the
        // seams between the 6 faces. The 2D directional path benefits from
        // LINEAR ("free 2x2 PCF"); the cube path already takes 16 Poisson
        // taps in PointShadow_frag, so the bilinear bonus is marginal and
        // not worth the seam artefacts.
        this.gpuSampler_comparison = device.createSampler({
            compare: 'less',
            label: "sampler_comparison"
        });
    }

}
