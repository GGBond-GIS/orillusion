import { BlurTexture2DBufferCreator } from '../gfx/generate/convert/BlurEffectCreator';
import { TextureCube } from '../gfx/graphics/webGpu/core/texture/TextureCube';
import { GPUTextureFormat } from '../gfx/graphics/webGpu/WebGPUConst';
import { TextureCubeStdCreator } from "../gfx/generate/convert/TextureCubeStdCreator";
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { StringUtil } from '../util/StringUtil';
import { BitmapTexture2D, TextureColorSpace } from './BitmapTexture2D';
import { VirtualTexture } from './VirtualTexture';

/**
 * @group Texture
 */
export class BitmapTextureCube extends TextureCube {
    private _images: HTMLCanvasElement[] | ImageBitmap[] | OffscreenCanvas[];

    private _url: string | string[];

    /** Color-space contract (see {@link TextureColorSpace}). Defaults
     *  to `'linear'` for legacy parity; pass `'srgb'` for sRGB-encoded
     *  panorama / HDR-LDR cube faces so the sampler hardware-decodes. */
    public colorSpace: TextureColorSpace;

    constructor(colorSpace: TextureColorSpace = 'linear') {
        super();
        this.useMipmap = true;
        this.colorSpace = colorSpace;
    }

    /** Picks `rgba8unorm-srgb` when `colorSpace === 'srgb'`, else
     *  `rgba8unorm`. Used at every place where the cube's `format`
     *  field used to be hard-coded to `rgba8unorm`. */
    private get _ldrFormat(): GPUTextureFormat {
        return this.colorSpace === 'srgb'
            ? GPUTextureFormat.rgba8unorm_srgb
            : GPUTextureFormat.rgba8unorm;
    }

    protected generateImages(images: HTMLCanvasElement[] | ImageBitmap[] | OffscreenCanvas[] | Texture[], ctx?: Context3D) {
        this._ensureBound(ctx);
        let device = this._boundCtx!.device;
        this.width = this.height = 32;
        if ('width' in images[0]) {
            this.width = this.height = images[0].width;
        }
        let mipmapSize = Math.min(this.width, this.height);
        this.mipmapCount = 1;
        while (mipmapSize > 16) {
            mipmapSize /= 2;
            this.mipmapCount++;
        }

        this.textureBindingLayout.viewDimension = 'cube';
        this.samplerBindingLayout.type = 'filtering';
        this.createTextureDescriptor(this.width, this.height, this.mipmapCount, this.format);

        this.textureDescriptor.size = { width: this.width, height: this.height, depthOrArrayLayers: 6 };
        this.textureDescriptor.dimension = '2d';
        // this.gpuTexture = device.createTexture(this.textureDescriptor);
        this.gpuTexture = this.getGPUTexture();

        let faceTextures: GPUTexture[] = [];
        let lastFaceTextures: GPUTexture[] = faceTextures;
        let mipWidth = this.width;
        let mipHeight = this.height;

        if (images[0] instanceof Texture) {
            for (let i = 0; i < 6; i++) {
                let t = images[i] as Texture;
                faceTextures[i] = t.getGPUTexture();
            }
            this.uploadMipmapGPUTexture(0, this.width, this.width, faceTextures);
        } else {
            this.uploadBaseImages(this.width, images as any);
            for (let i = 0; i < 6; i++) {
                let t = new BitmapTexture2D(false, this._boundCtx!, this.colorSpace);
                t.format = this.format;
                t.source = images[i] as any;
                faceTextures[i] = t.getGPUTexture();
            }
        }

        for (let i = 1; i < this.mipmapCount; i++) {
            lastFaceTextures = faceTextures;
            faceTextures = [];
            let dstBuffer = { width: mipWidth, height: mipHeight, gpuTexture: null };
            mipWidth = mipWidth / 2;
            mipHeight = mipHeight / 2;
            for (let faceId = 0; faceId < 6; faceId++) {
                dstBuffer.gpuTexture = lastFaceTextures[faceId];
                faceTextures[faceId] = BlurTexture2DBufferCreator.blurImageFromTexture(dstBuffer, mipWidth, mipHeight, false, this._boundCtx!);
            }
            this.uploadMipmapGPUTexture(i, mipWidth, mipHeight, faceTextures);
        }
        this.gpuSampler = device.createSampler(this);
    }

    private uploadBaseImages(size: number, textures: HTMLCanvasElement[] | ImageBitmap[] | OffscreenCanvas[], ctx?: Context3D) {
        this._ensureBound(ctx);
        let device = this._boundCtx!.device;
        const commandEncoder = this._boundCtx!.gpuContext.beginCommandEncoder();

        for (let i = 0; i < 6; i++) {
            device.queue.copyExternalImageToTexture(
                { source: textures[i] },
                {
                    texture: this.gpuTexture,
                    mipLevel: 0,
                    origin: { x: 0, y: 0, z: i },
                },
                { width: size, height: size, depthOrArrayLayers: 1 },
            );
        }

        this._boundCtx!.gpuContext.endCommandEncoder(commandEncoder);
    }

