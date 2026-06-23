/**
 * Layer-mask helpers for renderable classification.
 *
 * The engine treats `RenderNode.visibleLayer` as an opaque 32-bit
 * mask (one bit per logical layer) and does NOT assign any semantic
 * meaning to specific bits — projects define their own enums to give
 * bits meaning. Only three universally meaningful values are
 * reserved here:
 *
 *   - `None    = 0`          no layer membership; special renderers
 *                            (Sky, Reflection, Graphic3D) and
 *                            explicitly-hidden nodes use this.
 *   - `Default = 1 << 0`     bit 0; the implicit layer for any node
 *                            that hasn't been assigned to a project-
 *                            specific layer. Built-in passes accept
 *                            it so untouched code keeps rendering.
 *   - `All     = 0xFFFFFFFF` all bits set; the implicit value for
 *                            {@link RenderGraphPass.layerMask} and
 *                            {@link Camera3D.cullingMask}.
 *
 * Application code should occupy bits 1..31 and leave bit 0 untouched
 * so untouched legacy objects (which default to `Default`) remain
 * rendered by any pass whose `layerMask` includes bit 0 (which `All`
 * does).
 *
 * Visibility rule applied at pass execute time:
 *
 *     (node.visibleLayer & pass.layerMask & camera.cullingMask) !== 0
 *
 * All three masks must share at least one set bit for the node to be
 * drawn by that pass through that camera.
 *
 * @group GFX
 */
export namespace VisibleLayer {
    /** No layer membership. Used by special renderers that bypass the
     *  layer-bucket index entirely (Sky / Reflection / Graphic3D) and
     *  by nodes the application wants temporarily hidden. */
    export const None: number = 0;

    /** Default layer (bit 0). Applied to any new {@link RenderNode} so
     *  un-migrated code keeps the old "draw everything" behavior. By
     *  convention, applications should not use bit 0 for their own
     *  layers — reserve it for "unassigned / legacy". */
    export const Default: number = 1 << 0;

    /** All 32 bits set. Default for {@link RenderGraphPass.layerMask}
     *  and {@link Camera3D.cullingMask}. */
    export const All: number = 0xFFFFFFFF;

    /** Set the bits of `m` in `src`. */
    export function add(src: number, m: number): number { return (src | m) >>> 0; }

    /** Clear the bits of `m` in `src`. */
    export function remove(src: number, m: number): number { return (src & ~m) >>> 0; }

    /** Any-match test: returns true when `src` and `m` share at least
     *  one set bit. Standard "is this layer in the camera's culling
     *  mask" semantics. */
    export function has(src: number, m: number): boolean { return (src & m) !== 0; }
}

/**
 * Class-style facade over the {@link VisibleLayer} namespace functions,
 * mirroring the `RendererMaskUtil` convention already used elsewhere
 * in the engine. Both forms compile to the same operations — pick
 * whichever reads better at the call site.
 *
 * @internal
 * @group GFX
 */
export class VisibleLayerUtil {
    public static addMask(src: number, tag: number): number { return VisibleLayer.add(src, tag); }
    public static removeMask(src: number, tag: number): number { return VisibleLayer.remove(src, tag); }
    public static hasMask(m1: number, m2: number): boolean { return VisibleLayer.has(m1, m2); }
}
