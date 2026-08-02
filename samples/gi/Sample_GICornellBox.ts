import { createExampleScene, createSceneParam } from "@samples/utils/ExampleScene";
import { Object3D, Scene3D, Engine3D, GlobalIlluminationComponent, Vector3, GTAOPost, PostProcessingComponent, BloomPost, View3D } from "@orillusion/core";
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { GUIUtil } from "@samples/utils/GUIUtil";

class Sample_GICornellBox {
    engine: Engine3D;
    scene: Scene3D;
    view: View3D;
    async run() {

        const engine = this.engine = await Engine3D.init({
            setting: {
                material: {
                    materialChannelDebug: true,
                    materialDebug: false,
                },
                gi: {
                    enable: true,
                    debug: true,
                    probeYCount: 6,
                    probeXCount: 6,
                    probeZCount: 6,
                    offsetX: 0,
                    offsetY: 10,
                    offsetZ: 0,
                    indirectIntensity: 1,
                    lerpHysteresis: 0.004,//default value is 0.01
                    maxDistance: 16,
                    probeSpace: 6,
                    normalBias: 0,
                    probeSize: 32,
                    octRTSideSize: 16,
                    octRTMaxSize: 2048,
                    ddgiGamma: 2.2,
                    depthSharpness: 1,
                    autoRenderProbe: true,
                },
                shadow: {
                    debug: true,
                    shadowSize: 2048,
                    autoUpdate: true,
                    updateFrameRate: 1,
                },
                render: {
                    debug: true,
                },
            },
            renderLoop: () => {
                if (this.giComponent?.isStart) {
                    GUIUtil.renderGIComponent(this.giComponent, this.view);
                    this.giComponent = null;
                }
            }
        });
        let param = createSceneParam();
        param.camera.distance = 100;

        let exampleScene = createExampleScene(engine, param);
        exampleScene.hoverCtrl.setCamera(0, 0, 50, new Vector3(0, 10, 0));
        this.scene = exampleScene.scene;
        this.view = exampleScene.view;
        // startRenderViews binds view.engine3D — must precede addGIProbes,
        // since GlobalIlluminationComponent.init reaches scene.view.engine3D
        // to size light/GI buffers.
        engine.startRenderViews([exampleScene.view]);
        this.addGIProbes(this.view);

        let postProcessing = this.scene.addComponent(PostProcessingComponent);
        postProcessing.addPost(BloomPost);

        await this.initScene();
    }

    private giComponent: GlobalIlluminationComponent;
    private addGIProbes(view: View3D) {
        let probeObj = new Object3D();
        GUIHelp.init();
        this.giComponent = probeObj.addComponent(GlobalIlluminationComponent, view.scene);
        this.scene.addChild(probeObj);
    }

    async initScene() {
        let box = await this.engine.res.loadGltf('gltfs/cornellBox/cornellBox.gltf') as Object3D;
        box.localScale = new Vector3(10, 10, 10);
        this.scene.addChild(box);
    }
}

new Sample_GICornellBox().run();