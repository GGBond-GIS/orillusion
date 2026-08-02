import { Context3D } from "../../gfx/graphics/webGpu/Context3D";
import { Texture } from "../../gfx/graphics/webGpu/core/texture/Texture";
import { GPUAddressMode } from "../../gfx/graphics/webGpu/WebGPUConst";
import { BitmapTexture2D } from "../../textures/BitmapTexture2D";
import { BitmapTexture2DArray } from "../../textures/BitmapTexture2DArray";

/**
 * One IES photometric profile, assignable to a light via
 * `LightBase.iesProfiles`. Holds only CPU-side state; the profile is
 * registered into the owning engine's IESProfilesPool when that
 * engine's light data is first uploaded (LightEntries.update), which
 * assigns `index` — the layer in the pool's texture array.
 * @group Lights
 */
export class IESProfiles {
    private _iesTexture: Texture;

    /** Layer index inside the owning pool's texture array. -1 until registered. */
    public index: number = -1;

    /**
     * Set the IES photometric texture. Can only be assigned before the
     * profile is registered into a pool; later assignments are ignored.
     */
    public set IESTexture(texture: Texture) {
        if (this._iesTexture === texture) return;
        if (this.index !== -1) {
            console.warn(`IESProfiles: texture cannot be replaced after the profile has been registered.`);
            return;
        }
        this._iesTexture = texture;
        texture.addressModeU = GPUAddressMode.repeat;
        texture.addressModeV = GPUAddressMode.repeat;
        texture.addressModeW = GPUAddressMode.repeat;
    }

    /** The assigned IES photometric texture, or undefined if none. */
    public get IESTexture(): Texture {
        return this._iesTexture;
    }
}

/**
 * Per-Context3D registry of IES profiles. Each engine owns one pool
 * (lazily created through `ctx.cache`) holding the texture array bound
 * as `iesTextureArrayMap` plus the profile -> layer assignments, so
 * sibling engines never share GPU textures or the USE_IES_PROFILE
 * shader define. The pool dies with the Context3D cache, so engine
 * teardown / device loss cannot leak a texture from a dead device.
 * @group Lights
 */
export class IESProfilesPool {
    /** Layer capacity of the texture array. */
    public static readonly MAX_PROFILES: number = 48;

    public iesTexture: BitmapTexture2DArray | null = null;
    private _profiles: IESProfiles[] = [];
    private _ctx: Context3D;

    constructor(ctx: Context3D) {
        this._ctx = ctx;
    }

    public static for(ctx: Context3D): IESProfilesPool {
        return ctx.cache(IESProfilesPool, () => new IESProfilesPool(ctx));
    }

    /** True once any profile is registered — drives the USE_IES_PROFILE shader define. */
    public get use(): boolean {
        return this._profiles.length > 0;
    }

    /**
     * Register a profile and return its texture-array layer index.
     * Idempotent for an already-registered profile. Returns -1 (no IES
     * applied) when the profile has no texture yet or the pool is full.
     */
    public register(profile: IESProfiles): number {
        const existing = this._profiles.indexOf(profile);
        if (existing !== -1) return existing;

        const texture = profile.IESTexture;
        if (!texture) return -1;
        if (this._profiles.length >= IESProfilesPool.MAX_PROFILES) {
            console.error(`IESProfilesPool: capacity (${IESProfilesPool.MAX_PROFILES}) exceeded, profile ignored.`);
            return -1;
        }
        if (!this.iesTexture) {
            this.iesTexture = new BitmapTexture2DArray(texture.width, texture.height, IESProfilesPool.MAX_PROFILES, this._ctx);
        }
        const index = this._profiles.length;
        this._profiles.push(profile);
        profile.index = index;
        this.iesTexture.addTexture(texture as BitmapTexture2D);
        return index;
    }
}
