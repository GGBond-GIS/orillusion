import { createExampleScene } from "@samples/utils/ExampleScene";
import { Engine3D, Scene3D, SkyRenderer, Object3DUtil } from "@orillusion/core";

// sample to replace sky map. (witch contains 6 faces)
class Sample_BitmapCubeSky {
    engine: Engine3D;
    async run() {
        // init engine
        const engine = this.engine = await Engine3D.init({});
        // init scene
        let scene: Scene3D = createExampleScene(engine).scene;
        let sky = scene.getOrAddComponent(SkyRenderer);
        // load sky texture (nx/px/py/ny/nz/pz), a total of 6 images
        let urls: string[] = [];
        urls.push('textures/cubemap/skybox_nx.png');
        urls.push('textures/cubemap/skybox_px.png');
        urls.push('textures/cubemap/skybox_py.png');
        urls.push('textures/cubemap/skybox_ny.png');
        urls.push('textures/cubemap/skybox_nz.png');
        urls.push('textures/cubemap/skybox_pz.png');

        sky.map = await this.engine.res.loadTextureCubeMaps(urls);
        // create a basic cube
        scene.addChild(Object3DUtil.GetSingleCube(10, 10, 10, 0.6, 0.6, 0.6));

        // start renderer
        engine.startRenderView(scene.view);

    }
}

new Sample_BitmapCubeSky().run();