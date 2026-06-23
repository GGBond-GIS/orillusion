import {
    AtmosphericComponent, BitmapTexture2D, BoxGeometry, CameraUtil, ClusterLightingPass,
    COLOR_BUFFER, Color, ColorPass, DecalComponent, DirectLight, drawNodes, Engine3D,
    GlobalBindGroup, HoverCameraController, KelvinUtil, LitMaterial, MeshRenderer, Object3D,
    PreDepthPass, RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext, VisibleLayer,
    Scene3D, SphereGeometry, TRANSPARENT_DRAW_CTX, TransparentDrawContext, Vector3, View3D,
} from "@orillusion/core";

/* ════════════════════════════════════════════════════════════════════
 * Sample_PassOrderControl —— RenderGraph order-control patterns
 *
 * The scenario is identical to `Sample_DecalShadowVolume` (decal-
 * projected ground + tall buildings that must occlude the decals),
 * but instead of the one-liner "bump material renderOrder to 3001"
 * trick, this sample demonstrates the four RenderGraph mechanisms
 * that let an application place a user pass at an exact point in
 * the default `ForwardRendererJob` pipeline:
 *
 *   1. `pass.layerMask`         — bitmask routing: tell built-in
 *                                 passes which renderable layers
 *                                 they should draw.
 *   2. User-defined pass        — subclass `RenderGraphPass`, declare
 *                                 reads/writes, reuse the engine's
 *                                 shared transparent-continuation
 *                                 state to write into `_ColorBuffer`.
 *   3. `b.dependsOn(name)`      — declare a topo-sort edge from inside
 *                                 `setup()` to anchor the new pass
 *                                 after an existing one.
 *   4. `pass.dependencies` mutation
 *                               — inject a topo edge to flip an
 *                                 EXISTING engine pass so it runs
 *                                 after the new pass. Needed when
 *                                 your pass is added after
 *                                 `startRenderView`, because the
 *                                 default insertion-order tie-break
 *                                 would otherwise place built-in
 *                                 consumers (e.g. PostPass) before
 *                                 your writes.
 *
 * Result, in compiled topo order:
 *     … ColorPass → SceneColorPyramidPass → TransmissionOpaquePass
 *       → DecalShadowVolumePass → SortedTransparentPass
 *       → BuildingOverlayPass → PostPass → GUIPass
 *
 * Compare against `Sample_DecalShadowVolume` for the simpler
 * "use the transparent bucket as your overlay slot" recipe.
 * ──────────────────────────────────────────────────────────────────── */

/** Project-defined renderable layer. Bit 0 is reserved by the engine
 *  for `VisibleLayer.Default` (the implicit layer of any new node), so
 *  application code occupies bits 1..31. */
const BUILDING_LAYER = 1 << 1;

function sphericalDir(theta: number, phi: number): [number, number, number] {
    const cosT = Math.cos(theta);
    return [cosT * Math.cos(phi), Math.sin(theta), cosT * Math.sin(phi)];
}

function paintCanvasTexture(engine: Engine3D, size: number, draw: (g: CanvasRenderingContext2D, S: number) => void): BitmapTexture2D {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d')!, size);
    const tex = new BitmapTexture2D(true, engine.context3D, 'srgb');
    tex.source = canvas;
    return tex;
}

/* ════════════════════════════════════════════════════════════════════
 * Method 2 in action — a user-defined `RenderGraphPass` that draws
 * the `BUILDING_LAYER` meshes on top of the decal-composited color
 * buffer.
 *
 * Key building blocks the engine exposes:
 *   - `b.read` / `b.write` / `b.dependsOn` to declare dependencies in
 *     `setup`.
 *   - `this.collectLayered(view)` to fetch opaque/transparent lists
 *     filtered by this pass's `layerMask` and the camera's
 *     `cullingMask`.
 *   - `TRANSPARENT_DRAW_CTX` — the shared render context published by
 *     ColorPass. Reading it gives us `renderContext` + `rendererPassState`
 *     so we can reopen the color attachment with loadOp='load' and emit
 *     standard `drawNodes` calls; the building's `LitMaterial.COLOR`
 *     pipeline picks up depth-test + cluster lighting as usual.
 * ════════════════════════════════════════════════════════════════════ */
