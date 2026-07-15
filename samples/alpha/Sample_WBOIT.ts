import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    CameraUtil,
    Color,
    DirectLight,
    Engine3D,
    HoverCameraController,
    KelvinUtil,
    LambertMaterial,
    LitMaterial,
    Material,
    MeshRenderer,
    Object3D,
    PostProcessingComponent,
    Scene3D,
    SolidColorSky,
    SphereGeometry,
    TAAPost,
    UnLitMaterial,
    View3D,
} from "@orillusion/core";

type Mode = 'sorted' | 'weighted' | 'depth-peel' | 'hash';
type MaterialType = 'unlit' | 'pbr' | 'lambert';

// Materials we use here all expose a glTF-style `alphaMode` setter
// (added in src/materials/{LitMaterial,UnLitMaterial,LambertMaterial}.ts).
// Material is the engine base class that lacks alphaMode/oitMode in its
// public type; declare the narrow shape we actually call against.
type AlphaMaterial = Material & {
    alphaMode: 'OPAQUE' | 'MASK' | 'BLEND' | 'HASH';
    oitMode: 'sorted' | 'weighted' | 'depth-peel';
    baseColor: Color;
    doubleSide: boolean;
};

/**
 * Transparency-algorithm showcase: 3×3×3 grid of 27 translucent spheres
 * rendered through an orthographic camera against a black background.
 * Ortho removes perspective foreshortening as a depth cue, so the only
 * thing telling you which sphere is in front is fragment ordering —
 * exactly the signal we're comparing.
 *
 * Three GUI modes, exercising three different algorithms:
 *
 *   - `sorted` (alphaMode='BLEND', oitMode='sorted'):
 *     classic back-to-front per-MESH sort with alpha-blend over. Each
 *     sphere is sorted as a single unit by its centre depth; at sphere
 *     intersection circles half the fragments blend in the wrong order.
 *     Inside each sphere triangles draw in geometry order, NOT depth
 *     order — at oblique camera angles the sphere's latitude rings
 *     show up as horizontal banding (the back hemisphere's fragments
 *     can land on top of the front's because depth-write is off).
 *
 *   - `weighted` (alphaMode='BLEND', oitMode='weighted'):
 *     WBOIT (McGuire & Bavoil 2013). Order-INDEPENDENT — every fragment
 *     contributes via additive accum / multiplicative reveal, regardless
 *     of draw order. Intersection-circle artifacts and the in-sphere
 *     banding vanish; trade-off is the whole cluster looks "averaged"
 *     / softer because depth ordering is intentionally thrown away.
 *
 *   - `hash` (alphaMode='HASH'):
 *     Stochastic transparency (Wyman 2017). Each fragment compares its
 *     alpha against a hash of its world position; below threshold →
 *     discard, above → solid opaque write (depth & color). No sorting,
 *     no blending, depth-correct. Single-frame output is a dithered
 *     noise pattern; TAA's sub-pixel camera jitter shifts the hash
 *     each frame and the temporal blend converges to true alpha.
 *     This sample auto-attaches TAAPost so the convergence is visible.
 *
 * Engine wiring: `setting.render.useOIT = true` bakes the OIT features
 * into the frame graph; the GUI toggle flips every material's
 * `alphaMode` (BLEND vs HASH) and `oitMode` (sorted vs weighted).
 */
class Sample_WBOIT {
    engine: Engine3D;
    scene: Scene3D;
    view: View3D;

    private sphereMaterials: AlphaMaterial[] = [];
    private sphereObjs: Object3D[] = [];
    private palette: Color[] = [];

    private params = {
        mode: 'sorted' as Mode,
        material: 'pbr' as MaterialType,
        alpha: 0.8,
        radius: 1.0,
        xySpacing: 2.0,
        zSpacing: 2.0,
        doubleSide: false,
        roughness: 0.3,
        frustumSize: 14,
    };

    private camera!: ReturnType<typeof CameraUtil.createCamera3DObject>;

    private _initMode: Mode = (() => {
        const m = (globalThis as any).__VERIFY_MODE;
        return (m === 'sorted' || m === 'weighted' || m === 'depth-peel' || m === 'hash') ? m : 'sorted';
    })();

