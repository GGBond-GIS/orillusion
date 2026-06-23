import { GPUTextureFormat } from "../gfx/graphics/webGpu/WebGPUConst";
import { Texture } from "../gfx/graphics/webGpu/core/texture/Texture";
import { TextureCube } from "../gfx/graphics/webGpu/core/texture/TextureCube";
import { Context3D } from "../gfx/graphics/webGpu/Context3D";
import { LoaderFunctions } from "../loader/LoaderFunctions";
import { BitmapTexture2D } from "./BitmapTexture2D";
import { TextureCubeFaceData } from "./TextureCubeFaceData";

/**
 * LDRTextureCube: create a cube texture, it's low dynamic range texture
 * @group Texture
 */
export class LDRTextureCube extends TextureCube {

    protected _faceData: TextureCubeFaceData;
    private _url: string;
    /**
     * constructor: create a cube texture, it's low dynamic range texture
     */

    public get ldrImageUrl() {
        return this._url;
    }
    constructor() {
        super();
        this.useMipmap = true;
        this.format = GPUTextureFormat.rgba16float;
        this._faceData = new TextureCubeFaceData(this);
    }


    /**
    * load texture data from web url, which is a 360 panorama image
    * @param url web url
    * @param loaderFunctions callback function when load complete
    */
    public async load(url: string, loaderFunctions?: LoaderFunctions, ctx?: Context3D): Promise<LDRTextureCube> {
        this._url = url;
        // Panorama LDR images are sRGB-encoded; decode to linear on sample so the
        // linear rgba16float cube holds correct values (CubeSky emits linear).
        let bitmapTexture: BitmapTexture2D = new BitmapTexture2D(false, ctx, 'srgb');
        await bitmapTexture.load(url, loaderFunctions);
        this.createFromLDRTexture(bitmapTexture, ctx);
        return this;
    }

    /**
     *
     * Create a texture cube
     * @param srcTexture The cube texture will be created from this 2D texture
     * @returns this
     */
    private createFromLDRTexture(srcTexture: Texture, ctx?: Context3D): this {
        let size = Math.log2(srcTexture.width / 4);
        size = Math.pow(2, Math.round(size));
        this.createFromTexture(size, srcTexture, ctx);
        return this;
    }

    /**
     *
     * create cube texture by environment image
     * @param size size of cube texture
     * @param texture source texture
     */
    public createFromTexture(size: number, texture: Texture, ctx?: Context3D): this {
        this.width = this.height = size;
        this.textureBindingLayout.viewDimension = 'cube';
        let mipmapSize = this.width;
        this.mipmapCount = 1;
        while (mipmapSize > 16) {
            mipmapSize /= 2;
            this.mipmapCount++;
        }

        this.createTextureDescriptor(size, size, this.mipmapCount, this.format);

        this.textureDescriptor.size = { width: size, height: size, depthOrArrayLayers: 6 };
        this.textureDescriptor.dimension = '2d';
        this._ensureBound(ctx);
        this.gpuSampler = this._boundCtx!.device.createSampler(this);

        this._faceData.uploadErpTexture(texture);
        return this;
    }




}
