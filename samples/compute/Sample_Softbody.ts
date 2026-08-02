import { GUIHelp } from '@orillusion/debug/GUIHelp';
import { AtmosphericComponent, BoxGeometry, CameraUtil, DirectLight, Engine3D, HoverCameraController, LitMaterial, MeshRenderer, Object3D, PlaneGeometry, Scene3D, View3D } from '@orillusion/core';
import { BunnySimulator } from "./softbody/BunnySimulator";

export class Demo_Softbody {
    engine: Engine3D;
    constructor() { }

    async run() {

        const engine = this.engine = await Engine3D.init({
            setting: {
                shadow: {
                    autoUpdate: true,
                    updateFrameRate: 1,
                },
            },
        });

        GUIHelp.init();

        let scene = new Scene3D();
        let sky = scene.addComponent(AtmosphericComponent);
        await this.initScene(scene);

        let camera = CameraUtil.createCamera3DObject(scene);

        camera.perspective(60, engine.context3D.aspect, 1, 5000.0);
        let ctl = camera.object3D.addComponent(HoverCameraController);
        ctl.setCamera(30, -28, 10);

        let view = new View3D();
        view.scene = scene;
        view.camera = camera;

        engine.startRenderView(view);
    }

    async initScene(scene: Scene3D) {
        let mat = new LitMaterial();
        mat.baseMap = this.engine.res.grayTexture;
        mat.roughness = 0.8;
        mat.metallic = 0.1;

        let box = new Object3D();
        box.transform.y = 0.0;
        box.transform.x = 0.0;
        box.transform.z = 0.0;
        let mr = box.addComponent(MeshRenderer);
        mr.geometry = new BoxGeometry(3.0, 3.0, 3.0);
        let boxMat = new LitMaterial();
        boxMat.roughness = 0.8;
        boxMat.metallic = 0.1
        boxMat.cullMode = `front`
        mr.material = boxMat;
        scene.addChild(box);

        let bunny = new Object3D();
        let simulator = bunny.addComponent(BunnySimulator);
        simulator.castShadow = true;
        simulator.SetInteractionBox(box);
        scene.addChild(bunny);

        var lightObj = new Object3D();
        lightObj.x = 0;
        lightObj.y = 100;
        lightObj.z = 0;
        lightObj.rotationX = 45;
        lightObj.rotationY = 217;
        lightObj.rotationZ = 0;
        let lc = lightObj.addComponent(DirectLight);
        lc.intensity = 3;
        lc.castShadow = true;
        lc.enableCSM = true;
        scene.addChild(lightObj);
    }
}
