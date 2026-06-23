import {
    AtmosphericComponent, BlendMode, BoxGeometry, CameraUtil, ClearDepthPass, Color,
    ColorPass, DirectLight, Engine3D, ForwardRendererJob, HoverCameraController,
    KelvinUtil, LitMaterial, MeshRenderer, Object3D, PlaneGeometry,
    RenderGraphBuilder, VisibleLayer, Scene3D, ShadowPass, SortedTransparentPass,
    Vector3, View3D,
} from "@orillusion/core";

/*
 * Sample_GISLayerComposition — strict scene-composition layering with a
 * mid-pipeline depth clear, modeled on what a GIS / globe renderer
 * actually needs:
 *
 *     [globe opaque]  Terrain + GroundDecal
 *     [clear depth]   ── the planet surface is now considered "background";
 *                        anything 3D drawn after this should not be z-fought
 *                        or culled by the curved globe.
 *     [world opaque]  Buildings / vehicles / markers (the World layer)
 *     [transparent]   Water / Transparent / Overlay
 *
 * The depth clear lets the World layer be composited cleanly on top
 * of the globe regardless of where its meshes actually sit in world Z.
 *
 * Three engine primitives compose this:
 *
 *   - `RenderNode.visibleLayer`  — which composition layers a node belongs to
 *   - `RenderGraphPass.layerMask` — which layers a pass draws
 *   - `Camera3D.cullingMask`    — which layers a camera can see
 *
 * Filtering rule applied at pass execute time:
 *     (node.visibleLayer & pass.layerMask & camera.cullingMask) !== 0
 */

// ─── Project-defined layer semantics (NOT part of the engine) ─────
// Application code owns the bit ↔ meaning mapping. Bit 0 is reserved
// for VisibleLayer.Default (legacy / unassigned), so application bits
// start from bit 1.
const GisLayer = {
    Terrain:     1 << 1,
    GroundDecal: 1 << 2,
    World:       1 << 3,
    Water:       1 << 4,
    Transparent: 1 << 5,
    Overlay:     1 << 6,
} as const;

// ─── Two opaque sub-passes around a depth clear ───────────────────
//
// Both subclass ColorPass. The shared g-buffer + render-context plumbing
// is owned by GBufferResourcePass, sky lives in its own SkyPass (added
// automatically by ForwardRendererJob right after ColorPass), so
// neither subclass has to be a "resource creator" nor toggle the sky.
// What's left to override is the load-op policy on the second pass
// (clear → load), because chained opaque sub-passes have to continue
// the render-pass instead of starting one.

class GisGlobeOpaquePass extends ColorPass {
    public readonly name = 'GisGlobeOpaquePass';
    // Everything else inherited from ColorPass — clears the render
    // target on entry. SkyPass runs right after via mutator-write
    // insertion order, then ClearDepthPass runs after that.
}

class GisWorldOpaquePass extends ColorPass {
    public readonly name = 'GisWorldOpaquePass';

    protected override declareSideEffects(b: RenderGraphBuilder): void {
        super.declareSideEffects(b);
        // Topo order: must run after ClearDepthPass has zeroed the
        // depth attachment for this frame.
        b.dependsOn('ClearDepthPass');
    }

    // No need to override getRenderTargetOptions(): this is the 2nd
    // writer of MAIN_COLOR_RT this frame (after GisGlobeOpaquePass +
    // the intervening ClearDepthPass which clears depth on the shared
    // attachment), so the framework's auto-derive rule resolves
    // color='load' (keeps the globe's pixels) and depth='load' (picks
    // up the cleared depth ClearDepthPass just wrote) by itself.
}