    async run() {

        this.engine = await Engine3D.init({
            setting: {
                render: { debug: false, useOIT: true } as any,
                shadow: { enable: false, type: 'HARD' },
            },
        });

        GUIHelp.init();

        this.scene = new Scene3D();
        this.camera = CameraUtil.createCamera3DObject(this.scene);
        this.camera.perspective(45, this.engine.aspect, 0.5, 2000.0);
        // Yaw/pitch off-axis so the 3×3×3 cube's depth layers separate
        // visually. Distance set so the cluster fills the frame.
        this.camera.object3D.addComponent(HoverCameraController).setCamera(25, -15, 16);

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = this.camera;
        this.engine.startRenderView(this.view);

        // TAA is the convergence engine for `hash` mode (sub-pixel
        // camera jitter shifts the per-fragment hash every frame, and
        // the history blend averages the noise into smooth alpha). It
        // does no harm to `sorted` / `weighted`, so we always-on it.
        const post = this.scene.addComponent(PostProcessingComponent);
        post.addPost(TAAPost);

        this.params.mode = this._initMode;
        this.palette = this.generatePalette(27);

        await this.initScene();
        this.initGUI();

        // Debug hook for the alpha-sweep probe (test/multi/_wboit_probe.mjs).
        // Exposes the params + the same update path the GUI uses, so the
        // probe can drive alpha / mode / material exactly the way a user
        // would. No-op in normal sample usage; remove before committing to
        // main if you want to keep the surface lean.
        (globalThis as any).__wboit = {
            setAlpha: (v: number) => {
                this.params.alpha = v;
                this.updateMaterials();
            },
            setMode: (m: Mode) => {
                this.params.mode = m;
                for (const mat of this.sphereMaterials) this.applyModeToMaterial(mat, m);
            },
            setMaterial: (mt: MaterialType) => {
                this.params.material = mt;
                this.buildSpheres();
            },
            params: this.params,
        };
        // Direct sample reference for probes that need to mutate
        // sphereMaterials / sphereObjs without going through the
        // helper API (e.g. test bare oitMode flip).
        (globalThis as any).__wboit_sample = this;
    }

    async initScene() {
        // One DirectLight + a uniform-grey IBL cube. UnLit ignores both,
        // Lambert uses both for diffuse + env irradiance, PBR uses both
        // for full GGX BRDF + IBL. Background stays black because no
        // SkyRenderer is attached — the cubemap drives lighting only.
        //
        // Light rotation matches the camera's general direction
        // (yaw 25° / pitch -15° / distance 16) so the surfaces facing
        // the camera are also the surfaces facing the light. Earlier
        // settings put the light on the opposite side of the scene,
        // leaving every visible sphere fragment with NdotL ≈ 0 → only
        // the ambient term contributed, and the whole cluster looked
        // washed-grey regardless of mode/material/alpha.
        //
        // Intensity 3.0 + ambient 0.3 places the lit-side per-channel
        // contribution near 1.0 in linear, which lands in ACES's
        // saturated knee (output ~0.7) — bright and saturated without
        // the >1 plateau where adjacent channels round to white. The
        // shadow side stays visible thanks to the 30% ambient floor.
        const lightObj = new Object3D();
        lightObj.rotationX = 25;
        lightObj.rotationY = 45;
        const dl = lightObj.addComponent(DirectLight);
        dl.lightColor = KelvinUtil.color_temperature_to_rgb(6500);
        dl.intensity = 2.0;
        dl.castShadow = false;
        this.scene.addChild(lightObj);

        this.scene.envMap = new SolidColorSky(
            new Color(0.2, 0.2, 0.2, 1.0),
            this.engine.context3D,
        );

        this.buildSpheres();
    }

    /** Construct a fresh material of the requested type. Each sphere
     *  gets its own material instance so per-sphere palette colours are
     *  preserved and EntityCollect's `Reference` map tracks them
     *  individually. */
    private createMaterial(): AlphaMaterial {
        switch (this.params.material) {
            case 'pbr':
                return new LitMaterial() as unknown as AlphaMaterial;
            case 'lambert':
                return new LambertMaterial() as unknown as AlphaMaterial;
            default:
                return new UnLitMaterial() as unknown as AlphaMaterial;
        }
    }

