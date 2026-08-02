import { CameraUtil, Engine3D, HoverCameraController, LitMaterial, MeshRenderer, Object3D, PlaneGeometry, Scene3D, SkyRenderer, Vector3, View3D } from "@orillusion/core";
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { GUI } from "@orillusion/debug/dat.gui.module";
import { createExampleScene } from "@samples/utils/ExampleScene";
import { GUIUtil } from "@samples/utils/GUIUtil";

// Sample to load glb file
export class Sample_Lightbulb {
    engine: Engine3D;
    scene: Scene3D;

    async run() {
        const engine = this.engine = await Engine3D.init({
            setting: {
                render: { debug: true },
                shadow: {
                    autoUpdate: true,
                },
            },
        });

        let scene = this.scene = new Scene3D();
        // scene.exposure = param.scene.exposure;

        const sky = this.scene.addComponent(SkyRenderer);
        sky.map = await this.engine.res.loadLDRTextureCube('sky/LDR_sky.jpg')
        this.scene.envMap = sky.map;

        // init Camera3D
        let camera = CameraUtil.createCamera3DObject(scene);
        camera.perspective(60, engine.aspect, 0.1, 1000);

        // init Camera Controller
        let hoverCtrl = camera.object3D.addComponent(HoverCameraController);
        hoverCtrl.setCamera(-45, -20, 16, new Vector3(0, 2, 0));

        // init View3D
        let view = new View3D();
        view.scene = scene;
        view.camera = camera;
        engine.startRenderView(view);
        await this.initScene();

        GUIHelp.init();
    }

    async initScene() {
        /******** load glb file *******/
        let model = await this.engine.res.loadGltf('gltfs/glb/lightbulb_01_1k.glb');
        this.scene.addChild(model);
        model.scaleX = model.scaleY = model.scaleZ = 100;
    }
}
