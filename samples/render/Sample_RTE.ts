import { Engine3D, Scene3D, View3D, CameraUtil, Object3D, MeshRenderer, UnLitMaterial, Vector3, PlaneGeometry } from "@orillusion/core";
import { GUIHelp } from "@orillusion/debug/GUIHelp";

export class Sample_LogDepth {
    container: Object3D;
    async run() {
        Engine3D.setting.render.useLogDepth = true;
        Engine3D.setting.doublePrecision = sessionStorage.doublePrecision === 'false' ? false : true;
        Engine3D.setting.useRTE = sessionStorage.useRTE === 'false' ? false : true;
        console.log('doublePrecision:', Engine3D.setting.doublePrecision, ' useRTE:', Engine3D.setting.useRTE);
        await Engine3D.init({
            renderLoop: () => this.renderLoop()
        });
        GUIHelp.init();

        let scene = new Scene3D();
        let camera = CameraUtil.createCamera3DObject(scene);
        camera.perspective(60, Engine3D.aspect, 1.0, 6000 * 10000.0);
        camera.lookAt(new Vector3(0, 4000.001 * 10000.0, 0), new Vector3(0, 4000 * 10000.0, 0), Vector3.UP);

        this.initScene(scene);

        let view = new View3D();
        view.scene = scene;
        view.camera = camera;
        Engine3D.startRenderView(view);

        // change cull mode by click dropdown box
        GUIHelp.add(Engine3D.setting, 'doublePrecision').onChange((v) => {
            sessionStorage.doublePrecision = v
            location.reload()
        });
        GUIHelp.add(Engine3D.setting, 'useRTE').onChange((v) => {
            sessionStorage.useRTE = v
            location.reload()
        });
        GUIHelp.open();
        GUIHelp.endFolder();
    }

    async initScene(scene: Scene3D) {
        let mat = new UnLitMaterial();
        mat.baseMap = await Engine3D.res.loadTexture('textures/earth/8k_earth_daymap.jpg');
        let geo = new PlaneGeometry(600 * 10000.0, 600 * 10000.0, 128, 128);
        this.container = new Object3D();
        {
            let obj = new Object3D();
            let mr = obj.addComponent(MeshRenderer);
            mr.geometry = geo;
            mr.material = mat;
            obj.x = 300 * 10000.0;
            obj.y = 4000 * 10000.0;
            obj.rotationY = -90;
            this.container.addChild(obj);
        }
        {
            let obj = new Object3D();
            let mr = obj.addComponent(MeshRenderer);
            mr.geometry = geo;
            mr.material = mat;
            obj.x = -300 * 10000.0;
            obj.y = 4000 * 10000.0;
            this.container.addChild(obj);
        }
        scene.addChild(this.container);
    }
    renderLoop(){
        if(this.container){
            this.container.rotationY += 0.1;
        }
    }
}
