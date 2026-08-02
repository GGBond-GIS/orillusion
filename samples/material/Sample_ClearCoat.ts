import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Object3D, Scene3D, Engine3D, CameraUtil, HoverCameraController, View3D, AtmosphericComponent, DirectLight, KelvinUtil, MeshRenderer, LitMaterial, SphereGeometry, Color, SkyRenderer } from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";

class Sample_ClearCoat {
    engine: Engine3D;
    lightObj3D: Object3D;
    scene: Scene3D;

    async run() {
        GUIHelp.init();

        const engine = this.engine = await Engine3D.init({
            setting: {
                pick: { enable: true /*, mode: `pixel` */ },
                render: { debug: true },
                //config settings
                shadow: { },
            },
        });

        this.scene = new Scene3D();
        let camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, engine.aspect, 1, 5000.0);


        camera.object3D.addComponent(HoverCameraController).setCamera(-25, -5, 300);

        let view = new View3D();
        view.scene = this.scene;
        view.camera = camera;

        engine.startRenderView(view);
        await this.initScene();

    }

    async initScene() {
        /******** sky *******/
        {
            // let tex = await this.engine.res.loadHDRTextureCube("hdri/T_Panorama05_HDRI.HDR");
            // let sky = this.scene.addComponent(SkyRenderer);
            // sky.map = tex;
            // sky.enable = true;
            let sky = this.scene.getOrAddComponent(SkyRenderer);
            sky.map = await this.engine.res.loadHDRTextureCube('/hdri/sunset.hdr');
            this.scene.envMap = sky.map;
        }
        /******** light *******/
        {
            this.lightObj3D = new Object3D();
            this.lightObj3D.rotationX = 124;
            this.lightObj3D.rotationY = 327;
            this.lightObj3D.rotationZ = 265.38;
            let directLight = this.lightObj3D.addComponent(DirectLight);
            directLight.lightColor = KelvinUtil.color_temperature_to_rgb(5355);
            directLight.castShadow = true;
            directLight.intensity = 1;
            GUIUtil.renderDirLight(directLight);
            this.scene.addChild(this.lightObj3D);
        }

        {
            // let model = (await this.engine.res.loadGltf('gltfs/apple_vision_pro/scene.gltf', {})) as Object3D;
            // let renderList = model.getComponentsInChild(MeshRenderer);
            // for (const item of renderList) {
            //     let material = item.material;
            //     if (material instanceof LitMaterial) {
            //         material.metallic = 1;
            //     }
            // }
            // model.transform.scaleX = 10;
            // model.transform.scaleY = 10;
            // model.transform.scaleZ = 10;
            // model.transform.y = -5;

            let clearCoatRoughnessTex = await this.engine.res.loadTexture("materials/T_Imperfections_FingerPrints_Mask2.jpg");

            // this.scene.addChild(model);
            let space = 50;
            let geo = new SphereGeometry(15, 35, 35);
            for (let i = 0; i < 10; i++) {
                var obj = new Object3D();
                let mr = obj.addComponent(MeshRenderer);
                mr.geometry = geo;
                let mat = new LitMaterial();
                mat.baseColor = Color.randomRGB();
                mat.metallic = 1;
                mat.roughness = (10 - i) / 30;
                mat.clearCoatRoughnessMap = clearCoatRoughnessTex;
                mat.clearcoatColor = new Color(1.0, 1.0, 1.0);
                mat.clearcoatWeight = 1;
                mat.clearcoatFactor = 0.5;
                mat.ior = 1.5;
                mat.clearcoatRoughnessFactor = 0.03;
                mr.material = mat;
                this.scene.addChild(obj);

                obj.x = space * i - space * 10 * 0.5;

                mat.name = `clearCoat_${i}`
                GUIUtil.renderLitMaterial(mat);
            }
        }
    }
}

new Sample_ClearCoat().run();