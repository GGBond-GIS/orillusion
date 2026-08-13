import { Sprite, SpriteModifyFlags } from '../../assets/Sprite';
import { Object3D } from '../../core/entities/Object3D';
import { GeometryBase } from '../../core/geometry/GeometryBase';
import { PlaneGeometry } from '../../shape/PlaneGeometry';
import { Context3D } from '../../gfx/graphics/webGpu/Context3D';
import { Texture } from '../../gfx/graphics/webGpu/core/texture/Texture';
import { Color } from '../../math/Color';
import { Matrix4 } from '../../math/Matrix4';
import { Vector2 } from '../../math/Vector2';
import { Vector3 } from '../../math/Vector3';
import { Vector4 } from '../../math/Vector4';
import { SpriteMaterial } from '../../materials/SpriteMaterial';
import { RegisterComponent } from '../../util/SerializeDecoration';
import { Raycaster } from '../../io/Raycaster';
import type { RaycastHit } from '../../io/RaycastHit';
import { RenderNode } from './RenderNode';

/**
 * Component that renders a `Sprite` asset as a textured quad in world
 * space. Pair with a `BillboardComponent` on the same Object3D if the
 * quad should face the camera (name tags, HP bars, POI icons). For
 * screen-space UI use DOM / HTML instead — sprites are intentionally
 * scoped to the 3D scene (RFC-005).
 *
 * Size is expressed in world units (meters). Optional
 * `distanceInvariantSize` keeps on-screen size constant as the camera
 * moves, useful for labels that need to stay readable.
 *
 * @group Components
 */
@RegisterComponent(SpriteRenderer, 'SpriteRenderer')
export class SpriteRenderer extends RenderNode {
    /** Bound Sprite asset. Never mutated by this renderer — per-instance tweaks live in the override fields below. */
    private _sprite: Sprite | null = null;
    /** Auto-managed Sprite backing the `setTexture()` ergonomics. Created lazily when the user assigns a bare texture. */
    private _autoSprite: Sprite | null = null;
    /** Bound change listener reference so we can unbind cleanly. */
    private _spriteListener: (flags: SpriteModifyFlags) => void;

    // Per-renderer overrides that survive sprite-asset swaps. `null` = fall
    // through to the bound sprite's own field. This is how `set pivot(v)` /
    // `set uvRect(v)` remain local to a renderer even when `this.sprite =
    // otherAsset` re-binds.
    private _pivotOverride: Vector2 | null = null;
    private _uvRectOverride: Vector4 | null = null;

    private _pendingColor: Color | null = null;
    private _pendingCornerRadius: number | null = null;
    /** Quad size in world units (meters). Defaults to (1, 1). */
    private _size: Vector2 = new Vector2(1, 1);
    private _distanceInvariantSize: boolean = false;

    constructor() {
        super();
        this._spriteListener = (flags) => this._onSpriteChange(flags);
    }

    public init(param?: any) {
        super.init(param);
        this.renderOrder = 3000;
    }

    /** Shared unit quad on the Z axis, cached per Context3D. */
    private static _sharedQuad(ctx: Context3D): GeometryBase {
        return ctx.cache(SpriteRenderer, () => new PlaneGeometry(1, 1, 1, 1, Vector3.Z_AXIS));
    }

    public onEnable(): void {
        if (!this._geometry || this._materials.length === 0) {
            this._ensureResources();
        }
        super.onEnable();
    }

    public onDisable(): void {
        super.onDisable();
    }

    private _ensureResources(): void {
        const ctx = this.transform?.view3D?.engine3D?.context3D;
        if (!ctx) return;
        if (!this._geometry) {
            this.geometry = SpriteRenderer._sharedQuad(ctx);
        }
        if (this._materials.length === 0) {
            const mat = new SpriteMaterial(ctx);
            this.material = mat;
            this._applySpriteToMaterial();
            this._applyOverridesToMaterial();
        }
    }

    // ---------- Sprite binding ----------

    /** The bound `Sprite` asset. `null` until either `sprite` is set explicitly or a shortcut setter runs. */
    public get sprite(): Sprite | null {
        return this._sprite;
    }

    public set sprite(value: Sprite | null) {
        if (this._sprite === value) return;
        if (this._sprite) this._sprite.offChange(this._spriteListener);
        this._sprite = value;
        if (value) {
            value.onChange(this._spriteListener);
        }
        // NOTE: per-renderer overrides (_pivotOverride / _uvRectOverride / _size
        // / color / distanceInvariantSize) intentionally survive an asset swap.
        this._applySpriteToMaterial();
    }

    /**
     * Shortcut: bind a bare texture as the sprite. The first call creates a
     * private auto-managed `Sprite`; subsequent calls update its texture in
     * place without allocating a new Sprite.
     */
    public setTexture(texture: Texture): void {
        if (!this._autoSprite) {
            this._autoSprite = new Sprite({ texture });
        } else {
            this._autoSprite.texture = texture;
        }
        if (this._sprite !== this._autoSprite) this.sprite = this._autoSprite;
    }

