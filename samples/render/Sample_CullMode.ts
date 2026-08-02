import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Engine3D, Scene3D, AtmosphericComponent, Object3D, OrbitController, DirectLight, Color, View3D, BitmapTexture2D, UnLitMaterial, MeshRenderer, PlaneGeometry, Vector3, GPUCullMode, CameraUtil } from "@orillusion/core";

class Sample_CullMode {
    async run() {
        const engine = await Engine3D.init();
        GUIHelp.init();

        let scene = new Scene3D();
        let sky = scene.addComponent(AtmosphericComponent);

        let camera = CameraUtil.createCamera3DObject(scene);
        camera.perspective(60, engine.aspect, 0.01, 10000.0);
        camera.object3D.z = 3;

        let oribit = camera.object3D.addComponent(OrbitController);
        oribit.autoRotate = true;
        oribit.autoRotateSpeed = 1;

        let view = new View3D();
        view.scene = scene;
        view.camera = camera;

        engine.startRenderView(view);

        // add direct light. rotationX = 45 keeps the sun above the
        // horizon so the AtmosphericSky stays in day-mode (the
        // previous -45 placed it below, dropping the sky into a
        // dark dusk that made the UnLit plane unreadable).
        let lightObj = new Object3D();
        lightObj.rotationX = 45;
        let light = lightObj.addComponent(DirectLight);
        light.lightColor = new Color(1.0, 1.0, 1.0, 1.0);
        light.intensity = 3;
        scene.addChild(lightObj);

        sky.relativeTransform = light.transform;

        let planeObj: Object3D;
        let texture = new BitmapTexture2D(true, engine.context3D);
        await texture.load('https://cdn.orillusion.com/gltfs/cube/material_02.png');
        let material = new UnLitMaterial(engine.context3D);
        material.baseMap = texture;
        material.cullMode = GPUCullMode.none;

        planeObj = new Object3D();
        let mr = planeObj.addComponent(MeshRenderer);
        mr.geometry = new PlaneGeometry(2, 2, 10, 10, Vector3.Z_AXIS);
        mr.material = material;
        scene.addChild(planeObj);

        //cull mode
        let cullMode = {};
        cullMode[GPUCullMode.none] = GPUCullMode.none;
        cullMode[GPUCullMode.front] = GPUCullMode.front;
        cullMode[GPUCullMode.back] = GPUCullMode.back;

        // change cull mode by click dropdown box
        GUIHelp.add({ cullMode: GPUCullMode.none }, 'cullMode', cullMode).onChange((v: GPUCullMode) => {
            material.cullMode = v;
        });
        GUIHelp.open();
        GUIHelp.endFolder();
    }
}

new Sample_CullMode().run();