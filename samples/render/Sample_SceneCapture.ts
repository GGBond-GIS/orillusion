import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    Scene3D, Engine3D, AtmosphericComponent, CameraUtil, HoverCameraController,
    View3D, Object3D, DirectLight, KelvinUtil, MeshRenderer, UnLitMaterial,
    PlaneGeometry, BoxGeometry, LitMaterial, Color, Camera3D,
    SceneCaptureCameraComponent, RendererMaskUtil,
} from "@orillusion/core";

/**
 * SceneCapture demo. A side camera renders the scene into an RT,
 * which is then sampled by an UnLitMaterial on a quad — the
 * traditional "security monitor" / "magic mirror" setup.
 *
 * - Side camera placed off to the right looking back at the scene.
 * - Capture camera excludes the monitor quad itself (via custom
 *   bit on its rendererMask) so the feed can't recurse.
 */
class Sample_SceneCapture {
    engine: Engine3D;
    scene: Scene3D;

    async run() {
        const engine = this.engine = await Engine3D.init({});

        this.scene = new Scene3D();
        this.scene.addComponent(AtmosphericComponent);

        // Main camera.
        const mainCam = CameraUtil.createCamera3DObject(this.scene);
        mainCam.perspective(60, engine.aspect, 0.01, 5000.0);
        mainCam.object3D.addComponent(HoverCameraController).setCamera(20, -25, 250);

        const view = new View3D();
        view.scene = this.scene;
        view.camera = mainCam;
        engine.startRenderView(view);

        // Light.
        {
            const light = new Object3D();
            light.rotationX = 45; light.rotationY = 45;
            const dl = light.addComponent(DirectLight);
            dl.lightColor = KelvinUtil.color_temperature_to_rgb(5500);
            dl.intensity = 3;
            this.scene.addChild(light);
        }

        // A few colored cubes as the "scene" being captured.
        const colors: [number, number, number][] = [[1, 0.2, 0.2], [0.2, 1, 0.2], [0.2, 0.4, 1], [1, 0.9, 0.2]];
        for (let i = 0; i < 4; i++) {
            const cube = new Object3D();
            const mr = cube.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(20, 20, 20);
            const mat = new LitMaterial();
            mat.baseColor = new Color(colors[i][0], colors[i][1], colors[i][2], 1);
            mr.material = mat;
            cube.x = (i - 1.5) * 35;
            cube.y = 10;
            this.scene.addChild(cube);
        }

        // Floor.
        {
            const floor = new Object3D();
            const mr = floor.addComponent(MeshRenderer);
            mr.geometry = new PlaneGeometry(400, 400);
            const mat = new LitMaterial();
            mat.baseColor = new Color(0.4, 0.4, 0.4, 1);
            mr.material = mat;
            this.scene.addChild(floor);
        }

        // Capture camera. Looks back at the cube row from the side.
        const captureCamRoot = new Object3D();
        captureCamRoot.x = 100;
        captureCamRoot.y = 30;
        captureCamRoot.z = 0;
        captureCamRoot.rotationY = -90;
        const captureCam = captureCamRoot.addComponent(Camera3D);
        captureCam.perspective(60, 1.0, 0.01, 5000);
        const cap = captureCamRoot.addComponent(SceneCaptureCameraComponent);
        cap.width = 512;
        cap.height = 512;
        cap.clearColor = new Color(0.05, 0.05, 0.1, 1);

        // Custom mask bit reserved for "scene-capture self" — the monitor
        // quad below adds it to its rendererMask, the capture excludes
        // anything carrying it. Bit 11 is unused by the engine's
        // built-in RendererMask values (highest is Graphic3D = 1<<10).
        const SELF_MASK = 1 << 11;
        cap.excludeMask = SELF_MASK;
        this.scene.addChild(captureCamRoot);

        // Render the capture onto a quad in the main scene — the
        // material's baseMap is the capture's RT. Capture-RT allocation
        // is lazy: getCaptureTexture() returns null until the pass has
        // run at least once. Wait one frame, then bind.
        await new Promise(r => setTimeout(r, 50));

        const monitor = new Object3D();
        monitor.x = 0; monitor.y = 80; monitor.z = -40;
        monitor.rotationX = 90;
        const mr = monitor.addComponent(MeshRenderer);
        mr.geometry = new PlaneGeometry(80, 80);
        const monitorMat = new UnLitMaterial();
        monitorMat.baseColor = new Color(1, 1, 1, 1);
        mr.material = monitorMat;
        // Tag this renderer with the self-bit so capture skips it.
        mr.rendererMask = RendererMaskUtil.addMask(mr.rendererMask, SELF_MASK);
        this.scene.addChild(monitor);

        // Bind the capture RT into the monitor's UnLit material.
        const tex = cap.getCaptureTexture();
        if (tex) {
            monitorMat.baseMap = tex as any;
        } else {
            console.warn('[Sample_SceneCapture] capture RT not yet allocated — bind on next frame');
        }

        GUIHelp.init();
        GUIHelp.addFolder('SceneCapture').open();
        GUIHelp.add(cap, 'width', 128, 1024, 64);
        GUIHelp.add(cap, 'height', 128, 1024, 64);
        GUIHelp.add(cap, 'includeSky');
        GUIHelp.add(cap, 'includeTransparent');
        GUIHelp.add({ mode: cap.updateMode }, 'mode', ['always', 'manual']).onChange((v: any) => cap.updateMode = v);
        GUIHelp.add({ trigger: () => { cap.needUpdate = true; } }, 'trigger');
    }
}

new Sample_SceneCapture().run();
