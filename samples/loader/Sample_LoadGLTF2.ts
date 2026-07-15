import { Engine3D, Object3D, Object3DUtil, Scene3D } from "@orillusion/core";
import { createExampleScene } from "@samples/utils/ExampleScene";

//Samples to show models, they are using PBR material
class Sample_LoadGLTF2 {
    engine: Engine3D;
    lightObj3D: Object3D;
    scene: Scene3D;
    async run() {
        //init engine
        const engine = this.engine = await Engine3D.init({
            //config settings
            setting: {
                material: { materialChannelDebug: true },
                shadow: { },
            },
        });
        let exampleScene = createExampleScene(engine);
        this.scene = exampleScene.scene;
        engine.startRenderView(exampleScene.view);
        await this.initScene();
    }

    async initScene() {

        let floor = Object3DUtil.GetSingleCube(100, 4, 100, 0.5, 0.5, 0.5);
        floor.y = -10;
        this.scene.addChild(floor);

        let chair = await this.engine.res.loadGltf('PBR/SheenChair/SheenChair.gltf') as Object3D;
        chair.scaleX = chair.scaleY = chair.scaleZ = 60;
        chair.rotationZ = chair.rotationX = 45;
        this.scene.addChild(chair);
    }
}

new Sample_LoadGLTF2().run();