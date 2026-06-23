import { Scene3D, Engine3D, AtmosphericComponent, CameraUtil, HoverCameraController, View3D, SphereGeometry, Object3D, MeshRenderer, LitMaterial, SpotLight, BoxGeometry, Vector3 } from "@orillusion/core";
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { GUIUtil } from "@samples/utils/GUIUtil";

// sample of SpotLight
class Sample_SpotLight {
    engine: Engine3D;
    scene: Scene3D;

    async run() {
        const engine = this.engine = await Engine3D.init({
            setting: {
                occlusionQuery: {
                    enable: false,
                },
                shadow: {
                    enable: true,
                },
            },
        });

        GUIHelp.init();

        this.scene = new Scene3D();
        this.scene.addComponent(AtmosphericComponent);

        // init camera3D
        let mainCamera = CameraUtil.createCamera3D(null, this.scene);
        mainCamera.perspective(60, engine.aspect, 1, 2000.0);
        //set camera data
        mainCamera.object3D.addComponent(HoverCameraController).setCamera(0, -25, 1000);

        await this.initScene();

        let view = new View3D();
        view.scene = this.scene;
        view.camera = mainCamera;

        engine.startRenderView(view);
    }

    initScene() {
        this.makeLight();
        this.buildScene();
    }

    private makeLight(): void {
        let lightObj3D = new Object3D();

        let renderer = lightObj3D.addComponent(MeshRenderer);
        renderer.geometry = new SphereGeometry(5, 30, 30);
        renderer.material = new LitMaterial();
        // Helper sphere sits AT the light origin. If it casts shadow, with
        // front-face cube rendering every texel hits the sphere's inner
        // surface at distance=radius and the entire scene falls into shadow.
        renderer.castShadow = false;
        this.scene.addChild(lightObj3D);

        let spotLight = lightObj3D.addComponent(SpotLight);
        lightObj3D.x = -86;
        lightObj3D.y = 200;
        lightObj3D.z = -300;
        lightObj3D.transform.rotationX = 342;
        lightObj3D.transform.rotationY = 360;
        lightObj3D.transform.rotationZ = 199;
        spotLight.lightColor.r = 160 / 255;
        spotLight.lightColor.g = 160 / 255;
        spotLight.lightColor.b = 100 / 255;
        spotLight.intensity = 4;
        spotLight.radius = 1;
        spotLight.range = 787;
        spotLight.at = 25;
        spotLight.outerAngle = 96;
        spotLight.innerAngle = 0;
        spotLight.castShadow = true;

        GUIUtil.showSpotLightGUI(spotLight);
    }

    // Build a slightly complex scene
    private buildScene(): void {
        let mat = new LitMaterial();
        mat.baseMap = this.engine.res.grayTexture;

        let floor = new Object3D();
        let mr = floor.addComponent(MeshRenderer);
        mr.geometry = new BoxGeometry(2000, 1, 2000);
        mr.material = mat;
        this.scene.addChild(floor);

        let box = new BoxGeometry(1, 1, 1);
        let wall_w = new Object3D();
        wall_w.name = 'wall_w';
        wall_w.localScale = new Vector3(500, 100, 10);
        wall_w.localPosition = new Vector3(0, 50, 0);
        let mrw = wall_w.addComponent(MeshRenderer);
        mrw.geometry = box;
        mrw.material = mat;
        this.scene.addChild(wall_w);

        // Wall positions: move side walls outward by their half-thickness so
        // their inner face sits flush with wall_w's end. Previously centered at
        // ±250 which made wall_a/wall_d overlap wall_w in a 5×100×10 volume at
        // each corner — that produced a bright line along the corner edge in
        // the shadow map (two back-face depths fighting at the intersection).
        let wall_a = new Object3D();
        wall_a.name = 'wall_a';
        wall_a.localScale = new Vector3(10, 100, 500);
        wall_a.localPosition = new Vector3(255, 50, 0);
        let mra = wall_a.addComponent(MeshRenderer);
        mra.geometry = box;
        mra.material = mat;
        this.scene.addChild(wall_a);

        let wall_d = new Object3D();
        wall_d.name = 'wall_d';
        wall_d.localScale = new Vector3(10, 100, 500);
        wall_d.localPosition = new Vector3(-255, 50, 0);
        let mrd = wall_d.addComponent(MeshRenderer);
        mrd.geometry = box;
        mrd.material = mat;
        this.scene.addChild(wall_d);
    }
}

new Sample_SpotLight().run();
