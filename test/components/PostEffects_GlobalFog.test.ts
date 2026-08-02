import { test, expect, end, delay } from '../util'
import { Camera3D, CameraUtil, Engine3D, GlobalFog, Object3D, PostProcessingComponent, Scene3D, View3D } from '@orillusion/core';

await test('Post GlobalFog test', async () => {
    const engine = await Engine3D.init();
    engine.frameRate = 2;

    let view = new View3D();
    view.scene = new Scene3D();
    view.camera = CameraUtil.createCamera3DObject(view.scene, "camera");
    engine.startRenderViews([view]);

    let postProcessing = view.scene.addComponent(PostProcessingComponent);
    let fog = postProcessing.addPost(GlobalFog);
    await delay(500)
    let dest = Math.floor(window.innerWidth * window.devicePixelRatio);
    let src = fog.fogOpTexture?.width;
    expect(src).tobe(dest)
    Engine3D.pause()
})

setTimeout(end, 500)
