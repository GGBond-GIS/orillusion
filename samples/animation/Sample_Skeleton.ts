import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Object3D, Scene3D, Engine3D, AtmosphericComponent, CameraUtil, HoverCameraController, View3D, LitMaterial, MeshRenderer, BoxGeometry, DirectLight, KelvinUtil, Object3DUtil, AnimatorComponent, PostProcessingComponent, FXAAPost } from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";

class Sample_Skeleton {
    engine: Engine3D;
    lightObj3D: Object3D;
    scene: Scene3D;
    async run() {
        // Read the persisted shadow sampling type (if any) so the GUI dropdown
        // survives the required reload — see GUIUtil.renderShadowSetting.
        const storedType = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('shadowType') : null;
        const shadowType: 'HARD' | 'PCF' | 'SOFT' =
            storedType === 'PCF' || storedType === 'SOFT' ? storedType : 'HARD';

        const engine = this.engine = await Engine3D.init({
            setting: {
                shadow: {
                    type: shadowType,
                    autoUpdate: true,
                    updateFrameRate: 1,
                },
            },
        });

        this.scene = new Scene3D();
        let sky = this.scene.addComponent(AtmosphericComponent);

        let camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, engine.aspect, 0.01, 5000.0);

        let ctrl = camera.object3D.addComponent(HoverCameraController);
        ctrl.setCamera(-30, -45, 100);
        ctrl.maxDistance = 1000;

        let view = new View3D();
        view.scene = this.scene;
        view.camera = camera;

        engine.startRenderView(view);

        let postCom = this.scene.addComponent(PostProcessingComponent);
        postCom.addPost(FXAAPost);

        await this.initScene(this.scene);
        sky.relativeTransform = this.lightObj3D.transform;
    }


    async initScene(scene: Scene3D) {
        GUIHelp.init();
        GUIUtil.renderShadowSetting(this.engine);
        {
            // load model with skeleton animation
            let man = await this.engine.res.loadGltf('gltfs/CesiumMan/CesiumMan_compress.gltf');
            man.scaleX = 30;
            man.scaleY = 30;
            man.scaleZ = 30;
            // man.rotationZ = 90;
            scene.addChild(man);

            let animator = man.getComponentsInChild(AnimatorComponent)[0];
            animator.playAnim(animator.clips[0].clipName);

            GUIUtil.renderTransform(man.transform);
        }

        /******** floor *******/
        this.scene.addChild(Object3DUtil.GetSingleCube(3000, 1, 3000, 0.5, 0.5, 0.5));

        /******** light *******/
        {
            this.lightObj3D = new Object3D();
            this.lightObj3D.y = 100;
            this.lightObj3D.rotationX = 144;
            this.lightObj3D.rotationY = 0;
            this.lightObj3D.rotationZ = 0;
            let directLight = this.lightObj3D.addComponent(DirectLight);
            directLight.lightColor = KelvinUtil.color_temperature_to_rgb(5355);
            directLight.castShadow = true;
            directLight.intensity = 3;
            directLight.shadowBoundFar = 200;
            directLight.enableCSM = true;
            GUIUtil.renderDirLight(directLight);
            scene.addChild(this.lightObj3D);
        }

        return true;
    }

}

new Sample_Skeleton().run();