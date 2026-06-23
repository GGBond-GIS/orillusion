import { Context3D } from "./Context3D";

/**
 * Per-context cache of shared render pipelines, keyed by shader variant.
 * @group GFX
 */
export class PipelinePool {
    private static map(ctx: Context3D) {
        return ctx.cache(PipelinePool, () => new Map<string, GPURenderPipeline>());
    }

    /**
     * Get a shared render pipeline for the given shader variant, or null if not cached.
     * @param ctx the rendering context
     * @param shaderVariant the shader variant key
     */
    public static getSharePipeline(ctx: Context3D, shaderVariant: string) {
        let pipeline = this.map(ctx).get(shaderVariant);
        if (pipeline) {
            return pipeline;
        } else {
            return null;
        }
    }

    public static setSharePipeline(ctx: Context3D, shaderVariant: string, pipeline: GPURenderPipeline) {
        this.map(ctx).set(shaderVariant, pipeline);
    }
}
