import { Object3D } from '../core/entities/Object3D';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { Color } from '../math/Color';
import { Quaternion } from '../math/Quaternion';
import { Vector3 } from '../math/Vector3';
import { ComponentBase } from './ComponentBase';

const TMP_VEC3 = new Vector3();
const TMP_QUAT = new Quaternion();
const UP_AXIS = new Vector3(0, 1, 0);

/**
 * Projected-decal volume component.
 *
 * Attach to an Object3D whose `localScale = (footprintX, depth, footprintZ)`
 * spans the volume that the decal projects through. The decal pass uses
 * the host transform's world matrix as the volume's model matrix, then
 * stencil-marks pixels of the opaque scene that fall inside that volume
 * and composites the assigned texture into `_ColorBuffer`.
 *
 * Pipeline integration: enable via `Engine3D.setting.render.decals = true`.
 * When enabled, {@link ForwardRendererJob} inserts a
 * {@link DecalShadowVolumePass} between the opaque/transmission passes
 * and the transparent pass — decals draw on top of opaque terrain.
 *
 * Occlusion is a composition concern, not a decal concern: if specific
 * meshes (e.g. tall buildings standing in a decal footprint) should
 * occlude the projection, the application controls that through the
 * RenderGraph — exclude those meshes from `ColorPass.layerMask` and
 * draw them in a user-defined pass after `DecalShadowVolumePass`. See
 * `samples/render/Sample_DecalShadowVolume.ts` for the pattern.
 *
 * Usage:
 *
 *     const obj = new Object3D();
 *     obj.localPosition = ...;                          // volume center
 *     obj.localScale = new Vector3(w, depth, w);        // xz = footprint, y = extrusion
 *     DecalComponent.alignTopToward(obj, surfaceNormal); // local +Y → surface normal
 *     obj.addComponent(DecalComponent, { texture, tint });
 *     scene.addChild(obj);
 *
 * @group Components
 */
export class DecalComponent extends ComponentBase {
    /** Decal texture sampled in the composite pass. Any engine
     *  {@link Texture} works — load images with
     *  `Engine3D.res.loadTexture(url, …, 'srgb')` for a pooled
     *  {@link BitmapTexture2D}, or feed a Canvas2D source via
     *  `bitmapTexture.source = canvas`. Swapping at runtime is allowed
     *  — the pass rebuilds the texture view on the next frame. */
    public texture: Texture | null = null;

    /** Tint multiplier (RGB) and alpha multiplier (A) applied in the FS. */
    public tint: Color = new Color(1, 1, 1, 1);

    /** Maximum angle (degrees) between the volume's local +Y and the
     *  receiving surface's normal for the decal to project onto it.
     *  90 (the default) disables the filter entirely so the decal wraps
     *  every face it touches. Smaller values restrict the decal to
     *  faces roughly aligned with decal-up — closer to a rigid "stamp". */
    public maxAngleDeg: number = 90;

    /** Orient `obj`'s local +Y to point along `normal` (world space).
     *  Convenience helper for placing a decal on a curved surface. */
    public static alignTopToward(obj: Object3D, normal: Vector3): void {
        const n = TMP_VEC3.copy(normal);
        if (n.length < 1e-6) return;
        n.normalize();
        obj.localQuaternion = TMP_QUAT.setFromUnitVectors(UP_AXIS, n);
    }

    public init(param?: { texture?: Texture; tint?: Color; maxAngleDeg?: number }): void {
        if (param?.texture) this.texture = param.texture;
        if (param?.tint) this.tint = param.tint;
        if (param?.maxAngleDeg !== undefined) this.maxAngleDeg = param.maxAngleDeg;
    }
}
