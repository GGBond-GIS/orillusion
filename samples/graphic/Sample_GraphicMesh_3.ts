import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Object3D, Scene3D, Engine3D, AtmosphericComponent, CameraUtil, HoverCameraController, View3D, MeshRenderer, UnLitTexArrayMaterial, BitmapTexture2DArray, Vector3, Matrix4, Time } from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";
import { Stats } from "@orillusion/stats";
import { Graphic3D, Graphic3DMesh } from "@orillusion/graphic";

export class Sample_GraphicMesh_3 {
    engine: Engine3D;
    lightObj3D: Object3D;
    scene: Scene3D;
    parts: Object3D[];
    width: number;
    height: number;
    cafe: number = 47;
    frame: number = 16;
    graphic3D: Graphic3D;

    constructor() { }

    async run() {

        Matrix4.maxCount = 500000;
        Matrix4.allocCount = 500000;

        const engine = this.engine = await Engine3D.init({
            beforeRender: () => this.update(),
            setting: {
                render: { debug: true },
            },
        });

        GUIHelp.init();

        this.scene = new Scene3D();
        this.scene.addComponent(Stats);
        let sky = this.scene.addComponent(AtmosphericComponent);
        sky.enable = false;
        let camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, engine.aspect, 1, 5000.0);

        camera.object3D.addComponent(HoverCameraController).setCamera(30, 0, 120);

        let view = new View3D();
        view.scene = this.scene;
        view.camera = camera;

        this.graphic3D = new Graphic3D();
        this.scene.addChild(this.graphic3D);

        engine.startRenderView(view);

        GUIUtil.renderDebug(view);

        await this.initScene();
    }

    async initScene() {
        let texts = [];
        let node = await this.engine.res.loadGltf("gltfs/glb/beer.glb") as Object3D;
        let geo = node.getComponents(MeshRenderer)[0].geometry;
        texts.push(this.engine.res.yellowTexture);

        let bitmapTexture2DArray = new BitmapTexture2DArray(texts[0].width, texts[0].height, texts.length, this.engine.context3D);
        bitmapTexture2DArray.setTextures(texts);

        let mat = new UnLitTexArrayMaterial(this.engine.context3D);
        mat.baseMap = bitmapTexture2DArray;
        mat.name = "LitMaterial";

        GUIHelp.add(this, "cafe", 0.0, 100.0);
        GUIHelp.add(this, "frame", 0.0, 100.0);
        {
            this.width = 100;
            this.height = 20;
            let mr = Graphic3DMesh.draw(this.scene, geo, bitmapTexture2DArray, this.width * this.height);
            this.parts = mr.object3Ds;

            for (let i = 0; i < this.width * this.height; i++) {
                const element = this.parts[i];
                mr.setTextureID(i, 0);

                let size = Math.random() * 5.0 + 1.0;
                element.transform.scaleX = size;
                element.transform.scaleY = size;
                element.transform.scaleZ = size;
            }
        }
    }

    update() {
        if (this.parts) {
            // let pos = new Vector3();
            for (let i = 0; i < this.parts.length; i++) {
                const element = this.parts[i];

                let tmp = this.sphericalFibonacci(i, this.parts.length);
                let r = this.cafe;
                tmp.multiplyScalar(r);

                let tr = Math.sin(i * (Time.frame * 0.0001) * this.frame * 0.01) + 1.0;
                tr *= 0.1;
                element.transform.scaleX = tr;
                element.transform.scaleY = tr;
                element.transform.scaleZ = tr;

                element.transform.localPosition = tmp;
            }
        }
    }

    public madfrac(A: number, B: number): number {
        return A * B - Math.floor(A * B);
    }

    public sphericalFibonacci(i: number, n: number): Vector3 {
        const PHI = Math.sqrt(5.0) * 0.5 + 0.5;
        let phi = 2.0 * Math.PI * this.madfrac(i, PHI - 1);
        let cosTheta = 1.0 - (2.0 * i + 1.0) * (1.0 / n);
        let sinTheta = Math.sqrt(Math.max(Math.min(1.0 - cosTheta * cosTheta, 1.0), 0.0));

        return new Vector3(
            Math.cos(phi) * sinTheta,
            Math.sin(phi) * sinTheta,
            cosTheta);

    }

}
