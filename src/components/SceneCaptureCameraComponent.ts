import { Color } from '../math/Color';
import { Camera3D } from '../core/Camera3D';
import { RenderTexture } from '../textures/RenderTexture';
import { GBufferFrame } from '../gfx/renderJob/frame/GBufferFrame';
import { RenderContext } from '../gfx/renderJob/passRenderer/RenderContext';
import { RendererPassState } from '../gfx/renderJob/passRenderer/state/RendererPassState';
import { WebGPUDescriptorCreator } from '../gfx/graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { ComponentBase } from './ComponentBase';
import { RegisterComponent } from '../util/SerializeDecoration';
import { EntityCollect } from '../gfx/renderJob/collect/EntityCollect';
import { View3D } from '../core/View3D';

/**
 * Scene-capture update strategy.
 *
 * - `'always'` — render every frame the pass executes (default; cheapest
 *   coding-wise, most expensive GPU-wise).
 * - `'manual'` — render only when {@link SceneCaptureCameraComponent.needUpdate}
 *   is true; SceneCapturePass clears the flag after rendering.
 *
 * @group Components
 */
export type SceneCaptureUpdateMode = 'always' | 'manual';

/**
 * Off-screen camera that captures the current scene into a render
 * texture for other materials to sample. Typical uses: mirrors
 * (mirrored-camera capture sampled by a quad), security-camera
 * monitors (capture from a distant viewpoint, sampled by a TV
 * mesh), portals, picture-in-picture mini-maps.
 *
 * Architecture
 * ------------
 *
 * - Attach this component to an Object3D whose `Camera3D` should drive
 *   the capture viewpoint (the same node, or a child — the component
 *   resolves the camera lazily on `start()`).
 * - The component lazily allocates a {@link GBufferFrame} sized
 *   `width × height` the first time the pass needs it. Allocation
 *   uses the same color (rgba16float) + compress (rgba32float) +
 *   depth (depth32float) layout as the main color pass, so existing
 *   material `PassType.COLOR` pipelines bind without recompilation.
 * - The captured color texture is exposed via
 *   {@link getCaptureTexture}; bind it into any material's sampler
 *   slot to read the captured scene.
 * - On `onEnable` the component registers itself with
 *   {@link EntityCollect} (per-scene index); the bundled
 *   `SceneCapturePass` iterates the index each frame.
 *
 * Mask filtering
 * --------------
 *
 * - {@link captureMask}: bitmask of {@link RendererMask} bits that a
 *   renderer must overlap to be drawn into the capture. Default is
 *   `0xffffffff` (include every renderer).
 * - {@link excludeMask}: bitmask that, if any bit overlaps the
 *   renderer's mask, skips the renderer. Default is `0` (exclude
 *   nothing). Useful for "TV doesn't capture itself" — set a custom
 *   bit on the TV's renderer mask, then add that bit to
 *   `excludeMask`.
 *
 * The final test is `(rm & captureMask) !== 0 && (rm & excludeMask) === 0`.
 *
 * Update mode
 * -----------
 *
 * - `updateMode = 'always'` re-renders every frame the pass runs.
 * - `updateMode = 'manual'` skips re-render unless
 *   {@link needUpdate} is true; the pass clears the flag after
 *   rendering. Use for static security feeds (one-shot bake) or
 *   for app-driven cadence (every-N-frames update).
 *
 * @group Components
 */
@RegisterComponent(SceneCaptureCameraComponent, 'SceneCaptureCameraComponent')
export class SceneCaptureCameraComponent extends ComponentBase {
    /** Capture render target width in pixels. Re-allocates the
     *  internal GBuffer on the next render if changed. */
    public width: number = 512;

    /** Capture render target height in pixels. Re-allocates on
     *  change. */
    public height: number = 512;

    /** Bitwise allowlist over {@link RendererMask}. A renderer is
     *  captured only if `(node.rendererMask & captureMask) !== 0`. */
    public captureMask: number = 0xffffffff;

    /** Bitwise denylist over {@link RendererMask}. A renderer is
     *  skipped if `(node.rendererMask & excludeMask) !== 0`. */
    public excludeMask: number = 0;

    /** RGBA clear color applied to the color attachment at the start
     *  of each capture. Depth always clears to 1.0. */
    public clearColor: Color = new Color(0, 0, 0, 1);

    /** Whether to render the scene's `AtmosphericComponent` / sky into
     *  the capture. Default true. */
    public includeSky: boolean = true;

    /** Whether to render transparent renderers into the capture.
     *  Default true. */
    public includeTransparent: boolean = true;

    /** See {@link SceneCaptureUpdateMode}. */
    public updateMode: SceneCaptureUpdateMode = 'always';

    /** Manual-mode trigger. SceneCapturePass clears this back to false
     *  after rendering. Ignored when `updateMode === 'always'`. */
    public needUpdate: boolean = true;

    private _camera: Camera3D | null = null;
    private _gBuffer: GBufferFrame | null = null;
    private _rendererPassState: RendererPassState | null = null;
    private _renderContext: RenderContext | null = null;
    private _allocatedW: number = 0;
    private _allocatedH: number = 0;
    /** Stable, per-component key for {@link GBufferFrame.getGBufferFrame}.
     *  Stamped lazily so unit tests that construct the component without
     *  a scene don't pull `Math.random()` into setup. */
    private _gBufferKey: string | null = null;

    public init(): void {
        // Camera3D may be added before or after this component on the
        // same Object3D; resolve in start() (after both have been
        // registered) instead of init() to avoid order coupling.
    }

