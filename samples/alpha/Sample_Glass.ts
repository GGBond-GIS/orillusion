import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    AtmosphericComponent,
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
 * Glass / Transmission focused demo.
 *
 * Front row — 5 reference spheres, each fixed to a representative
 * material so you can directly compare:
 *   • Water    (ior 1.33, smooth, no tint)
 *   • Glass    (ior 1.52, smooth, faint green tint)
 *   • Crystal  (ior 1.8,  smooth, no tint)
 *   • Diamond  (ior 2.4,  smooth, no tint) — the most extreme refraction
 *   • Frosted  (ior 1.5,  roughness 0.7, no tint)
 *
 * Back row — single LARGE interactive sphere that the GUI sliders
 * (ior / transmission / roughness / thickness / attenuationColor)
 * drive in real time. Use the preset dropdown to jump between
 * "tinted glass", "amber whisky", "rainbow gradient" etc.
 *
 * The colored backdrop wall behind everything gives the refraction
 * something distinctive to bend — without strong source colors the
 * transmission lobe reads neutral and looks like a flat lit sphere.
 */
class Sample_Glass {
    engine: Engine3D;
    scene: Scene3D;
    lightObj3D: Object3D;
    view: View3D;

    private interactiveGlass!: LitMaterial;

    async run() {
        this.engine = await Engine3D.init({
            setting: {
                render: { debug: false, msaa: 4 } as any,
                shadow: { enable: true, type: 'SOFT' },
            },
        });

        GUIHelp.init();

        this.scene = new Scene3D();
        const sky = this.scene.addComponent(AtmosphericComponent);
        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 1, 5000.0);
        camera.object3D.addComponent(HoverCameraController).setCamera(15, -8, 38);

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;
        this.engine.startRenderView(this.view);

        GUIUtil.renderDebug(this.view);

        await this.initScene();
        sky.relativeTransform = this.lightObj3D.transform;

