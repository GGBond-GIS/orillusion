import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Scene3D, Engine3D, AtmosphericComponent, CameraUtil, HoverCameraController, View3D, Object3D, DirectLight, KelvinUtil, MeshRenderer, UnLitMaterial, PlaneGeometry, LitMaterial, Color, BoxGeometry } from "@orillusion/core";
import { UVMoveComponent } from "@samples/material/script/UVMoveComponent";
import { GUIUtil } from "@samples/utils/GUIUtil";


class Sample_ChangeMaterial {
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
            lightObj.rotationX = 57;
            lightObj.rotationY = 347;
            lightObj.rotationZ = 0;

            let directLight = lightObj.addComponent(DirectLight);
            directLight.lightColor = KelvinUtil.color_temperature_to_rgb(5355);
            directLight.castShadow = false;
            directLight.intensity = 5;
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
            let tex1 = await this.engine.res.loadTexture("textures/cell.png");
            let tex2 = await this.engine.res.loadTexture("textures/grid.jpg");
            let tex3 = await this.engine.res.loadTexture("textures/KB3D_NTT_Ads_basecolor.png");

            let mat1 = new LitMaterial();
            let mat2 = new LitMaterial();
            let mat3 = new LitMaterial();

            mat1.baseMap = tex1;
            mat2.baseMap = tex2;
            mat3.baseMap = tex3;

            let obj = new Object3D();
            let mr = obj.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(100, 100, 100);
            mr.material = mat1;
            this.scene.addChild(obj);

            GUIHelp.init();
            GUIHelp.addButton("change-mat1", () => {
                mr.material = mat1;
            });

            GUIHelp.addButton("change-mat2", () => {
                mr.material = mat2;
            });

            GUIHelp.addButton("change-mat3", () => {
                mr.material = mat3;
            });

            GUIHelp.open();
        }
    }

}

new Sample_ChangeMaterial().run();