// ─── Custom renderer job: wires the three passes around the default
//     forward pipeline. ───────────────────────────────────────────
class GisRendererJob extends ForwardRendererJob {
    constructor(view: View3D) {
        super(view);

        // 1. Replace the default ColorPass with GisGlobeOpaquePass and
        //    restrict it to the planet-surface layers (+ Default so
        //    engine-internal helpers that haven't been migrated to a
        //    specific layer keep rendering through this pass).
        this.graph.replace('ColorPass', GisGlobeOpaquePass);
        const globe = this.graph.getPass<GisGlobeOpaquePass>('GisGlobeOpaquePass')!;
        globe.layerMask = VisibleLayer.Default | GisLayer.Terrain | GisLayer.GroundDecal;

        // 2. Independent ClearDepthPass between the two opaque halves.
        //    Color attachments are loaded (terrain + decals + sky stay),
        //    depth attachment is cleared.
        this.graph.add(ClearDepthPass, { after: 'GisGlobeOpaquePass' });

        // 3. The second opaque pass — World layer (and anything else
        //    you want freshly z-tested against the cleared depth).
        this.graph.add(GisWorldOpaquePass);
        const world = this.graph.getPass<GisWorldOpaquePass>('GisWorldOpaquePass')!;
        world.layerMask = GisLayer.World;

        // 4. The default transmission + sorted-transparent passes
        //    consume TRANSPARENT_DRAW_CTX, which orders them after
        //    GisGlobeOpaquePass (the producer). We need them to also
        //    wait on GisWorldOpaquePass so the depth they `load` is
        //    the world-segment depth, not the post-clear empty depth.
        for (const name of ['TransmissionOpaquePass', 'SortedTransparentPass'] as const) {
            const p = this.graph.getPass(name);
            if (!p) continue;
            const existing = p.dependencies ?? new Set<string>();
            p.dependencies = new Set([...existing, 'GisWorldOpaquePass']);
        }

        // 5. SortedTransparent owns water + project-defined transparent
        //    overlays. Overlay HUD layer goes here too because it draws
        //    with alpha and should render last.
        const sortedTr = this.graph.getPass<SortedTransparentPass>('SortedTransparentPass');
        if (sortedTr) {
            sortedTr.layerMask = GisLayer.Water | GisLayer.Transparent | GisLayer.Overlay;
        }

        // 6. Shadow casters: everything except the screen-space HUD.
        const shadow = this.graph.getPass<ShadowPass>('ShadowPass');
        if (shadow) {
            shadow.layerMask = VisibleLayer.remove(VisibleLayer.All, GisLayer.Overlay);
        }

        this.graph.compile();
        console.log('[GisRendererJob] pass order:');
        for (const p of this.graph.passes) {
            const mask = (p.layerMask >>> 0).toString(16).padStart(8, '0');
            console.log(`  ${p.name.padEnd(28)} layerMask=0x${mask}`);
        }
    }
}

// ─── Sample driver ─────────────────────────────────────────────────
export class Sample_GISLayerComposition {
    private engine!: Engine3D;
    private scene!: Scene3D;

    async run(): Promise<void> {
        this.engine = await Engine3D.init({
            setting: {
                shadow: { autoUpdate: true, updateFrameRate: 1 },
            },
        });

        this.scene = new Scene3D();
        this.scene.addComponent(AtmosphericComponent);

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 0.1, 1000);
        camera.object3D.addComponent(HoverCameraController).setCamera(45, -20, 35);

        // Demonstrate Camera3D.cullingMask too: drop the Overlay layer
        // from the main view's visible set. (Switch back to
        // VisibleLayer.All to see the Overlay objects.)
        camera.cullingMask = VisibleLayer.remove(VisibleLayer.All, GisLayer.Overlay);
        console.log(`[main camera] cullingMask=0x${(camera.cullingMask >>> 0).toString(16).padStart(8, '0')} (Overlay layer hidden)`);

        const view = new View3D();
        view.scene = this.scene;
        view.camera = camera;
        this.engine.startRenderView(view, GisRendererJob);

