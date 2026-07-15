import { Engine3D } from '../Engine3D';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { SpriteShader } from '../gfx/graphics/webGpu/shader/SpriteShader';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { Color } from '../math/Color';
import { Vector2 } from '../math/Vector2';
import { Vector4 } from '../math/Vector4';
import { Material } from './Material';

/**
 * Material for `SpriteRenderer` — a single textured, tinted quad in world
 * space. No lighting, no shadow, no reflection — depth-test on,
 * depth-write off, two-sided, blendMode NORMAL. Supports a
 * `distanceInvariant` flag so sprites can keep a constant on-screen size
 * as the camera moves.
 *
 * @group Material
 */
export class SpriteMaterial extends Material {

    constructor(ctx?: Context3D) {
        super();
        this.shader = new SpriteShader();
        // Declare transparent so the node lands in the transparent bucket of
        // EntityCollect. That bucket runs `autoSortRenderNodes` every frame,
        // which is what makes per-sprite `renderOrder` tweaks actually
        // restack — the opaque bucket ignores those changes.
        // `Material.transparent = true` also bumps the pass's renderOrder
        // to 3000 (the transparent-bucket boundary), so downstream
        // `RenderNode.set materials` picks up the correct bucket.
        this.transparent = true;
        // Default sprite is a white quad — callers assign texture/color later.
        this.baseMap = Engine3D.resFor(ctx).whiteTexture;
    }

    /** Set the base (albedo) texture sampled by the sprite. */
    public set baseMap(texture: Texture) {
        this.shader.setTexture(`baseMap`, texture);
    }

    /** Get the base (albedo) texture sampled by the sprite. */
    public get baseMap(): Texture {
        return this.shader.getTexture(`baseMap`);
    }

    /** Set the tint color multiplied with the base texture. */
    public set color(value: Color) {
        this.shader.setUniformColor(`color`, value);
    }

    /** Get the tint color multiplied with the base texture. */
    public get color(): Color {
        return this.shader.getUniformColor(`color`);
    }

    /** UV sub-region as (offsetX, offsetY, scaleX, scaleY) in [0,1] texture space. */
    public set uvRect(value: Vector4) {
        this.shader.setUniformVector4(`uvRect`, value);
    }

    /** Get the UV sub-region as (offsetX, offsetY, scaleX, scaleY) in [0,1] texture space. */
    public get uvRect(): Vector4 {
        return this.shader.getUniformVector4(`uvRect`);
    }

    /** Quad size in world units (meters). */
    public set size(value: Vector2) {
        this.shader.setUniformVector2(`size`, value);
    }

    /** Get the quad size in world units (meters). */
    public get size(): Vector2 {
        return this.shader.getUniformVector2(`size`);
    }

    /** Set the pivot point (anchor) of the quad in normalized [0,1] space. */
    public set pivot(value: Vector2) {
        this.shader.setUniformVector2(`pivot`, value);
    }

    /** Get the pivot point (anchor) of the quad in normalized [0,1] space. */
    public get pivot(): Vector2 {
        return this.shader.getUniformVector2(`pivot`);
    }

    /**
     * When true, the sprite's on-screen size stays constant regardless of
     * camera distance (the vertex shader scales local position by the
     * distance from camera to the sprite's origin, divided by a reference
     * distance). Useful for world-space UI labels that need to stay
     * readable as the camera pans/zooms.
     */
    public set distanceInvariantSize(value: boolean) {
        this.shader.setUniformFloat(`distanceInvariant`, value ? 1.0 : 0.0);
    }

    /** Get whether the sprite keeps a constant on-screen size regardless of camera distance. */
    public get distanceInvariantSize(): boolean {
        return this.shader.getUniformFloat(`distanceInvariant`) > 0.5;
    }

    /** Rounded-corner radius in world units (same as `size`). 0 disables. */
    public set cornerRadius(value: number) {
        this.shader.setUniformFloat(`cornerRadius`, value);
    }

    /** Get the rounded-corner radius in world units. */
    public get cornerRadius(): number {
        return this.shader.getUniformFloat(`cornerRadius`);
    }

    /** Toggle the video-texture code path. SpriteRenderer sets this automatically when the texture is a `VideoTexture`. */
    public set useVideoTexture(value: boolean) {
        this.shader.setDefine(`USE_VIDEO_TEXTURE`, value);
    }

    /** Get whether the video-texture code path is enabled. */
    public get useVideoTexture(): boolean {
        return this.shader.getDefine(`USE_VIDEO_TEXTURE`);
    }

    /** No-op setter; sprites do not sample an environment map. */
    public set envMap(_texture: Texture) {
        // sprites don't sample environment
    }

    /** No-op setter; sprites do not receive shadows. */
    public set shadowMap(_texture: Texture) {
        // sprites don't receive shadow
    }
}
