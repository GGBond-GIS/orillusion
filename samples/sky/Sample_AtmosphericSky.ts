import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { GUIUtil } from "@samples/utils/GUIUtil";
import { createExampleScene } from "@samples/utils/ExampleScene";
import { AtmosphericComponent, Engine3D, GPUCullMode, MeshRenderer, Object3D, PlaneGeometry, Scene3D, UnLitMaterial, Vector3 } from "@orillusion/core";

// sample of AtmosphericSky
class Sample_AtmosphericSky {
    async run() {
        // init engine
        const engine = await Engine3D.init({});
        // init scene
        let scene: Scene3D = createExampleScene(engine).scene;
        // start renderer
        engine.startRenderView(scene.view);
        // add atmospheric sky
        let sky = scene.getComponent(AtmosphericComponent);
        // The scattering sky is materialized on first render; force it here so we can sample
        // its 2D face texture synchronously.
        (sky as any)._ensureSky(engine.context3D);

        let texture = sky['_atmosphericScatteringSky'];
        let ulitMaterial = new UnLitMaterial(engine.context3D);
        ulitMaterial.baseMap = texture.texture2D;
        ulitMaterial.cullMode = GPUCullMode.none;
        // The sky texture is linear HDR (rgba16float). Skip UnLit's sRGB->linear
        // decode so the plane feeds the global ACES tonemap the same linear
        // values the skybox does — otherwise gammaToLiner blows out HDR>1 values.
        ulitMaterial.shader.getDefaultColorShader().setDefine('USE_SRGB_ALBEDO', true);
        let obj = new Object3D();
        scene.addChild(obj);
        let r = obj.addComponent(MeshRenderer);
        r.material = ulitMaterial;
        r.geometry = new PlaneGeometry(100, 50, 1, 1, Vector3.Z_AXIS);
        scene.addChild(obj);

        // gui
        GUIHelp.init();
        GUIUtil.renderAtmosphericSky(sky);
    }
}

new Sample_AtmosphericSky().run();