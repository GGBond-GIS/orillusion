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
    PostProcessingComponent,
    Scene3D,
    SphereGeometry,
    View3D,
} from "@orillusion/core";
import { ContactShadowPost } from "@orillusion/core";
import { VolumetricFogPost } from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";

/**
 * High-ROI WebGPU rendering sample.
 *
 * Exercises:
 *   - PCSS soft shadows (`setting.shadow.type='SOFT'`) — distance-based
 *     contact hardening.
 *   - Contact Shadows (`ContactShadowPost`) — close-contact darkness
 *     under objects.
 *   - Volumetric Fog (`VolumetricFogPost`) — directional in-scattering
 *     for "god ray" / cinematic fog look.
 *
 * GUI sliders bind every effect knob so the visual contribution of
 * each is reviewable in isolation.
 */
class Sample_VolumetricFog {
    engine: Engine3D;
    scene: Scene3D;
    lightObj3D: Object3D;
    view: View3D;

    async run() {
        this.engine = await Engine3D.init({
            setting: {
                render: { debug: false } as any,
                shadow: {
                    enable: true,
                    type: 'SOFT', // PCSS — already wired in PCF_frag.ts:45-77
                    contactShadow: {
                        enable: true,
                        maxStepCount: 16,
                        maxDistance: 0.5,
                        thickness: 0.05,
                        bias: 0.01,
                        intensity: 1.0,
                    },
                } as any,
            },
        });

        GUIHelp.init();

        this.scene = new Scene3D();
        const sky = this.scene.addComponent(AtmosphericComponent);
        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 1, 5000.0);
        camera.object3D.addComponent(HoverCameraController).setCamera(45, -15, 60);

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;
        this.engine.startRenderView(this.view);

        GUIUtil.renderDebug(this.view);

        await this.initScene();
        sky.relativeTransform = this.lightObj3D.transform;

        // Wire post chain: contact shadows + volumetric fog.
        const post = this.view.scene.addComponent(PostProcessingComponent);
        post.addPost(ContactShadowPost);
        post.addPost(VolumetricFogPost);

        // Volumetric fog setting — turn it on
        const fogCfg = (this.engine.setting.render.postProcessing as any).volumetricFog;
        if (fogCfg) fogCfg.enable = true;

        this.initGUI();
    }

    async initScene() {
        // Lights.
        this.lightObj3D = new Object3D();
        this.lightObj3D.rotationX = 25;
        this.lightObj3D.rotationY = 90;
        const directLight = this.lightObj3D.addComponent(DirectLight);
        directLight.lightColor = KelvinUtil.color_temperature_to_rgb(4500);
        directLight.intensity = 6;
        directLight.castShadow = true;
        directLight.enableCSM = true;
        this.scene.addChild(this.lightObj3D);

        // Ground.
        {
            const ground = new Object3D();
            const r = ground.addComponent(MeshRenderer);
            r.geometry = new PlaneGeometry(200, 200, 1, 1);
            const m = new LitMaterial();
            m.baseColor = new Color(0.7, 0.7, 0.7, 1);
            m.roughness = 0.85;
            m.metallic = 0;
            r.material = m;
            ground.transform.y = -2;
            this.scene.addChild(ground);
        }

        // Pillars to cast god-ray-style shadows in fog.
        const pillarColors = [
            new Color(0.95, 0.5, 0.4, 1),
            new Color(0.5, 0.85, 0.95, 1),
            new Color(0.95, 0.85, 0.4, 1),
            new Color(0.6, 0.95, 0.5, 1),
        ];
        for (let i = 0; i < 4; i++) {
            const pillar = new Object3D();
            const r = pillar.addComponent(MeshRenderer);
            r.geometry = new BoxGeometry(2, 18, 2);
            const m = new LitMaterial();
            m.baseColor = pillarColors[i];
            m.roughness = 0.5;
            m.metallic = 0.05;
            r.material = m;
            pillar.transform.x = (i - 1.5) * 8;
            pillar.transform.y = 7;
            this.scene.addChild(pillar);
        }

        // Spheres at ground level — show contact shadow + PCSS contact hardening.
        for (let i = 0; i < 6; i++) {
            const sphere = new Object3D();
            const r = sphere.addComponent(MeshRenderer);
            r.geometry = new SphereGeometry(1.2, 32, 32);
            const m = new LitMaterial();
            m.baseColor = new Color(0.8, 0.8, 0.85, 1);
            m.roughness = 0.3;
            m.metallic = 0.6;
            r.material = m;
            sphere.transform.x = (i - 2.5) * 5;
            sphere.transform.y = -0.8;
            sphere.transform.z = 8;
            this.scene.addChild(sphere);
        }
    }

    private initGUI() {
        GUIHelp.addFolder('PCSS / Contact Shadow');
        const proxy: any = {
            shadowSoft: 0.005,
            csIntensity: 1.0,
            csDistance: 0.5,
            fogDensity: 0.05,
            fogScattering: 1.0,
            fogAnisotropy: 0.6,
        };
        GUIHelp.add(proxy, 'shadowSoft', 0.001, 0.05, 0.001).onChange((v: number) => {
            (this.engine.setting.shadow as any).shadowSoft = v;
        });
        GUIHelp.add(proxy, 'csIntensity', 0.0, 2.0, 0.05).onChange((v: number) => {
            (this.engine.setting.shadow as any).contactShadow.intensity = v;
        });
        GUIHelp.add(proxy, 'csDistance', 0.05, 2.0, 0.05).onChange((v: number) => {
            (this.engine.setting.shadow as any).contactShadow.maxDistance = v;
        });
        GUIHelp.endFolder();

        GUIHelp.addFolder('Volumetric Fog');
        GUIHelp.add(proxy, 'fogDensity', 0.0, 0.3, 0.005).onChange((v: number) => {
            (this.engine.setting.render.postProcessing as any).volumetricFog.density = v;
        });
        GUIHelp.add(proxy, 'fogScattering', 0.0, 5.0, 0.1).onChange((v: number) => {
            (this.engine.setting.render.postProcessing as any).volumetricFog.scatteringIntensity = v;
        });
        GUIHelp.add(proxy, 'fogAnisotropy', -0.95, 0.95, 0.01).onChange((v: number) => {
            (this.engine.setting.render.postProcessing as any).volumetricFog.anisotropy = v;
        });
        GUIHelp.open();
        GUIHelp.endFolder();
    }
}

new Sample_VolumetricFog().run();