    /** Shortcut: assign a `Sprite` from a texture (auto-managed private sprite). */
    public set texture(tex: Texture) {
        this.setTexture(tex);
    }

    public get texture(): Texture | null {
        return this._sprite?.texture ?? null;
    }

    /**
     * Anchor point in [0,1]². Stored as a per-renderer override; the bound
     * sprite asset stays untouched. Swapping `sprite` preserves this.
     */
    public get pivot(): Vector2 {
        return this._pivotOverride ?? this._sprite?.pivot ?? new Vector2(0.5, 0.5);
    }

    public set pivot(value: Vector2) {
        if (!this._pivotOverride) this._pivotOverride = new Vector2();
        this._pivotOverride.set(value.x, value.y);
        this._applyPivotToMaterial();
    }

    /**
     * UV sub-region as normalized `(offsetX, offsetY, scaleX, scaleY)`.
     * Stored as a per-renderer override.
     */
    public get uvRect(): Vector4 {
        return this._uvRectOverride ?? this._sprite?.region ?? new Vector4(0, 0, 1, 1);
    }

    public set uvRect(value: Vector4) {
        if (!this._uvRectOverride) this._uvRectOverride = new Vector4();
        this._uvRectOverride.set(value.x, value.y, value.z, value.w);
        this._applyUVRectToMaterial();
    }

    // ---------- Per-renderer overrides ----------

    /** Rendering color (multiplied with the sampled texel). */
    public get color(): Color | null {
        return this._spriteMaterial()?.color ?? this._pendingColor;
    }

    public set color(value: Color) {
        const mat = this._spriteMaterial();
        if (mat) mat.color = value; else this._pendingColor = value;
    }

    /** Render size in world units (meters). */
    public get size(): Vector2 {
        return this._size;
    }

    public set size(value: Vector2) {
        this._size.set(value.x, value.y);
        this._applySize();
    }

    /**
     * When true, the quad's on-screen size stays constant regardless of
     * camera distance. Works by scaling local vertex position with the
     * camera-to-sprite distance in the vertex shader.
     */
    public get distanceInvariantSize(): boolean {
        return this._distanceInvariantSize;
    }

    public set distanceInvariantSize(value: boolean) {
        this._distanceInvariantSize = value;
        const mat = this._spriteMaterial();
        if (mat) mat.distanceInvariantSize = value;
    }

    /**
     * Rounded-corner radius in the same world units as `size`. 0 disables
     * the rounding. The quad edge fades to 0 alpha via a signed-distance
     * mask — useful for card-style labels / icons in world space.
     */
    public get cornerRadius(): number {
        const mat = this._spriteMaterial();
        return mat ? mat.cornerRadius : (this._pendingCornerRadius ?? 0.0);
    }

    public set cornerRadius(value: number) {
        const mat = this._spriteMaterial();
        if (mat) mat.cornerRadius = value; else this._pendingCornerRadius = value;
    }

    // ---------- Material / visibility ----------

    public get material(): SpriteMaterial {
        return this._spriteMaterial();
    }

    public set material(value: SpriteMaterial) {
        this.materials = [value];
        this._applySpriteToMaterial();
        this._applyOverridesToMaterial();
    }

    /** Alias for `enable` — `visible = false` stops rendering without destroying the component. */
    public get visible(): boolean { return this.enable; }
    public set visible(value: boolean) { this.enable = value; }

