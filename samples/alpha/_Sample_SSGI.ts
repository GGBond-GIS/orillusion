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
    SSGIPost2,
    View3D,
} from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";

/**
 * Horizon-based Screen-Space Global Illumination demo.
 *
 * Brightly-coloured walls bounce indirect light onto a neutral
 * sphere in the centre — turn `intensity` down/up to see the
 * coloured GI pickup. Toggle the SSGI knob to compare with/without.
 *
 * MVP shader is in `assets/shader/compute/SSGI_cs.ts`. Hi-Z
 * accelerated cone trace is the upgrade path.
 */
class Sample_SSGI {
    engine: Engine3D;
    scene: Scene3D;
    lightObj3D: Object3D;
    view: View3D;

    async run() {
        this.engine = await Engine3D.init({});
        GUIHelp.init();

        this.scene = new Scene3D();
        const sky = this.scene.addComponent(AtmosphericComponent);
        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 1, 5000.0);
        camera.object3D.addComponent(HoverCameraController).setCamera(0, -8, 28);

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;
        this.engine.startRenderView(this.view);
        GUIUtil.renderDebug(this.view);

        await this.initScene();
        sky.relativeTransform = this.lightObj3D.transform;

        const post = this.view.scene.addComponent(PostProcessingComponent);
        post.addPost(SSGIPost2);

        // Default ssgi setting cluster
        const cfg = (this.engine.setting.render.postProcessing as any);
        cfg.ssgi = cfg.ssgi || {};
        cfg.ssgi.intensity = 0.6;
        cfg.ssgi.radius = 80;
        cfg.ssgi.sliceCount = 4;
        cfg.ssgi.stepCount = 8;

        this.initGUI();
    }

    async initScene() {
        // Top key light, soft.
        this.lightObj3D = new Object3D();
        this.lightObj3D.rotationX = 50;
        this.lightObj3D.rotationY = 30;
        const directLight = this.lightObj3D.addComponent(DirectLight);
        directLight.lightColor = KelvinUtil.color_temperature_to_rgb(6500);
        directLight.intensity = 3;
        this.scene.addChild(this.lightObj3D);

        // White ground.
        {
            const ground = new Object3D();
            const r = ground.addComponent(MeshRenderer);
            r.geometry = new PlaneGeometry(60, 60, 1, 1);
            const m = new LitMaterial();
            m.baseColor = new Color(0.9, 0.9, 0.9, 1);
            m.roughness = 0.85;
            r.material = m;
            ground.transform.y = -3;
            this.scene.addChild(ground);
        }

        // Three saturated colored walls — strong indirect bounces.
        const wallColors = [
            new Color(0.95, 0.1, 0.1, 1),  // red
            new Color(0.1, 0.95, 0.1, 1),  // green
            new Color(0.1, 0.1, 0.95, 1),  // blue
        ];
        const wallPositions = [
            { x: -10, z: 0, ry: 90 },
            { x: 10, z: 0, ry: -90 },
            { x: 0, z: -10, ry: 0 },
        ];
        for (let i = 0; i < 3; i++) {
            const wall = new Object3D();
            const r = wall.addComponent(MeshRenderer);
            r.geometry = new BoxGeometry(20, 14, 0.5);
            const m = new LitMaterial();
            m.baseColor = wallColors[i];
            m.roughness = 0.9;
            r.material = m;
            wall.transform.x = wallPositions[i].x;
            wall.transform.y = 4;
            wall.transform.z = wallPositions[i].z;
            wall.transform.rotationY = wallPositions[i].ry;
            this.scene.addChild(wall);
        }

        // Centre sphere — neutral, picks up colored GI.
        const sphere = new Object3D();
        const r = sphere.addComponent(MeshRenderer);
        r.geometry = new SphereGeometry(2.5, 48, 48);
        const m = new LitMaterial();
        m.baseColor = new Color(0.95, 0.95, 0.95, 1);
        m.roughness = 0.4;
        m.metallic = 0.1;
        r.material = m;
        sphere.transform.y = -0.5;
        this.scene.addChild(sphere);
    }

    private initGUI() {
        GUIHelp.addFolder('SSGI');
        const proxy: any = {
            intensity: 0.6,
            radius: 80,
            sliceCount: 4,
            stepCount: 8,
        };
        const cfg = (this.engine.setting.render.postProcessing as any).ssgi;
        GUIHelp.add(proxy, 'intensity', 0.0, 2.0, 0.05).onChange((v: number) => { cfg.intensity = v; });
        GUIHelp.add(proxy, 'radius', 10, 200, 5).onChange((v: number) => { cfg.radius = v; });
        GUIHelp.add(proxy, 'sliceCount', 2, 8, 1).onChange((v: number) => { cfg.sliceCount = v; });
        GUIHelp.add(proxy, 'stepCount', 4, 16, 1).onChange((v: number) => { cfg.stepCount = v; });
        GUIHelp.open();
        GUIHelp.endFolder();
    }
}

new Sample_SSGI().run();