class BuildingOverlayPass extends RenderGraphPass {
    public readonly name = 'BuildingOverlayPass';
    /** This pass only draws what's on BUILDING_LAYER. `collectLayered`
     *  intersects this with `node.visibleLayer & camera.cullingMask`. */
    public layerMask = BUILDING_LAYER;

    public setup(b: RenderGraphBuilder): void {
        // Reusing the engine's transparent-continuation context — chains
        // us after ColorPass without us having to allocate our own RT.
        b.read(TRANSPARENT_DRAW_CTX);
        // Mutator declaration: we paint into the main color target.
        b.write(COLOR_BUFFER);
        // Method 3: anchor us strictly after the decal pass via an
        // explicit topo edge. Without this, the insertion-order tie-
        // break alone keeps the order intact, but the edge documents
        // intent and protects against future re-orderings.
        b.dependsOn('DecalShadowVolumePass');
    }

    public execute(ctx: RenderGraphPassContext): void {
        const layered = this.collectLayered(ctx.view);
        if (layered.opaque.length === 0) return;

        const view = ctx.view;
        const state = ctx.get<TransparentDrawContext>(TRANSPARENT_DRAW_CTX);
        const cluster = ctx.graph.getPass<ClusterLightingPass>('ClusterLightingPass')?.clusterLightingBuffer;
        const gpu = view.engine3D.context3D.gpuContext;
        state.renderContext.gpu = gpu;

        const camera = view.camera;
        GlobalBindGroup.updateCameraGroup(camera);
        state.rendererPassState.camera3D = camera;

        // Reopens the color attachment with color_loadOp='load' and
        // depth_loadOp='load' — preserves decal-composited pixels and
        // terrain depth, then draws the buildings via their normal
        // COLOR pipeline (depth-write on, depthCompare='less_equal').
        state.renderContext.beginTransparentRenderPass();
        gpu.bindCamera(state.renderContext.encoder, camera);
        drawNodes(view, state.renderContext, state.rendererPassState, layered.opaque, cluster);
        state.renderContext.endRenderPass();
    }
}

export class Sample_PassOrderControl {
    engine!: Engine3D;
    scene!: Scene3D;

    async run() {
        this.engine = await Engine3D.init({
            setting: {
                shadow: { autoUpdate: true, updateFrameRate: 1 },
                render: { zPrePass: true, decals: true } as any,
            },
        });

        this.scene = new Scene3D();
        this.scene.addComponent(AtmosphericComponent);

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 0.5, 5000);
        camera.object3D.addComponent(HoverCameraController).setCamera(90, -10, 72);

        const view = new View3D();
        view.scene = this.scene;
        view.camera = camera;
        this.engine.startRenderView(view);

        /* ─────────────── ORDER-CONTROL SECTION ───────────────
         * Three of the four mechanisms live here. The fourth
         * (`b.dependsOn`) lives inside `BuildingOverlayPass.setup`. */
        const graph = view.renderGraph!;
        const colorPass = graph.getPass<ColorPass>('ColorPass')!;
        const preDepthPass = graph.getPass<PreDepthPass>('PreDepthPass');
        const postPass = graph.getPass('PostPass')!;

        // ── Method 1: pass.layerMask
        // Strip BUILDING_LAYER from the prepass and the opaque draw.
        // Both passes filter their node list via
        //     (node.visibleLayer & pass.layerMask & camera.cullingMask) !== 0
        // so excluding the bit makes them skip every node tagged with
        // BUILDING_LAYER. Crucially, `_MainDepthTexture` then carries
        // terrain depth only when `DecalShadowVolumePass` reads it —
        // decals project onto terrain instead of onto building walls.
        const excludeBuildings = VisibleLayer.remove(VisibleLayer.All, BUILDING_LAYER);
        colorPass.layerMask = excludeBuildings;
        if (preDepthPass) preDepthPass.layerMask = excludeBuildings;

        // ── Method 2: add the user pass.
        graph.add(BuildingOverlayPass);

