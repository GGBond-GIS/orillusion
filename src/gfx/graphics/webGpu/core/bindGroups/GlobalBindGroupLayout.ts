import { Context3D } from "../../Context3D";

/**
 * Provides the shared bind group layout for global render data, cached per context.
 * @group GFX
 */
export class GlobalBindGroupLayout {
    /**
     * Get the cached global data bind group layout for the given context.
     * @param ctx the rendering context
     */
    public static getGlobalDataBindGroupLayout(ctx: Context3D): GPUBindGroupLayout {
        return ctx.cache(GlobalBindGroupLayout, () => {
            let entries: GPUBindGroupLayoutEntry[] = [];
            entries.push({
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                buffer: {
                    type: 'uniform',
                },
            });

            entries.push({
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                buffer: {
                    type: 'read-only-storage',
                },
            });

            return ctx.device.createBindGroupLayout({ entries });
        });
    }
}