    public start(): void {
        this._camera = this.object3D.getComponent(Camera3D)
            ?? this.object3D.getComponentsInChild(Camera3D)?.[0]
            ?? null;
        if (!this._camera) {
            console.warn('[SceneCaptureCameraComponent] no Camera3D found on this Object3D or its descendants — capture will be a no-op.');
        }
    }

    public onEnable(view?: View3D): void {
        if (!view) return;
        const scene = view.scene;
        if (scene) EntityCollect.instance.addSceneCaptureCamera(scene, this);
    }

    public onDisable(view?: View3D): void {
        if (!view) return;
        const scene = view.scene;
        if (scene) EntityCollect.instance.removeSceneCaptureCamera(scene, this);
    }

    /** Active Camera3D driving the capture, or `null` if none was
     *  found at start(). SceneCapturePass skips components with a
     *  null camera. */
    public get camera(): Camera3D | null {
        return this._camera;
    }

    /** Color render-target the capture writes into (rgba16float). The
     *  internal GBuffer is lazily allocated on first call; subsequent
     *  calls return the same handle so material samplers stay bound
     *  across frames. Re-allocates if {@link width} / {@link height}
     *  changed since the last allocation.
     *
     *  Returns null when called before any render has produced a
     *  GBuffer (i.e. the component isn't enabled or the pass hasn't
     *  fired yet). Most users want the post-render value — call this
     *  after `Engine3D.startRenderView` returns or read it inside an
     *  onUpdate hook.
     */
    public getCaptureTexture(): RenderTexture | null {
        return this._gBuffer?.getColorTexture() ?? null;
    }

    /** @internal — used by SceneCapturePass to lazily allocate /
     *  reuse the per-component render target chain. */
    public _ensureRenderTargets(ctx: import('../gfx/graphics/webGpu/Context3D').Context3D): {
        gBuffer: GBufferFrame;
        rendererPassState: RendererPassState;
        renderContext: RenderContext;
    } {
        if (
            this._gBuffer &&
            this._rendererPassState &&
            this._renderContext &&
            this._allocatedW === this.width &&
            this._allocatedH === this.height
        ) {
            return {
                gBuffer: this._gBuffer,
                rendererPassState: this._rendererPassState,
                renderContext: this._renderContext,
            };
        }

        // Size-only change on an already-allocated chain: resize the
        // attached textures in place. We can't simply drop the
        // GBufferFrame cache entry and re-allocate — RTResourceMap
        // caches the color attachment by name, so a re-allocation would
        // hand back the OLD-sized color texture alongside fresh-size
        // compress/depth textures and WebGPU would reject the pass
        // ("All attachments must have the same size"). Resizing in
        // place also keeps the texture identity stable, so any material
        // that bound `getCaptureTexture()` as its `baseMap` keeps a
        // valid reference — `RenderTexture.resize` destroys+recreates
        // the underlying GPU texture, and bound shaders refresh their
        // bind groups via `_stateChangeRef` once we fire noticeChange.
        if (
            this._gBuffer &&
            this._rendererPassState &&
            this._renderContext
        ) {
            const w = this.width;
            const h = this.height;
            for (const rt of this._gBuffer.renderTargets) {
                rt.resize(w, h, ctx);
                // RenderTexture.resize destroys the GPUTexture but does
                // not fan out a change notification, so any material
                // sampling this RT keeps using its bind group built
                // against the now-dead view. noticeChange() is the
                // engine's existing reactive signal — protected on
                // Texture so we cross-call via a cast.
                (rt as any).noticeChange?.();
            }
            if (this._gBuffer.depthTexture) {
                this._gBuffer.depthTexture.resize(w, h, ctx);
                (this._gBuffer.depthTexture as any).noticeChange?.();
            }
            const colorDesc = this._gBuffer.rtDescriptors[0];
            if (colorDesc) {
                colorDesc.clearValue = [this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearColor.a];
            }
            this._allocatedW = w;
            this._allocatedH = h;
            return {
                gBuffer: this._gBuffer,
                rendererPassState: this._rendererPassState,
                renderContext: this._renderContext,
            };
        }

        if (!this._gBufferKey) {
            // instanceID stamp gives each component a unique GBuffer slot
            // in the per-context cache map. Multiple capture cameras can
            // therefore coexist with their own RT chains.
            this._gBufferKey = `sceneCapture_${(this.object3D as any).instanceID}`;
        }

        this._gBuffer = GBufferFrame.getGBufferFrame(this._gBufferKey, ctx, this.width, this.height, true, undefined, 0);
        this._rendererPassState = WebGPUDescriptorCreator.createRendererPassState(ctx, this._gBuffer);
        // Apply user clear color to the color attachment descriptor.
        const colorDesc = this._gBuffer.rtDescriptors[0];
        if (colorDesc) {
            colorDesc.clearValue = [this.clearColor.r, this.clearColor.g, this.clearColor.b, this.clearColor.a];
        }
        this._renderContext = new RenderContext(ctx, this._gBuffer);
        this._allocatedW = this.width;
        this._allocatedH = this.height;

        return {
            gBuffer: this._gBuffer,
            rendererPassState: this._rendererPassState,
            renderContext: this._renderContext,
        };
    }

    public destroy(force?: boolean): void {
        this._camera = null;
        this._gBuffer = null;
        this._rendererPassState = null;
        this._renderContext = null;
        super.destroy?.(force);
    }
}
