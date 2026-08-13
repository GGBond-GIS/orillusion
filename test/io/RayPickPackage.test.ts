import { test, expect, end } from '../util';
import { BoxGeometry, CameraUtil, Engine3D, GeometryBase, LitMaterial, MeshRenderer, Object3D, Ray, Scene3D, Vector3, View3D } from '@orillusion/core';
import { installGraphicRayPick, installRayPick, Raycaster, SceneRayPick, uninstallRayPick } from '@orillusion/ray-pick';

const engine = await Engine3D.init();
engine.frameRate = 10;

function createBox(): Object3D {
    const object = new Object3D();
    const renderer = object.addComponent(MeshRenderer);
    renderer.geometry = new BoxGeometry(2, 2, 2);
    renderer.material = new LitMaterial();
    renderer.material.cullMode = 'none';
    return object;
}

await test('ray pick is injected and removable', async () => {
    const object = createBox();
    const raycaster = new Raycaster(new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0)));

    uninstallRayPick();
    expect(raycaster.intersectObject(object).length).toEqual(0);

    installRayPick();
    const hits = raycaster.intersectObject(object);
    expect(hits.length).toEqual(4);
    expect(hits[0].object).tobe(object);
    expect(hits[0].distance).toSubequal(2, 0.001);
    expect(hits[0].faceIndex).toRange(0, 11);
    expect(hits[0].uv.x).toSubequal(0.5, 0.001);
    expect(hits[0].barycoord.x + hits[0].barycoord.y + hits[0].barycoord.z).toSubequal(1, 0.001);

    uninstallRayPick();
    expect(raycaster.intersectObject(object).length).toEqual(0);
});

await test('scene traversal returns sorted world-space hits', async () => {
    installRayPick();
    const root = new Object3D();
    const near = createBox();
    const far = createBox();
    near.y = 2;
    far.y = -3;
    root.addChild(far);
    root.addChild(near);

    const hits = new Raycaster(new Ray(new Vector3(0, 6, 0), new Vector3(0, -1, 0)))
        .intersectObject(root, true);
    expect(hits.length).toEqual(8);
    expect(hits[0].object).tobe(near);
    expect(hits[0].point.y).toSubequal(3, 0.001);
    expect(hits[0].distance).toSubequal(3, 0.001);
    for (let i = 1; i < hits.length; i++) {
        expect(hits[i].distance >= hits[i - 1].distance).tobe(true);
    }
});

await test('external instanced renderer can be injected without a package dependency', async () => {
    class GraphicLikeRenderer extends MeshRenderer {
        public sourceGeometry: GeometryBase;
        public object3Ds: Object3D[] = [];

        public create(source: GeometryBase): void {
            this.geometry = source;
        }
    }

    installRayPick();
    installGraphicRayPick(GraphicLikeRenderer);
    const owner = new Object3D();
    const renderer = owner.addComponent(GraphicLikeRenderer);
    renderer.material = new LitMaterial();
    renderer.material.cullMode = 'none';
    renderer.create(new BoxGeometry(2, 2, 2));
    const instance = new Object3D();
    instance.x = 4;
    owner.addChild(instance);
    renderer.object3Ds.push(instance);

    const hits = new Raycaster(new Ray(new Vector3(4, 3, 0), new Vector3(0, -1, 0)))
        .intersectObject(owner, false);
    expect(hits.length).toEqual(4);
    expect(hits[0].object).tobe(instance);
    expect(hits[0].point.x).toSubequal(4, 0.001);
});

await test('scene pointer bridge casts through the active camera', async () => {
    installRayPick();
    const scene = new Scene3D();
    const camera = CameraUtil.createCamera3DObject(scene, 'ray-pick-camera');
    camera.perspective(60, engine.aspect, 0.1, 100);
    camera.lookAt(new Vector3(0, 0, 10), Vector3.ZERO, Vector3.Y_AXIS);
    const view = new View3D();
    view.scene = scene;
    view.camera = camera;
    engine.startRenderView(view);

    const box = createBox();
    scene.addChild(box);
    engine.inputSystem.mouseX = engine.inputSystem.canvas.clientWidth / 2;
    engine.inputSystem.mouseY = engine.inputSystem.canvas.clientHeight / 2;

    const hits = new SceneRayPick(view).pick();
    expect(hits.length).toEqual(4);
    expect(hits[0].object).tobe(box);
    expect(hits[0].point.z).toSubequal(1, 0.05);
});

setTimeout(end, 100);