        // ── Method 4: pass.dependencies mutation.
        // PostPass reads _ColorBuffer and produces the final image.
        // `BuildingOverlayPass` was added after `startRenderView`, so
        // its insertion order is HIGHER than PostPass's. Topo step 2
        // ("a reader picks the latest writer whose insertion is at-or-
        // before the reader") therefore makes PostPass read from
        // SortedTransparentPass's state, and the Kahn tie-break by
        // insertion order then places PostPass BEFORE
        // BuildingOverlayPass — PostPass would composite the final
        // frame before our buildings exist.
        //
        // We fix the order without rebuilding PostPass: append
        // 'BuildingOverlayPass' to PostPass.dependencies. Topo step 3
        // adds a `BuildingOverlayPass → PostPass` edge from this set,
        // and the next compile() picks it up because `graph.add` above
        // already marked the graph dirty.
        postPass.dependencies = new Set([
            ...(postPass.dependencies ?? []),
            'BuildingOverlayPass',
        ]);
        graph.compile();
        // The engine logs the compiled order as
        //     [RenderGraph] compiled pass order: …
        // Open the dev console to see it.

        await this.initScene();
        await this.setupDecals();
    }

    private async initScene() {
        const light = new Object3D();
        light.rotationX = 55;
        light.rotationY = 320;
        const dl = light.addComponent(DirectLight);
        dl.lightColor = KelvinUtil.color_temperature_to_rgb(5500);
        dl.intensity = 3;
        dl.castShadow = true;
        dl.enableCSM = true;
        this.scene.addChild(light);

        const sphere = new Object3D();
        const sphereMat = new LitMaterial();
        sphereMat.baseColor = new Color(0.32, 0.38, 0.30, 1);
        sphereMat.roughness = 0.85;
        const sphereMr = sphere.addComponent(MeshRenderer);
        sphereMr.geometry = new SphereGeometry(30, 64, 64);
        sphereMr.material = sphereMat;
        sphereMr.receiveShadow = true;
        this.scene.addChild(sphere);

        const sphereR = 30;
        const bumpPositions: Array<[number, number, number, number]> = [
            [0.55, -0.15, 1.2, 0.10],
            [0.40, 0.45, 1.1, 0.55],
            [-0.45, 0.25, 1.2, 0.30],
            [-0.45, -0.30, 1.1, 0.78],
            [0.00, -0.42, 1.4, 0.05],
            [0.00, 0.45, 1.1, 0.92],
        ];
        for (let i = 0; i < bumpPositions.length; i++) {
            const [t, p, s, hue] = bumpPositions[i];
            const [nx, ny, nz] = sphericalDir(t, p);
            const bump = new Object3D();
            bump.x = nx * (sphereR + s * 0.4);
            bump.y = ny * (sphereR + s * 0.4);
            bump.z = nz * (sphereR + s * 0.4);
            const mr = bump.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(s * 2, s * 2, s * 2);
            const mat = new LitMaterial();
            const c = this._hueToRgb(hue);
            mat.baseColor = new Color(c[0], c[1], c[2], 1);
            mat.roughness = 0.65;
            mat.metallic = 0.05;
            mr.material = mat;
            mr.castShadow = true;
            mr.receiveShadow = true;
            this.scene.addChild(bump);
        }

        const buildings: Array<[number, number, number, number, number]> = [
            [0.50, -0.20, 1.4, 1.4, 12],
            [0.40, 0.50, 1.2, 1.2, 10],
            [-0.42, 0.30, 1.0, 1.6, 14],
            [0.00, -0.40, 1.6, 1.0, 11],
            [-0.10, 0.55, 1.0, 1.0, 3],
        ];
        for (let i = 0; i < buildings.length; i++) {
            const [t, p, fw, fd, h] = buildings[i];
            const [nx, ny, nz] = sphericalDir(t, p);
            const obj = new Object3D();
            obj.name = `Building_${i}`;
            obj.x = nx * (sphereR + h * 0.5);
            obj.y = ny * (sphereR + h * 0.5);
            obj.z = nz * (sphereR + h * 0.5);
            DecalComponent.alignTopToward(obj, new Vector3(nx, ny, nz));
            const mr = obj.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(fw, h, fd);
            const mat = new LitMaterial();
            mat.baseColor = new Color(0.85, 0.85, 0.88, 1);
            mat.roughness = 0.4;
            mat.metallic = 0.2;
            mr.material = mat;
            mr.castShadow = true;
            mr.receiveShadow = true;
            // The single tag — the rest is RenderGraph composition.
            mr.visibleLayer = BUILDING_LAYER;
            this.scene.addChild(obj);
        }
    }

    private async setupDecals(): Promise<void> {
        const sphereR = 30;

        const decals: Array<{
            name: string; theta: number; phi: number;
            width: number; depth: number;
            tint: [number, number, number, number];
            paint: (g: CanvasRenderingContext2D, S: number) => void;
        }> = [
            {
                name: 'crosshair', theta: 0.55, phi: -0.15,
                width: 8, depth: 10, tint: [1.0, 0.85, 0.20, 1.0],
                paint: (g, S) => {
                    g.strokeStyle = '#fff';
                    g.lineWidth = S * 0.06;
                    g.beginPath();
                    g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
                    g.stroke();
                    g.beginPath();
                    g.moveTo(S / 2, S * 0.08); g.lineTo(S / 2, S * 0.92);
                    g.moveTo(S * 0.08, S / 2); g.lineTo(S * 0.92, S / 2);
                    g.stroke();
                },
            },
            {
                name: 'stripes', theta: -0.45, phi: 0.25,
                width: 8, depth: 10, tint: [1.0, 0.35, 0.30, 1.0],
                paint: (g, S) => {
                    g.fillStyle = 'rgba(255,255,255,0.95)';
                    const bands = 6;
                    for (let k = 0; k < bands; k++) {
                        if ((k & 1) === 0) g.fillRect(0, (k / bands) * S, S, S / bands);
                    }
                },
            },
            {
                name: 'arrow', theta: -0.45, phi: -0.30,
                width: 7, depth: 10, tint: [0.95, 0.95, 0.95, 1.0],
                paint: (g, S) => {
                    g.fillStyle = 'rgba(40,160,80,1)';
                    g.beginPath();
                    g.moveTo(S * 0.5, S * 0.08);
                    g.lineTo(S * 0.85, S * 0.55);
                    g.lineTo(S * 0.6, S * 0.55);
                    g.lineTo(S * 0.6, S * 0.92);
                    g.lineTo(S * 0.4, S * 0.92);
                    g.lineTo(S * 0.4, S * 0.55);
                    g.lineTo(S * 0.15, S * 0.55);
                    g.closePath();
                    g.fill();
                },
            },
        ];

        for (const d of decals) {
            const ny = Math.sin(d.theta);
            const cosT = Math.cos(d.theta);
            const nx = cosT * Math.cos(d.phi);
            const nz = cosT * Math.sin(d.phi);
            const tex = paintCanvasTexture(this.engine, 256, d.paint);

            const obj = new Object3D();
            obj.name = `Decal:${d.name}`;
            obj.localPosition = new Vector3(nx * sphereR, ny * sphereR, nz * sphereR);
            obj.localScale = new Vector3(d.width, d.depth, d.width);
            DecalComponent.alignTopToward(obj, new Vector3(nx, ny, nz));
            obj.addComponent(DecalComponent, {
                texture: tex,
                tint: new Color(d.tint[0], d.tint[1], d.tint[2], d.tint[3]),
            });
            this.scene.addChild(obj);
        }
    }

    private _hueToRgb(h: number): [number, number, number] {
        const c = 1;
        const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
        let r = 0, g = 0, b = 0;
        if (h < 1 / 6) { r = c; g = x; }
        else if (h < 2 / 6) { r = x; g = c; }
        else if (h < 3 / 6) { g = c; b = x; }
        else if (h < 4 / 6) { g = x; b = c; }
        else if (h < 5 / 6) { r = x; b = c; }
        else { r = c; b = x; }
        return [r * 0.6 + 0.2, g * 0.6 + 0.2, b * 0.6 + 0.2];
    }
}