    /**
     * (Re)build the 3×3×3 sphere lattice. Geometry depends on `radius`,
     * positions depend on `xySpacing` / `zSpacing` — when the user
     * drags those sliders we tear down and rebuild rather than try to
     * mutate live transforms / geometry slot-by-slot.
     */
    private buildSpheres() {
        // Aggressive teardown: removeChild alone leaves the
        // RenderNode + Material + their generated derived passes
        // (OIT_ACCUM etc.) alive on the JS heap. EntityCollect's
        // bookkeeping IS cleaned via onDisable, but the renderShader
        // collect map can hold stale per-pass entries that re-attach
        // on rebuild and produce a transparent-stack ghost that
        // overlays the new opaque cluster. Calling destroy(true)
        // tears the whole renderer down before the array is cleared.
        for (const obj of this.sphereObjs) {
            this.scene.removeChild(obj);
            obj.destroy(true);
        }
        this.sphereObjs.length = 0;
        this.sphereMaterials.length = 0;

        const { radius, xySpacing, zSpacing, alpha, doubleSide } = this.params;
        const geom = new SphereGeometry(radius, 32, 24);

        let idx = 0;
        for (let depth = 0; depth < 3; depth++) {
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    const sphere = new Object3D();
                    const m = this.createMaterial();
                    const c = this.palette[idx++];
                    m.baseColor = new Color(c.r, c.g, c.b, alpha);
                    m.doubleSide = doubleSide;
                    // PBR-only knobs — feature-detect via `in` since
                    // AlphaMaterial doesn't include them.
                    if ('roughness' in m) (m as any).roughness = this.params.roughness;
                    if ('metallic' in m) (m as any).metallic = 0;
                    this.applyModeToMaterial(m, this.params.mode);
                    const r = sphere.addComponent(MeshRenderer);
                    r.geometry = geom;
                    r.material = m;
                    sphere.transform.x = (col - 1) * xySpacing;
                    sphere.transform.y = (1 - row) * xySpacing;
                    sphere.transform.z = (1 - depth) * zSpacing;
                    this.scene.addChild(sphere);
                    this.sphereObjs.push(sphere);
                    this.sphereMaterials.push(m);
                }
            }
        }
    }

    private updateMaterials() {
        const { alpha, doubleSide, mode } = this.params;
        for (let i = 0; i < this.sphereMaterials.length; i++) {
            const m = this.sphereMaterials[i];
            const c = this.palette[i];
            m.baseColor = new Color(c.r, c.g, c.b, alpha);
            m.doubleSide = doubleSide;
            this.applyModeToMaterial(m, mode);
        }
    }

    /**
     * Map the GUI's four-way `mode` to the underlying material flags.
     *
     * Each mode uses its own algorithm independent of alpha — the
     * three axes (mode, material, alpha) are orthogonal, so flipping
     * any one of them must produce an observable change. Alpha = 1.0
     * is NOT special-cased; whatever algorithm the mode dictates runs
     * end-to-end at the alpha the user picked.
     *
     *   - `weighted`: alphaMode='BLEND' + oitMode='weighted' → WBOIT
     *     accum/reveal. At α=1 with our 4-unit cluster the front-vs-
     *     back depth-weight ratio is only ~2-5x (the paper's z/200
     *     normalisation saturates), so 27 layers get averaged ~equally
     *     and the cluster looks "milky averaged" even at α=1. This is
     *     the documented WBOIT behaviour at small scene scales — not
     *     a bug. Use sorted, depth-peel, or hash at α=1 if you want
     *     opaque. Use weighted for unbounded transparent layer counts
     *     (particles, smoke, foliage).
     *
     *   - `sorted`: alphaMode='BLEND' + oitMode='sorted' → back-to-
     *     front per-mesh sort + alpha blend. At α=1 the over operator
     *     `src*α + dst*(1-α)` collapses to `src` so the front fragment
     *     authoritatively wins; cluster looks opaque (modulo the
     *     within-sphere triangle-order banding documented up top).
     *
     *   - `depth-peel`: alphaMode='BLEND' + oitMode='depth-peel' →
     *     order-correct OIT via depth peeling. Each
     *     transparent fragment runs through a private depth buffer
     *     with depth-test + depth-write enabled, so the front-most
     *     fragment per pixel wins via GPU depth-test. At α=1 this is
     *     fully opaque (front blocks bg). Stage-3 MVP: only the front
     *     layer renders; back layers are depth-occluded rather than
     *     N-iteration-peeled. Use for hero glass / scientific viz
     *     where α=1 must be exactly opaque AND in-mesh banding must
     *     not appear.
     *
     *   - `hash`: alphaMode='HASH' + opaque queue + per-fragment hash
     *     discard. At α=1 the discard threshold is 1.0 so no fragments
     *     drop and the cluster looks opaque. At α<1 the dither pattern
     *     is visible per frame; TAA convergence smooths it over time.
     */
    private applyModeToMaterial(m: AlphaMaterial, mode: Mode) {
        if (mode === 'hash') {
            m.alphaMode = 'HASH';
        } else {
            // Either order works: oitMode setter and alphaMode setter
            // both fire _notifyRenderClassificationDirty →
            // refreshRenderClassification → castNeedPass, so the
            // OIT_ACCUM pass is lazily created regardless of order.
            m.oitMode = mode;
            m.alphaMode = 'BLEND';
        }
    }

    private initGUI() {
        GUIHelp.addFolder('WBOIT demo');

        // Single source of truth for "user committed a GUI change"
        // logging. Dropdowns fire onChange on selection (already a
        // mouse-up event); sliders fire onChange continuously during
        // drag and onFinishChange on release. We use onFinishChange
        // for sliders so the log lands once when the user lets go,
        // not on every micro-step of the drag — exactly matching the
        // user's "log on mouse-up" requirement.
        const logCommit = (control: string, value: unknown) => {
            console.log(`[gui] ${control} = ${JSON.stringify(value)}`);
        };

        GUIHelp.add(this.params, 'mode', ['sorted', 'weighted', 'depth-peel', 'hash']).onChange((v: string) => {
            this.params.mode = v as Mode;
            // Pure in-place mutation — alphaMode setter on each
            // material now triggers re-bucketing in EntityCollect
            // (see Material._notifyRenderClassificationDirty), so we
            // don't need to tear down and rebuild the sphere lattice
            // when crossing the BLEND ↔ HASH boundary.
            for (const m of this.sphereMaterials) this.applyModeToMaterial(m, v as Mode);
            logCommit('mode', v);
        });

        GUIHelp.add(this.params, 'material', ['unlit', 'pbr', 'lambert']).onChange((v: string) => {
            this.params.material = v as MaterialType;
            // Material class itself differs (UnLitMaterial / LitMaterial /
            // LambertMaterial) — we have to construct fresh instances and
            // re-bind to the renderers. Tear down and rebuild the lattice;
            // alphaMode/oitMode/baseColor get reapplied during build.
            this.buildSpheres();
            logCommit('material', v);
        });

        GUIHelp.add(this.params, 'alpha', 0.0, 1.0, 0.01)
            .onChange(() => this.updateMaterials())
            .onFinishChange((v: number) => logCommit('alpha', v));

        GUIHelp.open();
        GUIHelp.endFolder();

        // ---- Mouse-event recorder ----------------------------------
        // Press Space to toggle recording. While recording, mouse
        // events (down/up/move/wheel) are timestamped and appended.
        // `Export JSON` downloads the recording as a .json file the
        // user can replay or inspect. `Clear` resets the buffer.
        const recorder = new MouseRecorder();
        recorder.attach();
        const recorderProxy = {
            recording: false,
            events: 0,
            'Export JSON': () => { recorder.export(); logCommit('recorder', 'export'); },
            'Clear': () => { recorder.clear(); logCommit('recorder', 'clear'); },
        };
        // Live status — `.listen()` makes dat.gui re-read the values
        // each frame so the toggle / counter reflect recorder state.
        GUIHelp.addFolder('Mouse recorder (Space toggles)');
        GUIHelp.add(recorderProxy, 'recording').listen();
        GUIHelp.add(recorderProxy, 'events').listen();
        GUIHelp.add(recorderProxy, 'Export JSON');
        GUIHelp.add(recorderProxy, 'Clear');
        GUIHelp.endFolder();
        // Spacebar handler — bridge keyboard → recorder. Sync proxy
        // values after each toggle so the GUI display updates.
        window.addEventListener('keydown', (e) => {
            // Skip when typing into a focused input/textarea (the
            // GUIHelp dropdowns / sliders use various input elements).
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            if (e.code !== 'Space') return;
            e.preventDefault();
            recorder.toggle();
            recorderProxy.recording = recorder.isRecording;
            recorderProxy.events = recorder.eventCount;
            logCommit('recorder', recorder.isRecording ? 'start' : 'stop');
        });
        // Continuously refresh the event counter while recording so
        // the GUI shows live progress without per-event GUI updates.
        setInterval(() => {
            recorderProxy.recording = recorder.isRecording;
            recorderProxy.events = recorder.eventCount;
        }, 200);
    }

    /**
     * Generate `count` distinct, vivid colours via golden-ratio hue
     * stepping at full saturation. Lightness varies with i so we don't
     * just get a rainbow — adjacent spheres in different rows differ
     * not only in hue but in brightness, giving the demo more visible
     * contrast between overlapping layers (the original 0.7/0.6 HSL
     * came out too pastel once stacks of 27 averaged through WBOIT).
     */
    private generatePalette(count: number): Color[] {
        const out: Color[] = [];
        for (let i = 0; i < count; i++) {
            const h = (i * 0.61803398875) % 1;
            // Lightness alternates 0.4 / 0.55 / 0.7 across i so visually
            // adjacent spheres tend to land in different brightness bands.
            const l = 0.4 + (i % 3) * 0.15;
            const [r, g, b] = hslToRgb(h, 1.0, l);
            out.push(new Color(r, g, b));
        }
        return out;
    }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    if (s === 0) return [l, l, l];
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/**
 * Lightweight mouse-event recorder. Captures timestamped down/up/move/
 * wheel events into a JSON-serializable buffer; download writes a
 * .json file the user can replay or post for debugging.
 *
 * `mousemove` is throttled at ~60 Hz (16ms) so a 30-second drag doesn't
 * produce a 300 KB JSON full of redundant per-frame samples.
 */
