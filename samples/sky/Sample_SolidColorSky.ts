import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { createExampleScene } from "@samples/utils/ExampleScene";
import { SolidColorSky, Engine3D, SkyRenderer, Color, Object3DUtil, GridObject } from "@orillusion/core";

// sample to display solid color sky
class HDRSkyMap {
    async run() {
        // init engine
        const engine = await Engine3D.init({});
        GUIHelp.init();
        // init scene
        let scene = createExampleScene(engine).scene;
        // use solid color as background
        let sky = scene.getOrAddComponent(SkyRenderer);
        sky.map = new SolidColorSky(new Color(0.3, 0.5, 0.3, 1), engine.context3D);
        //gui
        GUIHelp.addColor(sky.map, 'color');
        GUIHelp.open();
        GUIHelp.endFolder();
        // create a basic cube
        scene.addChild(Object3DUtil.GetSingleCube(10, 10, 10, 0.6, 0.6, 0.6));
        // add a grid
        scene.addChild(new GridObject(1000, 100));
        // start renderer
        engine.startRenderView(scene.view);
    }

}

new HDRSkyMap().run();