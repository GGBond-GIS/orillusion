import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { Vector2 } from '../math/Vector2';
import { Vector4 } from '../math/Vector4';

/**
 * Change-notification flags emitted when a field of a `Sprite` asset
 * mutates. Consumers subscribe via `Sprite.onChange`.
 *
 * @group Assets
 */
export enum SpriteModifyFlags {
    texture = 1 << 0,
    region = 1 << 1,
    pivot = 1 << 2,
}

export type SpriteChangeListener = (flags: SpriteModifyFlags) => void;

/**
 * Sprite — 2D image **asset**. Describes what to render: a region of a
 * texture and a default anchor pivot.
 *
 * A Sprite is data, not a component. One Sprite can be shared by many
 * `SpriteRenderer` components — renderers subscribe to change
 * notifications via `onChange` so updating the shared sprite propagates
 * to every instance that binds it. Pair with `TextureAtlas.get(name)` to
 * get sprites directly from a packed atlas.
 *
 * Per-instance tweaks (size, pivot override, color, flips) live on the
 * `SpriteRenderer` component; the Sprite asset only describes the
 * underlying image data.
 *
 * @group Assets
 */
export class Sprite {
    /** Optional name, typically the atlas region id this sprite came from. */
    public name: string = '';

    private _texture: Texture | null = null;
    /** Normalized sub-rect of `texture` in UV space — (offsetX, offsetY, scaleX, scaleY). */
    private _region: Vector4 = new Vector4(0, 0, 1, 1);
    /** Default anchor point in [0,1]² — (0.5, 0.5) = centered. Renderers can override. */
    private _pivot: Vector2 = new Vector2(0.5, 0.5);

    private _listeners: SpriteChangeListener[] = [];

    constructor(opts?: {
        texture?: Texture;
        region?: Vector4;
        pivot?: Vector2;
        name?: string;
    }) {
        if (opts) {
            if (opts.texture) this._texture = opts.texture;
            if (opts.region) this._region.copy(opts.region);
            if (opts.pivot) this._pivot.copy(opts.pivot);
            if (opts.name) this.name = opts.name;
        }
    }

    /** Source texture for this sprite. */
    public get texture(): Texture | null { return this._texture; }
    /** Set the source texture, notifying listeners on change. */
    public set texture(value: Texture | null) {
        if (this._texture !== value) {
            this._texture = value;
            this._dispatch(SpriteModifyFlags.texture);
        }
    }

    /** Normalized sub-rect of the texture in UV space — (offsetX, offsetY, scaleX, scaleY). */
    public get region(): Vector4 { return this._region; }
    /** Set the UV region (copied), notifying listeners. */
    public set region(v: Vector4) {
        this._region.copy(v);
        this._dispatch(SpriteModifyFlags.region);
    }

    /** Default anchor point in [0,1]² — (0.5, 0.5) = centered. */
    public get pivot(): Vector2 { return this._pivot; }
    /** Set the pivot (copied), notifying listeners. */
    public set pivot(v: Vector2) {
        this._pivot.copy(v);
        this._dispatch(SpriteModifyFlags.pivot);
    }

    /** Subscribe to sprite field changes. Renderers use this to invalidate their cached UV data. */
    public onChange(fn: SpriteChangeListener): void {
        if (this._listeners.indexOf(fn) < 0) this._listeners.push(fn);
    }

    /** Unsubscribe a previously registered change listener. */
    public offChange(fn: SpriteChangeListener): void {
        const i = this._listeners.indexOf(fn);
        if (i >= 0) this._listeners.splice(i, 1);
    }

    private _dispatch(flags: SpriteModifyFlags): void {
        const arr = this._listeners;
        for (let i = 0; i < arr.length; i++) arr[i](flags);
    }

    /** Shallow clone — texture is shared (not duplicated), all vector fields are copied. */
    public clone(): Sprite {
        const out = new Sprite();
        out.name = this.name;
        out._texture = this._texture;
        out._region.copy(this._region);
        out._pivot.copy(this._pivot);
        return out;
    }

    /** Convenience: build a Sprite from a bare texture, full region, centered pivot. */
    public static fromTexture(texture: Texture, name?: string): Sprite {
        return new Sprite({ texture, name });
    }
}