class MouseRecorder {
    public isRecording = false;
    private startTime = 0;
    private events: Array<Record<string, any>> = [];
    private lastMoveT = 0;
    private boundMouseDown = (e: MouseEvent) => this.onMouse('mousedown', e);
    private boundMouseUp = (e: MouseEvent) => this.onMouse('mouseup', e);
    private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
    private boundWheel = (e: WheelEvent) => this.onWheel(e);

    public get eventCount() {
        return this.events.length;
    }

    public attach() {
        window.addEventListener('mousedown', this.boundMouseDown, { capture: true });
        window.addEventListener('mouseup', this.boundMouseUp, { capture: true });
        window.addEventListener('mousemove', this.boundMouseMove, { capture: true });
        window.addEventListener('wheel', this.boundWheel, { capture: true, passive: true });
    }

    public toggle() {
        if (this.isRecording) this.stop();
        else this.start();
    }

    public start() {
        this.isRecording = true;
        this.startTime = performance.now();
        this.lastMoveT = 0;
        // Don't clear `events` — let user explicitly Clear if they
        // want a fresh buffer, otherwise pause/resume appends.
        this.events.push({ t: 0, type: 'recording-start', wallClock: Date.now() });
        console.log('[recorder] start');
    }

    public stop() {
        if (!this.isRecording) return;
        this.events.push({ t: this.now(), type: 'recording-stop' });
        this.isRecording = false;
        console.log(`[recorder] stop — ${this.events.length} events`);
    }

