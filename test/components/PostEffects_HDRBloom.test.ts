import { test, end, delay } from '../util'
import { BloomPost, Camera3D, CameraUtil, Engine3D, Object3D, PostProcessingComponent, Scene3D, View3D } from '@orillusion/core';

await test('Post BloomPost test', async () => {
    const engine = await Engine3D.init();
    engine.frameRate = 10;

    let view = new View3D();
    view.scene = new Scene3D();
    view.camera = CameraUtil.createCamera3DObject(view.scene, "camera");
    engine.startRenderView(view);

    let postProcessing = view.scene.addComponent(PostProcessingComponent);
    postProcessing.addPost(BloomPost);
    await delay(100)
    Engine3D.pause()
})

setTimeout(end, 500)
