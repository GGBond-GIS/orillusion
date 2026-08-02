import { DirectLight, Engine3D, View3D, LitMaterial, HoverCameraController, KelvinUtil, MeshRenderer, Object3D, PlaneGeometry, Scene3D, SphereGeometry, PostProcessingComponent, CameraUtil, AtmosphericComponent, Color, SkylinePost } from '@orillusion/core'
import { GUIHelp } from '@orillusion/debug/GUIHelp';
import * as dat from '@orillusion/debug/dat.gui.module'
import { GUIUtil } from '@samples/utils/GUIUtil';

export class Sample_Skyline {
    engine:Engine3D;
    lightObj: Object3D
    scene: Scene3D

    constructor() { }

    async run() {
        const engine = this.engine = await Engine3D.init({
            canvasConfig: {
                devicePixelRatio: 1
            },
            setting: {
                shadow: {
                    enable: true,
                    shadowSize: 2048,
                    shadowBound: 50,
                },
            },
            renderLoop: () => this.loop()
        })

        this.scene = new Scene3D()
        this.scene.addComponent(AtmosphericComponent).sunY = 0.6

        let mainCamera = CameraUtil.createCamera3DObject(this.scene, 'camera')
        mainCamera.perspective(60, engine.context3D.aspect, 1, 2000.0)
        let ctrl = mainCamera.object3D.addComponent(HoverCameraController)
        ctrl.setCamera(-75, -30, 20)
        await this.initScene(this.scene)

        let view = new View3D()
        view.scene = this.scene
        view.camera = mainCamera
        engine.startRenderView(view)

        let postProcessing = this.scene.addComponent(PostProcessingComponent)
        let skylinePost = postProcessing.addPost(SkylinePost)

        // GUIHelp.init();
        // let folder = GUIHelp.addFolder('Skyline');
        // folder.addColor({ color: [255, 0, 0] }, 'color').onChange((v) => {
        //     skylinePost.lineColor = new Color(v[0] / 255, v[1] / 255, v[2] / 255, 1);
        // });
        // folder.add(skylinePost, 'lineWidth', 1, 10, 1);
        // folder.add(skylinePost, 'strength', 0, 1, 0.1);
        // folder.open();
    }

    async initScene(scene: Scene3D) {
        /******** light *******/
        {
            this.lightObj = new Object3D()
            this.lightObj.rotationX = 15
            this.lightObj.rotationY = 110
            this.lightObj.rotationZ = 0
            let lc = this.lightObj.addComponent(DirectLight)
            lc.lightColor = KelvinUtil.color_temperature_to_rgb(5355)
            lc.castShadow = true
            lc.intensity = 5
            lc.enableCSM = true;
            scene.addChild(this.lightObj)
            GUIUtil.renderDirLight(lc);
        }
        this.createPlane(scene)

        return true
    }

    private createPlane(scene: Scene3D) {
        let mat = new LitMaterial()
        mat.roughness = 0.5;
        mat.metallic = 0.5;
        {
            let debugGeo = new PlaneGeometry(1000, 1000)
            let obj: Object3D = new Object3D()
            let mr = obj.addComponent(MeshRenderer)
            mr.material = mat
            mr.geometry = debugGeo
            scene.addChild(obj)
        }

        let sphereGeometry = new SphereGeometry(1, 50, 50)
        for (let i = 0; i < 10; i++) {
            let obj: Object3D = new Object3D()
            let mr = obj.addComponent(MeshRenderer)
            mr.material = mat
            mr.geometry = sphereGeometry
            obj.x = 2
            obj.y = 2

            let angle = (2 * Math.PI * i) / 10
            obj.x = Math.sin(angle) * 2
            obj.z = Math.cos(angle) * 2
            scene.addChild(obj)
        }
    }

    loop() {
    }
}
