import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Scene3D, Engine3D, AtmosphericComponent, CameraUtil, HoverCameraController, View3D, Object3D, DirectLight, KelvinUtil, MeshRenderer, PlaneGeometry, LitMaterial, BlendMode } from "@orillusion/core";
import { UVMoveComponent } from "@samples/material/script/UVMoveComponent";
import { GUIUtil } from "@samples/utils/GUIUtil";


class Sample_UVMove {
    engine: Engine3D;
    scene: Scene3D;
    lightObj: Object3D;
    async run() {
        const engine = this.engine = await Engine3D.init({
            setting: {
                material: { materialChannelDebug: true },
                shadow: { },
            },
        });
        await GUIHelp.init();

        this.scene = new Scene3D();
        let sky = this.scene.addComponent(AtmosphericComponent);

        let camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, engine.aspect, 0.01, 5000.0);

        camera.object3D.addComponent(HoverCameraController).setCamera(25, -25, 200);

        let view = new View3D();
        view.scene = this.scene;
        view.camera = camera;

        engine.startRenderView(view);

        await this.initScene();
        sky.relativeTransform = this.lightObj.transform;
    }

    async initScene() {
        /******** sky *******/
        {
            this.scene.exposure = 1;
            this.scene.roughness = 0.0;
        }
        /******** light *******/
        {
            let lightObj = this.lightObj = new Object3D();
            lightObj.y = 64;
            lightObj.rotationX = 57;
            lightObj.rotationY = 347;
            lightObj.rotationZ = 0;

            let directLight = lightObj.addComponent(DirectLight);
            directLight.lightColor = KelvinUtil.color_temperature_to_rgb(5355);
            directLight.castShadow = false;
            directLight.intensity = 2;
            directLight.shadowBoundWidth = 512;
            directLight.shadowBoundHeight = 512;
            directLight.shadowBoundFar = 512;
            GUIUtil.renderDirLight(directLight);
            this.scene.addChild(lightObj);
        }

        {
            // add floor
            let floor = new Object3D();
            let material = new LitMaterial();
            material.doubleSide = true;
            material.baseMap = await this.engine.res.loadTexture("textures/diffuse.jpg");

            let renderer = floor.addComponent(MeshRenderer);
            renderer.material = material;
            renderer.geometry = new PlaneGeometry(200, 200, 1, 1);

            floor.y = -10;
            this.scene.addChild(floor);
        }

        {
            // add plane into scene
            let plane = new Object3D();
            let renderer = plane.addComponent(MeshRenderer);
            let material = new LitMaterial();
            material.baseMap = await this.engine.res.loadTexture("particle/T_Fx_Object_229.png");;
            renderer.material = material;
            material.blendMode = BlendMode.NORMAL;
            renderer.geometry = new PlaneGeometry(100, 100, 1, 1);
            this.scene.addChild(plane);

            // add UVMoveComponents
            GUIHelp.init();
            let component = plane.addComponent(UVMoveComponent);
            GUIUtil.renderUVMove(component);
        }


    }

}

new Sample_UVMove().run();