        this.initScene();
    }

    private initScene(): void {
        // Sun
        const light = new Object3D();
        light.rotationX = 55;
        light.rotationY = 320;
        const dl = light.addComponent(DirectLight);
        dl.lightColor = KelvinUtil.color_temperature_to_rgb(5500);
        dl.intensity = 3;
        dl.castShadow = true;
        dl.enableCSM = true;
        this.scene.addChild(light);

        // Terrain — large dark plane, drawn in the GLOBE pass.
        const terrain = new Object3D();
        const terrainMat = new LitMaterial();
        terrainMat.baseColor = new Color(0.28, 0.32, 0.26, 1);
        terrainMat.roughness = 0.9;
        const terrainMr = terrain.addComponent(MeshRenderer);
        terrainMr.geometry = new PlaneGeometry(40, 40);
        terrainMr.material = terrainMat;
        terrainMr.receiveShadow = true;
        terrainMr.visibleLayer = GisLayer.Terrain;
        this.scene.addChild(terrain);

        // Ground decals — a couple of bright rectangles painted slightly
        // above the terrain plane. Drawn in the GLOBE pass (same depth
        // segment as the terrain), so they share z-state with it.
        const decalColors: [number, number, number][] = [
            [0.95, 0.85, 0.25],   // road yellow
            [0.20, 0.55, 0.95],   // water marker
        ];
        const decalRects: [Vector3, [number, number]][] = [
            [new Vector3(0, 0.02, -6), [16, 1.2]],
            [new Vector3(8, 0.02, 4),  [6, 6]],
        ];
        for (let i = 0; i < decalRects.length; i++) {
            const [pos, size] = decalRects[i];
            const decal = new Object3D();
            decal.localPosition = pos;
            const mat = new LitMaterial();
            mat.baseColor = new Color(decalColors[i][0], decalColors[i][1], decalColors[i][2], 1);
            mat.roughness = 0.8;
            const mr = decal.addComponent(MeshRenderer);
            mr.geometry = new PlaneGeometry(size[0], size[1]);
            mr.material = mat;
            mr.receiveShadow = true;
            mr.visibleLayer = GisLayer.GroundDecal;
            this.scene.addChild(decal);
        }

        // Buildings — 3 boxes in the WORLD layer. Drawn after the
        // mid-pipeline depth clear, so their depth comparisons are
        // independent of the planet surface.
        const tints: [number, number, number][] = [
            [0.85, 0.82, 0.78],
            [0.78, 0.82, 0.86],
            [0.86, 0.78, 0.74],
        ];
        const positions: Vector3[] = [
            new Vector3(-6, 2, -4),
            new Vector3(5, 3, -2),
            new Vector3(-2, 1.5, 4),
        ];
        for (let i = 0; i < 3; i++) {
            const obj = new Object3D();
            obj.localPosition = positions[i];
            const mat = new LitMaterial();
            mat.baseColor = new Color(tints[i][0], tints[i][1], tints[i][2], 1);
            mat.roughness = 0.5;
            mat.metallic = 0.05;
            const mr = obj.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(3, positions[i].y * 2, 3);
            mr.material = mat;
            mr.castShadow = true;
            mr.receiveShadow = true;
            mr.visibleLayer = GisLayer.World;
            this.scene.addChild(obj);
        }

        // Water — a transparent blue plane slightly above terrain.
        const water = new Object3D();
        water.localPosition = new Vector3(10, 0.05, 6);
        const waterMat = new LitMaterial();
        waterMat.baseColor = new Color(0.2, 0.45, 0.8, 0.55);
        waterMat.blendMode = BlendMode.NORMAL;
        waterMat.transparent = true;
        const waterMr = water.addComponent(MeshRenderer);
        waterMr.geometry = new PlaneGeometry(10, 10);
        waterMr.material = waterMat;
        waterMr.visibleLayer = GisLayer.Water;
        this.scene.addChild(water);

        // Overlay billboard — translucent red. With camera.cullingMask
        // configured to drop Overlay (above), this object stays hidden
        // in the main view. Flip the cullingMask back to VisibleLayer.All
        // to confirm it shows up.
        const overlay = new Object3D();
        overlay.localPosition = new Vector3(0, 8, 0);
        const overlayMat = new LitMaterial();
        overlayMat.baseColor = new Color(1.0, 0.4, 0.3, 0.8);
        overlayMat.blendMode = BlendMode.NORMAL;
        overlayMat.transparent = true;
        const overlayMr = overlay.addComponent(MeshRenderer);
        overlayMr.geometry = new PlaneGeometry(4, 1);
        overlayMr.material = overlayMat;
        overlayMr.castShadow = false;
        overlayMr.visibleLayer = GisLayer.Overlay;
        this.scene.addChild(overlay);

        // Diagnostic log so the layer assignment is visible without
        // having to inspect every node from the editor.
        const summary = [
            ['terrain',           GisLayer.Terrain],
            ['ground decals (x2)', GisLayer.GroundDecal],
            ['buildings (x3)',    GisLayer.World],
            ['water',             GisLayer.Water],
            ['overlay billboard', GisLayer.Overlay],
        ] as const;
        console.log('[scene] layer assignments:');
        for (const [name, layer] of summary) {
            console.log(`  ${name.padEnd(20)} visibleLayer=0x${(layer >>> 0).toString(16).padStart(8, '0')}`);
        }
    }
}
