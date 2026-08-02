import { Context3D } from "../../graphics/webGpu/Context3D";

/**
 * Voxel Cone Tracing GI (skeleton).
 *
 * Pure compute-shader GI alternative to DDGI. Steps:
 *   1. Voxelize the scene each N frames into a 3D storage texture
 *      (256³ rgba16float, ~256MB — tune by scene scale).
 *   2. Compute mip chain of the voxel volume (radiance pyramid).
 *   3. Per fragment, cone-trace 5-9 cones along the hemisphere; sum
 *      sampled radiance weighted by occlusion. Specular = single
 *      narrow cone along reflection direction.
 *
 * **Status — skeleton**: this class allocates the voxel volume
 * texture and provides `init()` / `dispose()`. The voxelization
 * compute, mip generation, and cone-trace shaders are the multi-week
 * follow-up. Documented for the architecture sweep so consumers can
 * see the intended seam (`engine.setting.gi.algo = 'vct'`).
 *
 * Compared to DDGI (already implemented):
 *   + Specular cone trace gives glossy GI without separate SSR
 *   + Single 3D texture vs probe array's many 2D layers
 *   - Higher memory cost
 *   - Needs voxelization pass (DDGI uses ray-marched probes)
 *
 * @group GFX
 */
export class VoxelConeTracingGI {
    private readonly _ctx: Context3D;
    private readonly _resolution: number;

    constructor(ctx: Context3D, resolution: number = 128) {
        this._ctx = ctx;
        this._resolution = resolution;
    }

    public init(): void {
        // device.createTexture({
        //     size: [_resolution, _resolution, _resolution],
        //     dimension: '3d',
        //     format: 'rgba16float',
        //     usage: STORAGE_BINDING | TEXTURE_BINDING | COPY_DST,
        //     mipLevelCount: 1 + Math.floor(Math.log2(_resolution)),
        // });
        void this._ctx;
        void this._resolution;
    }

    public dispose(): void { /* todo */ }
}