    private uploadMipmapGPUTexture(mip: number, width: number, height: number, textures: GPUTexture[]) {
        const commandEncoder = this._boundCtx!.gpuContext.beginCommandEncoder();

        for (let i = 0; i < 6; i++) {
            commandEncoder.copyTextureToTexture(
                {
                    texture: textures[i],
                    mipLevel: 0,
                    origin: { x: 0, y: 0, z: 0 },
                },
                {
                    texture: this.gpuTexture,
                    mipLevel: mip,
                    origin: { x: 0, y: 0, z: i },
                },
                {
                    width: width,
                    height: height,
                    depthOrArrayLayers: 1,
                },
            );
        }

        this._boundCtx!.gpuContext.endCommandEncoder(commandEncoder);
    }

    /**
     * get images of this texture
     */
    public get images(): HTMLCanvasElement[] | ImageBitmap[] | OffscreenCanvas[] {
        return this._images;
    }

    /**
    * set images of this texture
    */
    public set images(value: HTMLCanvasElement[] | ImageBitmap[] | OffscreenCanvas[]) {
        this._images = value;

        if (this._images[0] instanceof HTMLImageElement) {
            let bitmaps: ImageBitmap[] = [];
            let remain: number = 6;
            let that = this;

            function loadImage(index: number, image: HTMLImageElement) {
                image.decode().then(async () => {
                    bitmaps[index] = await createImageBitmap(image);
                    remain--;
                    if (remain == 0) {
                        that.generateImages(bitmaps);
                    }
                });
            }

            for (let i = 0; i < 6; i++) {
                loadImage(i, this._images[i] as any);
            }
        } else {
            //@bug not generate OffscreenCanvas
            if (this._images instanceof HTMLCanvasElement || this._images instanceof ImageBitmap) {
                this.generateImages(this._images);
            }
        }
    }

    /**
     * load texture data from array of web url.
     * make sure there are six images in a group,
     * and the order is: [+X, -X, +Y, -Y, +Z, -Z]
     * @param urls array of image url
     */
    public async load(urls: string[], ctx?: Context3D) {
        this._url = urls;
        if (ctx) this._ensureBound(ctx);
        let remain: number = 6;
        let bitmaps: ImageBitmap[] = [];
        this.format = this._ldrFormat;
        let that = this;

        async function loadImage(index: number, url: string) {
            const img = document.createElement('img');
            // Iframe srcdoc has document.baseURI = "about:srcdoc" AND
            // window.location.href is "about:srcdoc/" — both reject
            // `new URL(rel, base)`. The iframe's window.location.origin
            // however inherits the parent's origin (vite dev server)
            // and the assets live under that origin's public root, so
            // resolving against `${origin}/` lands on the correct file.
            img.src = /^https?:|^data:|^blob:|^\//.test(url) ? url : new URL(url, (window.parent || window).location.origin + '/').href;
            img.setAttribute('crossOrigin', '');
            await img.decode();
            bitmaps[index] = await createImageBitmap(img);
            remain--;
            if (remain == 0) {
                that.generateImages(bitmaps);
                return true;
            }
        }

        for (let i = 0; i < 6; i++) {
            await loadImage(i, urls[i]);
        }
        return true;
    }

    /**
      * load texture data from url.
      * the image is assembled from six images into cross shaped image.
      * @param url the path of image
      */
    public async loadStd(url: string, ctx?: Context3D) {
        this._url = url;
        this.format = this._ldrFormat;
        if (ctx) this._ensureBound(ctx);

        const img = document.createElement('img');
        // Same iframe-srcdoc fix as load() above — resolve relative
        // URLs against window.location.origin (which inherits the
        // parent's origin in srcdoc) so the asset lands on the dev
        // server's public root.
        img.src = /^https?:|^data:|^blob:|^\//.test(url) ? url : new URL(url, (window.parent || window).location.origin + '/').href;
        img.setAttribute('crossOrigin', '');
        await img.decode();
        let srcTexture = new BitmapTexture2D(false, this._boundCtx, this.colorSpace);
        srcTexture.name = StringUtil.getURLName(url);
        srcTexture.format = this._ldrFormat;
        srcTexture.source = await createImageBitmap(img);

        let cubeSize = Math.round(Math.log2(srcTexture.width / 4));
        cubeSize = Math.pow(2, cubeSize);
        this.width = this.height = cubeSize;

        let textureList: VirtualTexture[] = [];
        for (let i = 0; i < 6; i++) {
            let item = new VirtualTexture(cubeSize, cubeSize, this.format, false,
                GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING, 1, 0, 1, this._boundCtx);
            item.name = 'face ' + i;
            textureList.push(item);
            TextureCubeStdCreator.createFace(i, this.width, srcTexture, item);
        }
        this.generateImages(textureList);
        return true;
    }
}
