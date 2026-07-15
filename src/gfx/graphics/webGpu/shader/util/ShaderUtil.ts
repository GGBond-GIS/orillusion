import { Context3D } from "../../Context3D";
import { RenderShaderPass } from "../RenderShaderPass";

export type VertexPart = {
    name: string;
    vertex_in_struct: string;
    vertex_out_struct: string;
    vertex_buffer: string;
    vertex_fun: string;
    vertex_out: string;
}

export type FragmentPart = {
    name: string;
    fs_textures: string;
    fs_frament: string;
    fs_normal: string;
    fs_shadow: string;
    fs_buffer: string;
    fs_frameBuffers: string;
}

type ShaderUtilState = {
    renderShaderModulePool: Map<string, GPUShaderModule>;
    renderShader: Map<string, RenderShaderPass>;
};

/**
 * Holds the per-context caches of compiled GPU shader modules and render shader passes.
 * @group GFX
 */
export class ShaderUtil {
    /**
     * Per-Context3D shader state accessors. Device-bound GPU shader modules
     * are keyed per-device; the RenderShaderPass cache is also per-device
     * (since the passes internally hold device-bound pipelines).
     */
    public static renderShaderModulePool(ctx: Context3D): Map<string, GPUShaderModule> {
        return this._state(ctx).renderShaderModulePool;
    }
    /**
     * Get the per-context cache of render shader passes.
     * @param ctx the rendering context
     */
    public static renderShader(ctx: Context3D): Map<string, RenderShaderPass> {
        return this._state(ctx).renderShader;
    }

    private static _state(ctx: Context3D): ShaderUtilState {
        return ctx.cache(ShaderUtil, () => ({
            renderShaderModulePool: new Map<string, GPUShaderModule>(),
            renderShader: new Map<string, RenderShaderPass>(),
        }));
    }

    /**
     * Initialize the per-context shader state caches.
     * @param ctx the rendering context
     */
    public static init(ctx: Context3D) {
        this._state(ctx);
    }
}
