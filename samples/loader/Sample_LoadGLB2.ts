import { Engine3D, LitMaterial, MeshRenderer, Object3D, PlaneGeometry, Scene3D } from "@orillusion/core";
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { GUI } from "@orillusion/debug/dat.gui.module";
import { createExampleScene } from "@samples/utils/ExampleScene";
import { GUIUtil } from "@samples/utils/GUIUtil";

// Sample to load glb file
export class Sample_LoadGLB2 {
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
        let exampleScene = createExampleScene(engine);
        exampleScene.atmosphericSky.displaySun = false;
        exampleScene.atmosphericSky.sunRadiance = 1;
        this.scene = exampleScene.scene;

        exampleScene.hoverCtrl.setCamera(-45, -20, 16);
        exampleScene.light.intensity = 5;
        engine.startRenderView(exampleScene.view);
        await this.initScene();

        GUIHelp.init();
        GUIUtil.renderAtmosphericSky(exampleScene.atmosphericSky);
        // GUIUtil.renderDebug();
    }

    async initScene() {
        /******** floor *******/
        // {
        //     let mat = new LitMaterial();
        //     mat.baseMap = this.engine.res.whiteTexture;
        //     mat.roughness = 0.85;
        //     mat.metallic = 0.1;
        //     let floor = new Object3D();
        //     let mr = floor.addComponent(MeshRenderer);
        //     mr.geometry = new PlaneGeometry(200, 200);
        //     mr.material = mat;
        //     this.scene.addChild(floor);
        // }

        /******** load glb file *******/
        let model = (await this.engine.res.loadGltf('gltfs/glb/lightbulb_01_1k.glb', { onProgress: (e) => this.onLoadProgress(e), onComplete: (e) => this.onComplete(e) })) as Object3D;
        this.scene.addChild(model);
        model.scaleX = model.scaleY = model.scaleZ = 100;
    }

    onLoadProgress(e) {
        console.log(e);
    }

    onComplete(e) {
        console.log(e);
    }

}