    /**
     * Ray pick in `ray` mode: intersects the sprite's world quad. The size /
     * pivot are applied in the vertex shader, so the pickable rectangle is
     * the unit quad scaled by `size` and centered at `(0.5 - pivot) * size`
     * in local space (matches the shader's `(unitPos + 0.5 - pivot) * size`);
     * the world matrix carries the object transform plus any
     * `BillboardComponent` orientation.
     */
    public raycast(raycaster: Raycaster, intersects: RaycastHit[]) {
        if (!this.enable || !this._geometry || !this._spriteMaterial()) return;

        // NOTE: no world-bounds pre-cull here — the shared quad geometry has
        // unit bounds (±0.5), while the rendered/pickable quad is `size`
        // (applied in the vertex shader), so a bound pre-cull would reject
        // hits outside the tiny unit box. The quad-plane test below is exact.

        // convert the ray to the sprite's local space
        Raycaster._initScratch();
        Raycaster._matrix.copy(this.transform.worldMatrix).invert();
        Raycaster._localRay.copy(raycaster.ray).applyMatrix(Raycaster._matrix);
        Raycaster._localRay.direction.normalize();

        // intersect the z=0 quad plane
        const dirZ = Raycaster._localRay.direction.z;
        if (Math.abs(dirZ) < 1e-8) return; // ray parallel to the quad
        const t = -Raycaster._localRay.origin.z / dirZ;
        if (t < 0) return;
        const lx = Raycaster._localRay.origin.x + Raycaster._localRay.direction.x * t;
        const ly = Raycaster._localRay.origin.y + Raycaster._localRay.direction.y * t;

        // the quad spans [(0.5-pivot) - 0.5, (0.5-pivot) + 0.5] * pickSize in
        // local space — same transform the vertex shader applies. When
        // `distanceInvariantSize` is on, the shader additionally scales the
        // quad by `camDist / 10` to keep a constant on-screen size (three.js
        // does the same with `sizeAttenuation = false`, scaling by the camera
        // depth); the pickable rectangle must match, or the hit region drifts
        // from the rendered sprite.
        const pivot = this.pivot;
        let pickSize = this._size;
        if (this.distanceInvariantSize) {
            const camDist = Vector3.distance(raycaster.ray.origin, this.transform.worldPosition);
            pickSize = new Vector2(this._size.x * (camDist / 10), this._size.y * (camDist / 10));
        }
        const cx = (0.5 - pivot.x) * pickSize.x;
        const cy = (0.5 - pivot.y) * pickSize.y;
        const hw = pickSize.x / 2;
        const hh = pickSize.y / 2;
        if (lx < cx - hw || lx > cx + hw || ly < cy - hh || ly > cy + hh) return;

        // world hit point & distance
        const point = Raycaster._pointWorld.copy(Raycaster._localRay.origin).addScaledVector(Raycaster._localRay.direction, t);
        Matrix4.transformPoint(this.transform.worldMatrix, point, point);
        const distance = Vector3.distance(raycaster.ray.origin, point);
        if (distance < raycaster.near || distance > raycaster.far) return;

        // sprite normal: +Z in local space, transformed to world
        const normal = new Vector3(0, 0, 1);
        Matrix4.transformVector(this.transform.worldMatrix, normal, normal);
        normal.normalize();

        // uv from the local hit position (quad uv spans 0..1)
        const uv = new Vector2((lx - (cx - hw)) / pickSize.x, (ly - (cy - hh)) / pickSize.y);

        intersects.push({
            distance: distance,
            point: point.clone(),
            object: this.object3D,
            faceIndex: -1, // sprites have no mesh faces (three.js leaves it undefined)
            uv: uv,
            normal: normal,
        });
    }

    // ---------- Internal ----------

    private _spriteMaterial(): SpriteMaterial | null {
        return (this._materials[0] as SpriteMaterial) ?? null;
    }

    private _applySpriteToMaterial() {
        const mat = this._spriteMaterial();
        if (!mat || !this._sprite) return;
        const sprite = this._sprite;

        if (sprite.texture) {
            const isVideo = (sprite.texture as any)?.isVideoTexture === true;
            if (mat.useVideoTexture !== isVideo) mat.useVideoTexture = isVideo;
            mat.baseMap = sprite.texture;
        }

        this._applyUVRectToMaterial();
        this._applyPivotToMaterial();
        this._applySize();
    }

    private _applyPivotToMaterial() {
        const mat = this._spriteMaterial();
        if (!mat) return;
        const p = this._pivotOverride ?? this._sprite?.pivot;
        if (!p) return;
        mat.pivot = new Vector2(p.x, p.y);
    }

    private _applyUVRectToMaterial() {
        const mat = this._spriteMaterial();
        if (!mat) return;
        const r = this._uvRectOverride ?? this._sprite?.region;
        if (!r) return;
        mat.uvRect = new Vector4(r.x, r.y, r.z, r.w);
    }

    private _applyOverridesToMaterial() {
        const mat = this._spriteMaterial();
        if (!mat) return;
        if (this._pendingColor) mat.color = this._pendingColor;
        if (this._pendingCornerRadius !== null) mat.cornerRadius = this._pendingCornerRadius;
        mat.distanceInvariantSize = this._distanceInvariantSize;
    }

    private _applySize() {
        const mat = this._spriteMaterial();
        if (!mat) return;
        mat.size = new Vector2(this._size.x, this._size.y);
    }

    private _onSpriteChange(_flags: SpriteModifyFlags) {
        if (!this._spriteMaterial()) return;
        // Asset mutations re-apply everything except fields masked by a
        // per-renderer override — those stay locked to the override value.
        this._applySpriteToMaterial();
    }

    public cloneTo(obj: Object3D): void {
        const renderer = obj.addComponent(SpriteRenderer);
        renderer.copyComponent(this);
    }

    public copyComponent(from: this): this {
        super.copyComponent(from);
        if (from._sprite) this.sprite = from._sprite;
        if (from._pivotOverride) this.pivot = from._pivotOverride;
        if (from._uvRectOverride) this.uvRect = from._uvRectOverride;
        this.size = from._size;
        if (from.color) this.color = from.color.clone();
        this.cornerRadius = from.cornerRadius;
        this.distanceInvariantSize = from._distanceInvariantSize;
        return this;
    }
}
