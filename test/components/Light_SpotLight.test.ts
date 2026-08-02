import { test, expect, end, delay } from '../util'
import { Camera3D, CameraUtil, Color, Engine3D, Object3D, Scene3D, SpotLight, View3D } from '@orillusion/core';

await test('SpotLight test', async () => {
    const engine = await Engine3D.init();
    engine.frameRate = 10;

    let view = new View3D();
    view.scene = new Scene3D();
    view.camera = CameraUtil.createCamera3DObject(view.scene, "camera");
    let spotLight = new Object3D();
    let pl = spotLight.addComponent(SpotLight);
    pl.intensity = 10;
    pl.range = 10;
    pl.lightColor = new Color(1.0, 0.0, 0.0);
    // test shadow
    pl.castShadow = true;
    
    view.scene.addChild(spotLight);
    engine.startRenderViews([view]);
})



setTimeout(end, 500)