        this.initGUI();
    }

    private buildGlass(
        ior: number,
        roughness: number,
        attenuationColor: Color,
        attenuationDistance: number,
        thickness: number,
    ): LitMaterial {
        const m = new LitMaterial();
        m.baseColor = new Color(1, 1, 1, 1);
        m.metallic = 0;
        m.roughness = roughness;
        m.ior = ior;
        m.transmissionFactor = 1.0;
        m.thicknessFactor = thickness;
        m.attenuationDistance = attenuationDistance;
        m.attenuationColor = attenuationColor;
        return m;
    }

    async initScene() {
        // Lights.
        this.lightObj3D = new Object3D();
        this.lightObj3D.rotationX = 30;
        this.lightObj3D.rotationY = 130;
        const directLight = this.lightObj3D.addComponent(DirectLight);
        directLight.lightColor = KelvinUtil.color_temperature_to_rgb(6500);
        directLight.intensity = 4;
        this.scene.addChild(this.lightObj3D);

        // Ground (light gray, large).
        {
            const ground = new Object3D();
            const r = ground.addComponent(MeshRenderer);
            r.geometry = new PlaneGeometry(120, 120, 1, 1);
            const m = new LitMaterial();
            m.baseColor = new Color(0.85, 0.85, 0.85, 1);
            m.roughness = 0.9;
            m.metallic = 0;
            r.material = m;
            ground.transform.y = -5;
            this.scene.addChild(ground);
        }

        // Saturated backdrop wall — five tall colored panels behind the
        // glass row. Tall + saturated = refraction reads clearly.
        const wallColors = [
            new Color(1.0, 0.18, 0.20, 1),
            new Color(0.10, 0.65, 1.0, 1),
            new Color(1.0, 0.85, 0.10, 1),
            new Color(0.20, 0.95, 0.40, 1),
            new Color(0.95, 0.30, 1.0, 1),
        ];
        for (let i = 0; i < wallColors.length; i++) {
            const panel = new Object3D();
            const r = panel.addComponent(MeshRenderer);
            r.geometry = new BoxGeometry(3.5, 14, 1);
            const m = new LitMaterial();
            m.baseColor = wallColors[i];
            m.roughness = 0.55;
            m.metallic = 0.05;
            r.material = m;
            panel.transform.x = (i - 2) * 4.2;
            panel.transform.y = 2;
            panel.transform.z = -10;
            this.scene.addChild(panel);
        }

        // Front row — 5 reference glasses, each preset to a real material.
        const refs = [
            { name: 'Water',   ior: 1.33, rough: 0.0, tint: new Color(0.95, 1.00, 1.00, 1), atten: 8.0,  thick: 0.5 },
            { name: 'Glass',   ior: 1.52, rough: 0.0, tint: new Color(0.95, 1.00, 0.95, 1), atten: 5.0,  thick: 0.7 },
            { name: 'Crystal', ior: 1.80, rough: 0.0, tint: new Color(1.00, 1.00, 1.00, 1), atten: 10.0, thick: 0.6 },
            { name: 'Diamond', ior: 2.40, rough: 0.0, tint: new Color(1.00, 1.00, 1.00, 1), atten: 20.0, thick: 0.5 },
            { name: 'Frosted', ior: 1.50, rough: 0.7, tint: new Color(0.97, 0.97, 0.95, 1), atten: 4.0,  thick: 0.6 },
        ];
        for (let i = 0; i < refs.length; i++) {
            const ref = refs[i];
            const obj = new Object3D();
            obj.name = ref.name;
            const r = obj.addComponent(MeshRenderer);
            r.geometry = new SphereGeometry(2.0, 48, 48);
            r.material = this.buildGlass(ref.ior, ref.rough, ref.tint, ref.atten, ref.thick);
            obj.transform.x = (i - 2) * 4.2;
            obj.transform.y = -2;
            obj.transform.z = -2;
            this.scene.addChild(obj);
        }

        // Centre back — large interactive sphere driven by the GUI.
        {
            this.interactiveGlass = this.buildGlass(
                1.5, 0.0,
                new Color(0.95, 1.0, 0.95, 1),
                5.0, 0.7,
            );
            const big = new Object3D();
            big.name = 'Interactive';
            const r = big.addComponent(MeshRenderer);
            r.geometry = new SphereGeometry(3.5, 64, 64);
            r.material = this.interactiveGlass;
            big.transform.x = 0;
            big.transform.y = 4;
            big.transform.z = 4;
            this.scene.addChild(big);
        }
    }

    private initGUI() {
        GUIHelp.addFolder('Interactive Glass');

        type Preset = {
            ior: number;
            transmission: number;
            roughness: number;
            thickness: number;
            tintR: number;
            tintG: number;
            tintB: number;
            attenuationDistance: number;
        };
        const presets: Record<string, Preset> = {
            'Default Glass':       { ior: 1.52, transmission: 1.0, roughness: 0.0, thickness: 0.7, tintR: 0.95, tintG: 1.00, tintB: 0.95, attenuationDistance: 5.0 },
            'Water':               { ior: 1.33, transmission: 1.0, roughness: 0.0, thickness: 0.5, tintR: 0.95, tintG: 1.00, tintB: 1.00, attenuationDistance: 8.0 },
            'Crystal':             { ior: 1.80, transmission: 1.0, roughness: 0.0, thickness: 0.6, tintR: 1.00, tintG: 1.00, tintB: 1.00, attenuationDistance: 10.0 },
            'Diamond':             { ior: 2.40, transmission: 1.0, roughness: 0.0, thickness: 0.5, tintR: 1.00, tintG: 1.00, tintB: 1.00, attenuationDistance: 20.0 },
            'Frosted Glass':       { ior: 1.52, transmission: 0.9, roughness: 0.7, thickness: 0.6, tintR: 0.97, tintG: 0.97, tintB: 0.95, attenuationDistance: 4.0 },
            'Amber Whisky':        { ior: 1.50, transmission: 1.0, roughness: 0.0, thickness: 0.8, tintR: 1.00, tintG: 0.55, tintB: 0.15, attenuationDistance: 1.5 },
            'Emerald':             { ior: 1.57, transmission: 1.0, roughness: 0.0, thickness: 0.8, tintR: 0.20, tintG: 0.85, tintB: 0.40, attenuationDistance: 1.2 },
            'Sapphire':            { ior: 1.77, transmission: 1.0, roughness: 0.0, thickness: 0.8, tintR: 0.15, tintG: 0.30, tintB: 0.95, attenuationDistance: 1.0 },
            'Solid (no transmit)': { ior: 1.50, transmission: 0.0, roughness: 0.4, thickness: 0.7, tintR: 1.00, tintG: 1.00, tintB: 1.00, attenuationDistance: 5.0 },
        };

        const proxy: any = { preset: 'Default Glass', ...presets['Default Glass'] };

        const apply = () => {
            this.interactiveGlass.ior = proxy.ior;
            this.interactiveGlass.transmissionFactor = proxy.transmission;
            this.interactiveGlass.roughness = proxy.roughness;
            this.interactiveGlass.thicknessFactor = proxy.thickness;
            this.interactiveGlass.attenuationColor = new Color(proxy.tintR, proxy.tintG, proxy.tintB, 1);
            this.interactiveGlass.attenuationDistance = proxy.attenuationDistance;
        };

        const presetCtl = GUIHelp.add(proxy, 'preset', Object.keys(presets));

        const sliders: Record<string, any> = {};
        sliders.ior = GUIHelp.add(proxy, 'ior', 1.0, 2.5, 0.01).onChange(() => apply());
        sliders.transmission = GUIHelp.add(proxy, 'transmission', 0.0, 1.0, 0.01).onChange(() => apply());
        sliders.roughness = GUIHelp.add(proxy, 'roughness', 0.0, 1.0, 0.01).onChange(() => apply());
        sliders.thickness = GUIHelp.add(proxy, 'thickness', 0.0, 5.0, 0.05).onChange(() => apply());
        sliders.tintR = GUIHelp.add(proxy, 'tintR', 0.0, 1.0, 0.01).onChange(() => apply());
        sliders.tintG = GUIHelp.add(proxy, 'tintG', 0.0, 1.0, 0.01).onChange(() => apply());
        sliders.tintB = GUIHelp.add(proxy, 'tintB', 0.0, 1.0, 0.01).onChange(() => apply());
        sliders.attenuationDistance = GUIHelp.add(proxy, 'attenuationDistance', 0.1, 30.0, 0.1).onChange(() => apply());

        presetCtl.onChange((name: string) => {
            const p = presets[name];
            if (!p) return;
            sliders.ior.setValue(p.ior);
            sliders.transmission.setValue(p.transmission);
            sliders.roughness.setValue(p.roughness);
            sliders.thickness.setValue(p.thickness);
            sliders.tintR.setValue(p.tintR);
            sliders.tintG.setValue(p.tintG);
            sliders.tintB.setValue(p.tintB);
            sliders.attenuationDistance.setValue(p.attenuationDistance);
        });

        apply();
        GUIHelp.open();
        GUIHelp.endFolder();
    }
}

new Sample_Glass().run();
