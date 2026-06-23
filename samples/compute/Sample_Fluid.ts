import { GUIHelp } from '@orillusion/debug/GUIHelp';
import { Camera3D, CameraUtil, ColliderComponent, Engine3D, HoverCameraController, Object3D, PointerEvent3D, Scene3D, SphereGeometry, Vector3, View3D } from '@orillusion/core';
import { FluidEmulation } from './fluid/FluidSimulator';
import { FluidSimulatorMaterial } from './fluid/FluidSimulatorMaterial';

export class Demo_Fluid {
    constructor() { }

    protected mLastPoint: Vector3 = new Vector3();
    protected mVelocity: Vector3 = new Vector3();

    async run() {
        const engine = await Engine3D.init({
            setting: {
                material: { materialChannelDebug: true },
                pick: { enable: true, mode: `pixel` },
                render: {
                    postProcessing: {
                        ssao: { radius: 0.1, aoPower: 4.2 },
                        gtao: { usePosFloat32: false, maxDistance: 0.65, maxPixel: 10 },
                    },
                },
            },
        });

        GUIHelp.init();

        let scene = new Scene3D();
        //await this.initScene(scene);

        let camera = CameraUtil.createCamera3DObject(scene);

        camera.perspective(60, engine.context3D.aspect, 0.01, 10000.0);
        let ctl = camera.object3D.addComponent(HoverCameraController);
        ctl.setCamera(-45, -30, 50, new Vector3(15, 0, 10));

        let view = new View3D();
        view.scene = scene;
        view.camera = camera;

        engine.startRenderView(view);
        await this.initScene(scene);
    }

    async initScene(scene: Scene3D) {
        let obj = new Object3D();

        let emulation = obj.addComponent(FluidEmulation);
        emulation.alwaysRender = true;
        emulation.geometry = new SphereGeometry(0.08, 8, 8);
        emulation.material = new FluidSimulatorMaterial();
        scene.addChild(obj);

        obj.addComponent(ColliderComponent);
        let pickFire = scene.view.pickFire;
        pickFire.addEventListener(
            PointerEvent3D.PICK_MOVE,
            function (e: PointerEvent3D) {
                let point = e.data.worldPos;
                if (point.y >= 0 && (this.mLastPoint.x != point.x && this.mLastPoint.y != point.y && this.mLastPoint.z != point.z)) {
                    Vector3.sub(point, this.mLastPoint, this.mVelocity);
                    this.mLastPoint.copy(point);
                    let r = scene.view.camera;
                    let ray = r.screenPointToRay(scene.view.engine3D.inputSystem.mouseX, scene.view.engine3D.inputSystem.mouseY);
                    emulation.updateInputInfo(scene.view.camera.transform.localPosition, ray.direction, this.mVelocity);
                    return;
                }
            }, this);
    }

    async initComputeBuffer() { }
}

