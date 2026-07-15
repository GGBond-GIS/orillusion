import { Engine3D, LitMaterial, MeshRenderer, Object3D, PlaneGeometry, Scene3D } from "@orillusion/core";
import { createExampleScene } from "@samples/utils/ExampleScene";

// Sample to load glb file
export class Sample_LoadGLB3 {
    engine: Engine3D;
    scene: Scene3D;

    async run() {
        const engine = this.engine = await Engine3D.init({
            setting: {
                shadow: {
                    autoUpdate: true,
                },
            },
        });

        let exampleScene = createExampleScene(engine);
        this.scene = exampleScene.scene;

        exampleScene.hoverCtrl.setCamera(-45, -20, 8);
        exampleScene.light.intensity = 5;
        engine.startRenderView(exampleScene.view);
        await this.initScene();
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
        let model = (await this.engine.res.loadGltf('gltfs/glb/modelNew.glb', { onProgress: (e) => this.onLoadProgress(e), onComplete: (e) => this.onComplete(e) })) as Object3D;
        this.scene.addChild(model);
        model.scaleX = model.scaleY = model.scaleZ = 0.001;
    }

    onLoadProgress(e) {
        console.log(e);
    }

    onComplete(e) {
        console.log(e);
    }

}
