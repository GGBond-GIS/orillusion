import { CameraUtil, Engine3D, Object3DUtil, PointerEvent3D, Scene3D, Vector3, View3D } from '@orillusion/core';
import { installRayPick, Raycaster } from '@orillusion/ray-pick';

const engine = await Engine3D.init();
const scene = new Scene3D();
const camera = CameraUtil.createCamera3DObject(scene, 'camera');
camera.perspective(60, engine.aspect, 0.1, 1000);
camera.lookAt(new Vector3(0, 5, 10), Vector3.ZERO, Vector3.Y_AXIS);

const cube = Object3DUtil.GetSingleCube(2, 2, 2, 0.3, 0.6, 1);
cube.name = 'pickable cube';
scene.addChild(cube);

const view = new View3D();
view.scene = scene;
view.camera = camera;
engine.startRenderView(view);

// Injection is explicit and reversible; importing the package has no side effects.
installRayPick();
engine.inputSystem.addEventListener(PointerEvent3D.POINTER_MOVE, () => {
    const raycaster = new Raycaster();
    raycaster.setFromCamera(engine.inputSystem.mouseX, engine.inputSystem.mouseY, camera);
    const hit = raycaster.intersectScene(scene)[0];
    cube.scaleX = cube.scaleY = cube.scaleZ = hit?.object === cube ? 1.15 : 1;
}, null);
