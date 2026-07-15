import {
    AtmosphericComponent, BoxGeometry, CameraUtil, Color, DirectLight, Engine3D,
    HoverCameraController, KelvinUtil, LitMaterial, MeshRenderer, Object3D,
    PlaneGeometry, Scene3D, View3D,
    // Graph composition surface
    ClusterLightingPass, ColorPass, COLOR_BUFFER, GBufferResourcePass,
    GUIPass, PointShadowPass, PostPass, ReflectionPass, RenderGraphBuilder,
    RenderGraphPass, RenderGraphPassContext, RendererJob, ShadowPass,
    SkyPass,
} from "@orillusion/core";

/**
 * A user-defined RenderGraphPass demonstrating the builder API.
 *
 * `setup(b)` declares a read on `_ColorBuffer`. The validator rejects
 * the graph if no other pass creates that name; `topoSort` schedules
 * this pass after the latest writer added at-or-before this pass's
 * insertion. We `add()` it after PostPass so we observe the post-
 * processed color the user sees.
 *
 * `execute(ctx)` resolves the named handle through `ctx.get(name)`,
 * which calls back into the pool's getter — this is how passes pick
 * up their declared inputs at runtime.
 */
class FrameLogPass extends RenderGraphPass {
    public readonly name = 'FrameLogPass';
    private _lastLogged = -Infinity;

    public setup(b: RenderGraphBuilder): void {
        b.read(COLOR_BUFFER);
    }

    public execute(ctx: RenderGraphPassContext): void {
        if (ctx.frameIndex - this._lastLogged < 60) return;
        const color = ctx.get<unknown>(COLOR_BUFFER);
        console.log(`[FrameLogPass] frame ${ctx.frameIndex} color=${color ? 'ok' : 'missing'}`);
        this._lastLogged = ctx.frameIndex;
    }
}

/**
 * A trimmed-down forward pipeline: the smallest pass set that still
 * produces a lit, shadowed image.
 *
 * Skips: PreDepth, HiZ, MotionVector, GPUCull, GI, SceneColorPyramid,
 * TransmissionOpaque, SortedTransparent, OIT/DDP. Transparent
 * materials and refractive transmission won't render in this pipeline
 * — that's the point of the demo, to show how to dial features in.
 *
 * The order below is the *registration* order; the actual execute
 * order is decided by `RenderGraph.compile()` from each pass's
 * declared `b.read` / `b.write` inputs.
 */
class MinimalRendererJob extends RendererJob {
    constructor(view: View3D) {
        super(view);

        this.graph.add(ClusterLightingPass);
        this.graph.add(ShadowPass);
        this.graph.add(PointShadowPass);
        this.graph.add(ReflectionPass);
        // GBufferResourcePass owns the shared g-buffer / render-context /
        // _TransparentDrawContext that ColorPass (and any chained color
        // pass) consumes. Must be added before ColorPass.
        this.graph.add(GBufferResourcePass);
        this.graph.add(ColorPass, { giEnabled: false });
        this.graph.add(SkyPass);
        this.graph.add(PostPass);
        this.graph.add(GUIPass);

        // User pass — its `b.read(COLOR_BUFFER)` + `stage = AfterPost`
        // place it after Post in the compiled order.
        this.graph.add(FrameLogPass);

        // Compile-and-print so the demo audibly shows the topology.
        console.log('[MinimalRendererJob] passes:', this.graph.passes.map((p: RenderGraphPass) => p.name).join(' → '));
    }
}

class Sample_CustomRendererJob {
    engine!: Engine3D;
    scene!: Scene3D;
    light!: Object3D;

    async run() {
        const engine = this.engine = await Engine3D.init({
            setting: {
                shadow: { autoUpdate: true, updateFrameRate: 1 },
                // Important: keep settings in sync with the pass set.
                // Default `zPrePass=true` makes ColorPass.setup pull
                // `_MainDepthTexture` from the pool, but our minimal
                // pipeline doesn't add PreDepthPass — so disable it.
                render: { zPrePass: false },
            },
        });

        this.scene = new Scene3D();
        this.scene.addComponent(AtmosphericComponent);

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, engine.aspect, 0.1, 5000);
        camera.object3D.addComponent(HoverCameraController).setCamera(35, -25, 14);

        const view = new View3D();
        view.scene = this.scene;
        view.camera = camera;

        // Hand the custom RendererJob class to startRenderView. Engine3D
        // instantiates it instead of the default ForwardRendererJob.
        engine.startRenderView(view, MinimalRendererJob);

        await this.initScene();
    }

    async initScene() {
        // Directional light + shadow.
        const light = this.light = new Object3D();
        light.rotationX = 50;
        light.rotationY = 320;
        const dl = light.addComponent(DirectLight);
        dl.lightColor = KelvinUtil.color_temperature_to_rgb(5500);
        dl.intensity = 3;
        dl.castShadow = true;
        dl.enableCSM = true;
        this.scene.addChild(light);

        // Floor.
        const floor = new Object3D();
        const floorMat = new LitMaterial();
        floorMat.baseColor = new Color(0.45, 0.45, 0.5, 1);
        floorMat.roughness = 0.9;
        const floorMr = floor.addComponent(MeshRenderer);
        floorMr.geometry = new PlaneGeometry(40, 40);
        floorMr.material = floorMat;
        floorMr.receiveShadow = true;
        this.scene.addChild(floor);

        // A row of cubes with varying base colors.
        for (let i = -2; i <= 2; i++) {
            const cube = new Object3D();
            cube.x = i * 2.5;
            cube.y = 1;
            const mr = cube.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(1.5, 1.5, 1.5);
            const mat = new LitMaterial();
            const t = (i + 2) / 4;
            mat.baseColor = new Color(t, 0.5, 1 - t, 1);
            mat.roughness = 0.5;
            mat.metallic = 0.1;
            mr.material = mat;
            mr.castShadow = true;
            this.scene.addChild(cube);
        }
    }
}

new Sample_CustomRendererJob().run();
