import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    AtmosphericComponent,
    BitmapTexture2D,
    CameraUtil,
    Color,
    DirectLight,
    Engine3D,
    HoverCameraController,
    Object3D,
    Scene3D,
    SpriteBatch,
    SpriteBatchEntry,
    Vector2,
    Vector3,
    Vector4,
    View3D,
} from "@orillusion/core";

/**
 * `SpriteBatch` demo — tens of thousands of sprites sharing one texture,
 * drawn in a single `drawIndexed` call. Use `count` to scale up; 100_000
 * should still hit one drawcall, CPU-bound on the per-frame rebuild if
 * `animate` is on.
 *
 * Compare against `Sample_World` (per-entity `SpriteRenderer`, N drawcalls)
 * for the same sprite count — the difference becomes dramatic past a few
 * hundred.
 */
class Sample_Batch {
    engine!: Engine3D;
    scene!: Scene3D;
    view!: View3D;

    private batch!: SpriteBatch;
    private entries: SpriteBatchEntry[] = [];
    private animate = true;
    private phases: Float32Array = new Float32Array(0);
    private basePositions: Float32Array = new Float32Array(0);

    private readonly state = {
        count: 10_000,
        tint: new Color(1, 1, 1, 1),
        animate: true,
        size: 0.15,
        spread: 30,
    };

    async run() {
        GUIHelp.init();

        this.engine = await Engine3D.init({
            renderLoop: () => this._tick(),
        });

        this.scene = new Scene3D();
        const sky = this.scene.addComponent(AtmosphericComponent);

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 0.1, 5000);
        camera.object3D.addComponent(HoverCameraController).setCamera(0, -15, 80);

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;
        this.engine.startRenderView(this.view);

        const lightObj = new Object3D();
        lightObj.rotationX = 45;
        lightObj.rotationY = 110;
        lightObj.addComponent(DirectLight).intensity = 3;
        this.scene.addChild(lightObj);
        sky.relativeTransform = lightObj.transform;

        const tex = new BitmapTexture2D();
        tex.flipY = true;
        await tex.load('textures/KB3D_NTT_Ads_basecolor.png');

        // The batch host Object3D — parent transform applies to the whole
        // group; you can rotate the batch, translate it, etc.
        const batchObj = new Object3D();
        this.batch = batchObj.addComponent(SpriteBatch);
        this.batch.texture = tex;
        this.batch.color = this.state.tint;
        this.scene.addChild(batchObj);

        this._rebuildEntries();
        this.initGUI();
    }

    private _rebuildEntries() {
        this.batch.clear();
        this.entries.length = 0;

        const n = this.state.count;
        const spread = this.state.spread;
        const size = this.state.size;
        this.basePositions = new Float32Array(n * 3);
        this.phases = new Float32Array(n);

        // Distribute entries in a random 3D cloud inside `spread × spread × spread`.
        for (let i = 0; i < n; i++) {
            const x = (Math.random() - 0.5) * spread;
            const y = (Math.random() - 0.5) * spread * 0.6;
            const z = (Math.random() - 0.5) * spread;
            this.basePositions[i * 3 + 0] = x;
            this.basePositions[i * 3 + 1] = y;
            this.basePositions[i * 3 + 2] = z;
            this.phases[i] = Math.random() * Math.PI * 2;

            const entry = this.batch.add({
                position: new Vector3(x, y, z),
                size: new Vector2(size, size),
                pivot: new Vector2(0.5, 0.5),
                uvRect: new Vector4(0, 0, 1, 1),
            });
            this.entries.push(entry);
        }
    }

    private _tmpPos = new Vector3(0, 0, 0);

    private _tick() {
        if (!this.state.animate || this.entries.length === 0) return;
        const t = performance.now() * 0.001;
        const base = this.basePositions;
        for (let i = 0; i < this.entries.length; i++) {
            // Bob each sprite on Y by a phase-offset sine. We update position
            // in place and call `batch.update` — the batch flags dirty once
            // and rebuilds the vertex stream on the next frame.
            const phase = this.phases[i];
            const y = base[i * 3 + 1] + Math.sin(t + phase) * 0.5;
            this._tmpPos.set(base[i * 3 + 0], y, base[i * 3 + 2]);
            this.batch.update(this.entries[i], { position: this._tmpPos });
        }
    }

    private initGUI() {
        GUIHelp.addFolder('SpriteBatch');
        GUIHelp.add(this.state, 'count', 100, 100_000, 100).onFinishChange(() => this._rebuildEntries());
        GUIHelp.add(this.state, 'size', 0.05, 2, 0.05).onFinishChange(() => this._rebuildEntries());
        GUIHelp.add(this.state, 'spread', 5, 100, 1).onFinishChange(() => this._rebuildEntries());
        GUIHelp.addColor(this.state, 'tint').onChange(c => this.batch.color = c);
        GUIHelp.add(this.state, 'animate');
        GUIHelp.open();
        GUIHelp.endFolder();
    }
}

new Sample_Batch().run();