    public clear() {
        this.events.length = 0;
        this.lastMoveT = 0;
        console.log('[recorder] cleared');
    }

    public export() {
        const json = JSON.stringify(
            {
                version: 1,
                viewportW: window.innerWidth,
                viewportH: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio,
                events: this.events,
            },
            null,
            2,
        );
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `mouse-recording-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`[recorder] exported ${this.events.length} events`);
    }

    private now() {
        return Math.round(performance.now() - this.startTime);
    }

    private onMouse(type: string, e: MouseEvent) {
        if (!this.isRecording) return;
        this.events.push({
            t: this.now(),
            type,
            x: e.clientX,
            y: e.clientY,
            button: e.button,
            buttons: e.buttons,
        });
    }

    private onMouseMove(e: MouseEvent) {
        if (!this.isRecording) return;
        const t = this.now();
        // 60 Hz cap on mousemove — most browsers fire ~120-300 Hz on
        // raw mouse input which produces enormous JSON otherwise.
        if (t - this.lastMoveT < 16) return;
        this.lastMoveT = t;
        this.events.push({
            t,
            type: 'mousemove',
            x: e.clientX,
            y: e.clientY,
            buttons: e.buttons,
        });
    }

    private onWheel(e: WheelEvent) {
        if (!this.isRecording) return;
        this.events.push({
            t: this.now(),
            type: 'wheel',
            x: e.clientX,
            y: e.clientY,
            dx: e.deltaX,
            dy: e.deltaY,
            dz: e.deltaZ,
        });
    }
}

new Sample_WBOIT().run();
