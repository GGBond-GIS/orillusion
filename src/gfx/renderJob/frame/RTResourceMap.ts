import { RTResourceConfig } from '../config/RTResourceConfig';
import { RenderTexture } from '../../../textures/RenderTexture';
import { Context3D } from '../../graphics/webGpu/Context3D';

/**
 * Per-instance render-target registry. Each Engine3D/Context3D owns its
 * own registry; static methods require the owning Context3D explicitly.
 * @internal
 */
export class RTResourceMap {

    private static _registries: WeakMap<Context3D, RTResourceMap> = new WeakMap();

    public rtTextureMap: Map<string, RenderTexture> = new Map();

    public static forContext(ctx: Context3D): RTResourceMap {
        let reg = this._registries.get(ctx);
        if (!reg) {
            reg = new RTResourceMap();
            this._registries.set(ctx, reg);
        }
        return reg;
    }

    public static createRTTexture(ctx: Context3D, name: string, rtWidth: number, rtHeight: number, format: GPUTextureFormat, useMipmap: boolean = false, sampleCount: number = 0) {
        let reg = this.forContext(ctx);
        let rt: RenderTexture = reg.rtTextureMap.get(name);
        if (!rt) {
            if (name == RTResourceConfig.colorBufferTex_NAME) {
                rt = new RenderTexture(rtWidth, rtHeight, format, useMipmap, undefined, 1, sampleCount, false, true, ctx);
            } else {
                rt = new RenderTexture(rtWidth, rtHeight, format, useMipmap, undefined, 1, sampleCount, true, true, ctx);
            }
            rt.name = name;
            reg.rtTextureMap.set(name, rt);
        }
        return rt;
    }

    public static createRTTextureArray(ctx: Context3D, name: string, rtWidth: number, rtHeight: number, format: GPUTextureFormat, length: number = 1, useMipmap: boolean = false, sampleCount: number = 0) {
        let reg = this.forContext(ctx);
        let rt: RenderTexture = reg.rtTextureMap.get(name);
        if (!rt) {
            rt = new RenderTexture(rtWidth, rtHeight, format, useMipmap, undefined, length, sampleCount, true, true, ctx);
            rt.name = name;
            reg.rtTextureMap.set(name, rt);
        }
        return rt;
    }

    public static getTexture(ctx: Context3D, name: string) {
        return this.forContext(ctx).rtTextureMap.get(name);
    }

    public static CreateSplitTexture(ctx: Context3D, id: string) {
        let colorTex = this.getTexture(ctx, RTResourceConfig.colorBufferTex_NAME);
        let tex = this.getTexture(ctx, id + "_split");
        if (!tex) {
            tex = this.createRTTexture(ctx, id + "_split", colorTex.width, colorTex.height, colorTex.format, false);
        }
        return tex;
    }

    public static WriteSplitColorTexture(ctx: Context3D, id: string) {
        let colorTex = this.getTexture(ctx, RTResourceConfig.colorBufferTex_NAME);
        let tex = this.getTexture(ctx, id + "_split");
        const gpu = ctx.gpuContext;
        const commandEncoder = gpu.beginCommandEncoder();
        commandEncoder.copyTextureToTexture(
            {
                texture: colorTex.getGPUTexture(),
                mipLevel: 0,
                origin: { x: 0, y: 0, z: 0 },
            },
            {
                texture: tex.getGPUTexture(),
                mipLevel: 0,
                origin: { x: 0, y: 0, z: 0 },
            },
            {
                width: tex.width,
                height: tex.height,
                depthOrArrayLayers: 1,
            },
        );
        gpu.endCommandEncoder(commandEncoder);
    }
}
