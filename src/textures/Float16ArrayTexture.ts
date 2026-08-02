import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { TextureMipmapGenerator } from '../gfx/graphics/webGpu/core/texture/TextureMipmapGenerator';
import { GPUTextureFormat } from '../gfx/graphics/webGpu/WebGPUConst';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { toHalfFloat } from '../util/Convert';
/**
 * @internal
 * Float16Array texture
 * @group Texture
 */
export class Float16ArrayTexture extends Texture {
    public uint16Array: Uint16Array;
    public floatArray: number[];
    private _dataBuffer: GPUBuffer;
    /**
     * fill this texture by array of numbers;the format as [red0, green0, blue0, alpha0, red1, green1, blue1, alpha1...]
     * @param width assign the texture width
     * @param height assign the texture height
     * @param numbers color of each pixel
     * @param useMipmap  whether or not gen mipmap
     * @returns
     */
    public create(width: number, height: number, numbers: number[] = null, mipmap: boolean = true, ctx?: Context3D): this {
        if (numbers == null) {
            numbers = [];
            for (let i = 0, c = width * height * 4; i < c; i++) {
                numbers[i] = 0;
            }
        }
        this.updateTexture(width, height, numbers, mipmap, ctx);
        return this;
    }

    /**
     * validate the change of this texture
     */
    public updateTexture(width: number, height: number, numbers: number[], mipmap: boolean = true, ctx?: Context3D) {
        if (width != this.width || height != this.height) {
            this._dataBuffer && this._dataBuffer.destroy();
            this._dataBuffer = null;
            this.gpuTexture && this.gpuTexture.destroy();
            this.gpuTexture = null;
        }

        this.floatArray = numbers;
        this._ensureBound(ctx);
        let device = this._boundCtx!.device;
        const bytesPerRow = width * 4 * 2;
        this.format = GPUTextureFormat.rgba16float;

        this.mipmapCount = Math.floor(mipmap ? Math.log2(width) : 1);
        this.createTextureDescriptor(width, height, this.mipmapCount, this.format);
        if (!this.uint16Array || this.uint16Array.length != numbers.length) {
            this.uint16Array = new Uint16Array(numbers.length);
        }
        let uint16Array = this.uint16Array;
        for (let i = 0, c = uint16Array.length; i < c; i++) {
            uint16Array[i] = toHalfFloat(numbers[i]);
        }
        const textureDataBuffer = (this._dataBuffer = device.createBuffer({
            size: uint16Array.byteLength,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        }));

        device.queue.writeBuffer(textureDataBuffer, 0, uint16Array as BufferSource);
        const commandEncoder = this._boundCtx!.gpuContext.beginCommandEncoder();
        commandEncoder.copyBufferToTexture(
            {
                buffer: textureDataBuffer,
                bytesPerRow: bytesPerRow,
            },
            {
                texture: this.getGPUTexture(),
            },
            {
                width: width,
                height: height,
                depthOrArrayLayers: 1,
            },
        );
        if (!this.useMipmap) {
            this.samplerBindingLayout.type = `filtering`;
            this.textureBindingLayout.sampleType = `float`;
        }
        this._boundCtx!.gpuContext.endCommandEncoder(commandEncoder);

        // this.sampler.minFilter = `nearest`;
        // this.sampler.magFilter = `nearest`;
        // this.sampler.mipmapFilter = `nearest`;
        // this.sampler.maxAnisotropy = 0.5 ;
        // this.bindingSampler.type = `non-filtering`;
        // this.bindingTexture.sampleType = `unfilterable-float`;

        this.gpuSampler = device.createSampler(this);
        this.gpuTexture = this.getGPUTexture();

        if (this.mipmapCount > 1) TextureMipmapGenerator.webGPUGenerateMipmap(this);
    }
}
