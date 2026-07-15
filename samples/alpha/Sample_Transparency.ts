import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    AtmosphericComponent,
    BitmapTexture2D,
    BoxGeometry,
    CameraUtil,
    Color,
    DirectLight,
    Engine3D,
    HoverCameraController,
    KelvinUtil,
    LitMaterial,
    MeshRenderer,
    Object3D,
    PlaneGeometry,
    Scene3D,
    SphereGeometry,
    View3D,
} from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";

/**
 * End-to-end transparency demo: A2C alpha cutout, real Transmission
 * (refractive glass), and OIT vs sorted side-by-side comparison.
 *
 * Scene layout left → right:
 *   - alphaMode='MASK' plane: procedural leaf alpha-cutout, A2C edges.
 *   - 5 saturated backdrop cubes (refraction target).
 *   - Centre: large transmissive glass sphere.
 *   - 2 columns of stacked translucent slabs:
 *       column A (oitMode='sorted')  — back-to-front sorted alpha blend
 *       column B (oitMode='weighted') — Weighted Blended OIT (WBOIT)
 *   - Both columns get the same colours / spacing / alpha so the
 *     side-by-side comparison shows the algorithmic difference.
 */
function buildLeafAlphaTexture(): BitmapTexture2D {
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(60, 160, 80, 1.0)';
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 6 + Math.random() * 14;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.strokeStyle = 'rgba(80, 180, 100, 1.0)';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, size - 16, size - 16);
    const tex = new BitmapTexture2D(true);
    tex.source = cv;
    return tex;
}

class Sample_Transparency {
    engine: Engine3D;
    scene: Scene3D;
    lightObj3D: Object3D;
    view: View3D;

    // Explicit material references for GUI to manipulate. Avoids
    // walking scene.forChild on every slider change and ensures the
    // GUI hits the EXACT materials we want to control.
    private maskMaterial!: LitMaterial;
    private glassMaterial!: LitMaterial;
    private slabMaterials: LitMaterial[] = [];

    async run() {
        this.engine = await Engine3D.init({
            setting: {
                render: { debug: false, msaa: 4, useOIT: true } as any,
                shadow: { enable: true, type: 'HARD' },
            },
        });

        GUIHelp.init();

        this.scene = new Scene3D();
        const sky = this.scene.addComponent(AtmosphericComponent);
        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 1, 5000.0);
        camera.object3D.addComponent(HoverCameraController).setCamera(20, -3, 50);

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;
        this.engine.startRenderView(this.view);

        GUIUtil.renderDebug(this.view);

        await this.initScene();
        sky.relativeTransform = this.lightObj3D.transform;

        this.initGUI();
    }

    async initScene() {
        // Lights.
        this.lightObj3D = new Object3D();
        this.lightObj3D.rotationX = 30;
        this.lightObj3D.rotationY = 120;
        const directLight = this.lightObj3D.addComponent(DirectLight);
        directLight.lightColor = KelvinUtil.color_temperature_to_rgb(6500);
        directLight.intensity = 4;
        directLight.castShadow = false;
        this.scene.addChild(this.lightObj3D);

        // Ground.
        {
            const ground = new Object3D();
            const gr = ground.addComponent(MeshRenderer);
            gr.geometry = new PlaneGeometry(200, 200, 1, 1);
            const mat = new LitMaterial();
            mat.baseColor = new Color(0.85, 0.85, 0.85, 1);
            mat.roughness = 0.9;
            mat.metallic = 0;
            gr.material = mat;
            ground.transform.y = -7;
            this.scene.addChild(ground);
        }

        // Saturated backdrop cubes — sit BEHIND the glass sphere so
        // refraction / transmission has something distinctive to bend.
        const backdropColors = [
            new Color(1.0, 0.15, 0.20, 1),
            new Color(0.10, 0.65, 1.0, 1),
            new Color(1.0, 0.85, 0.10, 1),
            new Color(0.30, 0.95, 0.35, 1),
            new Color(0.95, 0.30, 1.0, 1),
        ];
        for (let i = 0; i < backdropColors.length; i++) {
            const box = new Object3D();
            const m = new LitMaterial();
            m.baseColor = backdropColors[i];
            m.roughness = 0.6;
            m.metallic = 0.05;
            const r = box.addComponent(MeshRenderer);
            // Tall + wide enough to fill the glass sphere's projected
            // footprint when seen from the camera. Without this the
            // refraction sample falls onto sky / ground and reads
            // mostly neutral, masking the effect.
            r.geometry = new BoxGeometry(3.5, 12, 3);
            r.material = m;
            box.transform.x = (i - 2) * 4.5;
            box.transform.y = 1;
            box.transform.z = -12;
            this.scene.addChild(box);
        }

        // P0: alphaMode='MASK' A2C plane — left side, double-sided.
        {
            const plane = new Object3D();
            this.maskMaterial = new LitMaterial();
            this.maskMaterial.baseColor = new Color(1, 1, 1, 1);
            this.maskMaterial.alphaCutoff = 0.5;
            this.maskMaterial.alphaMode = 'MASK';
            this.maskMaterial.baseMap = buildLeafAlphaTexture();
            this.maskMaterial.doubleSide = true;
            const r = plane.addComponent(MeshRenderer);
            r.geometry = new PlaneGeometry(10, 8, 1, 1);
            r.material = this.maskMaterial;
            plane.transform.x = -18;
            plane.transform.y = 1;
            plane.transform.rotationX = 90;
            this.scene.addChild(plane);
        }

        // P1: glass sphere with Transmission. Smooth + non-metallic so
        // refraction reads against the backdrop without spec lobe noise.
        {
            const glass = new Object3D();
            this.glassMaterial = new LitMaterial();
            this.glassMaterial.baseColor = new Color(1, 1, 1, 1);
            this.glassMaterial.roughness = 0.0;
            this.glassMaterial.metallic = 0;
            this.glassMaterial.ior = 1.5;
            this.glassMaterial.transmissionFactor = 1.0;
            this.glassMaterial.thicknessFactor = 0.6;
            this.glassMaterial.attenuationDistance = 5.0;
            this.glassMaterial.attenuationColor = new Color(0.92, 1.0, 0.95, 1);
            const r = glass.addComponent(MeshRenderer);
            r.geometry = new SphereGeometry(4.5, 64, 64);
            r.material = this.glassMaterial;
            glass.transform.x = 0;
            glass.transform.y = 1.5;
            glass.transform.z = 0;
            this.scene.addChild(glass);
        }

        // P2 — sorted vs WBOIT side-by-side comparison.
        // Two columns of 6 slabs each, identical colors / alpha /
        // spacing — only the oitMode differs. Wider spacing + slightly
        // higher per-slab alpha (0.35) keeps each layer individually
        // visible while still letting the back layers show through.
        const slabCount = 5;
        const slabAlpha = 0.30;
        const slabSpacing = 2.0;
        const palette = [
            new Color(1.0, 0.30, 0.30, 1),
            new Color(1.0, 0.65, 0.20, 1),
            new Color(1.0, 1.0, 0.30, 1),
            new Color(0.40, 1.0, 0.40, 1),
            new Color(0.30, 0.85, 1.0, 1),
            new Color(0.40, 0.40, 1.0, 1),
            new Color(0.85, 0.40, 1.0, 1),
            new Color(1.0, 0.40, 0.85, 1),
        ];

        const buildColumn = (centerX: number, mode: 'sorted' | 'weighted') => {
            for (let i = 0; i < slabCount; i++) {
                const slab = new Object3D();
                const m = new LitMaterial();
                m.baseColor = new Color(palette[i].r, palette[i].g, palette[i].b, slabAlpha);
                m.roughness = 0.3;
                m.metallic = 0;
                m.alphaMode = 'BLEND';
                m.oitMode = mode;
                const r = slab.addComponent(MeshRenderer);
                r.geometry = new BoxGeometry(5, 7, 0.25);
                r.material = m;
                slab.transform.x = centerX;
                slab.transform.y = 0;
                slab.transform.z = -((slabCount - 1) * slabSpacing) / 2 + i * slabSpacing;
                this.scene.addChild(slab);
                this.slabMaterials.push(m);
            }
        };
        buildColumn(15, 'sorted');
        buildColumn(24, 'weighted');
    }

    private initGUI() {
        GUIHelp.addFolder('Transparency demo');

        // Each preset is a complete snapshot of every controlled value
        // — picking one reseeds the whole GUI, so combinations stay
        // visually consistent.
        type Preset = {
            alphaCutoff: number;
            transmissionFactor: number;
            ior: number;
            glassRoughness: number;
            slabAlpha: number;
        };
        const presets: Record<string, Preset> = {
            'Default': {
                alphaCutoff: 0.5, transmissionFactor: 1.0, ior: 1.5,
                glassRoughness: 0.0, slabAlpha: 0.30,
            },
            'Crystal Glass': {
                alphaCutoff: 0.5, transmissionFactor: 1.0, ior: 2.0,
                glassRoughness: 0.0, slabAlpha: 0.20,
            },
            'Frosted Glass': {
                alphaCutoff: 0.5, transmissionFactor: 0.8, ior: 1.3,
                glassRoughness: 0.7, slabAlpha: 0.30,
            },
            'Diamond': {
                alphaCutoff: 0.5, transmissionFactor: 1.0, ior: 2.4,
                glassRoughness: 0.0, slabAlpha: 0.20,
            },
            'Solid Sphere (no transmission)': {
                alphaCutoff: 0.5, transmissionFactor: 0.0, ior: 1.5,
                glassRoughness: 0.4, slabAlpha: 0.30,
            },
            'Dense Foliage': {
                alphaCutoff: 0.2, transmissionFactor: 1.0, ior: 1.5,
                glassRoughness: 0.0, slabAlpha: 0.30,
            },
            'Sparse Foliage': {
                alphaCutoff: 0.75, transmissionFactor: 1.0, ior: 1.5,
                glassRoughness: 0.0, slabAlpha: 0.30,
            },
            'Ghost Slabs (5% alpha)': {
                alphaCutoff: 0.5, transmissionFactor: 1.0, ior: 1.5,
                glassRoughness: 0.0, slabAlpha: 0.08,
            },
            'Saturated Slabs': {
                alphaCutoff: 0.5, transmissionFactor: 1.0, ior: 1.5,
                glassRoughness: 0.0, slabAlpha: 0.55,
            },
        };

        const proxy: any = { preset: 'Default', ...presets['Default'] };

        // Apply the GUI values to the underlying materials. Called
        // both from individual slider onChange and from the preset
        // dropdown after it bulk-updates the proxy.
        const applyAll = () => {
            this.maskMaterial.alphaCutoff = proxy.alphaCutoff;
            this.glassMaterial.transmissionFactor = proxy.transmissionFactor;
            this.glassMaterial.ior = proxy.ior;
            this.glassMaterial.roughness = proxy.glassRoughness;
            for (const m of this.slabMaterials) {
                const c = m.baseColor;
                m.baseColor = new Color(c.r, c.g, c.b, proxy.slabAlpha);
            }
        };

        // Preset dropdown — picks reseed every other slider AND
        // pushes the values into the materials in one shot.
        const presetCtl = GUIHelp.add(proxy, 'preset', Object.keys(presets));

        // Individual sliders — held in a map so the preset dropdown
        // can refresh their visual state via dat.gui's setValue.
        const sliderCtls: Record<string, any> = {};
        sliderCtls.alphaCutoff = GUIHelp.add(proxy, 'alphaCutoff', 0.0, 1.0, 0.01).onChange((v: number) => {
            this.maskMaterial.alphaCutoff = v;
        });
        sliderCtls.transmissionFactor = GUIHelp.add(proxy, 'transmissionFactor', 0.0, 1.0, 0.01).onChange((v: number) => {
            this.glassMaterial.transmissionFactor = v;
        });
        sliderCtls.ior = GUIHelp.add(proxy, 'ior', 1.0, 2.5, 0.01).onChange((v: number) => {
            this.glassMaterial.ior = v;
        });
        sliderCtls.glassRoughness = GUIHelp.add(proxy, 'glassRoughness', 0.0, 1.0, 0.01).onChange((v: number) => {
            this.glassMaterial.roughness = v;
        });
        sliderCtls.slabAlpha = GUIHelp.add(proxy, 'slabAlpha', 0.05, 0.6, 0.01).onChange((v: number) => {
            for (const m of this.slabMaterials) {
                const c = m.baseColor;
                m.baseColor = new Color(c.r, c.g, c.b, v);
            }
        });

        // Wire the dropdown last so all slider controllers exist
        // when its onChange runs.
        presetCtl.onChange((name: string) => {
            const p = presets[name];
            if (!p) return;
            // Push preset values into proxy + slider widgets. setValue
            // on a dat.gui Controller updates BOTH the underlying
            // proxy field AND the on-screen slider position, and fires
            // the slider's own onChange — so the per-slider material
            // setters run automatically.
            sliderCtls.alphaCutoff.setValue(p.alphaCutoff);
            sliderCtls.transmissionFactor.setValue(p.transmissionFactor);
            sliderCtls.ior.setValue(p.ior);
            sliderCtls.glassRoughness.setValue(p.glassRoughness);
            sliderCtls.slabAlpha.setValue(p.slabAlpha);
        });

        applyAll();
        GUIHelp.open();
        GUIHelp.endFolder();
    }
}

new Sample_Transparency().run();
