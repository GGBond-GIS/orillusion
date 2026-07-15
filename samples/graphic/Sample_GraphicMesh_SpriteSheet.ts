import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Object3D, Scene3D, Engine3D, AtmosphericComponent, CameraUtil, HoverCameraController, View3D, DirectLight, KelvinUtil, UnLitTexArrayMaterial, BitmapTexture2DArray, BitmapTexture2D, PlaneGeometry, Vector3, Matrix4, Time, BlendMode, Color, PostProcessingComponent, BloomPost, UV } from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";
import { Stats } from "@orillusion/stats";
import { Graphic3D, Graphic3DMesh, Graphic3DMeshRenderer } from "@orillusion/graphic";

export class Sample_GraphicMesh_SpriteSheet {
    engine: Engine3D;
    private lightObj3D: Object3D;
    private scene: Scene3D;
    private parts: Object3D[];
    private width: number;
    private height: number;
    private cafe: number = 47;
    private frame: number = 16;
    private view: View3D;
    private colors: Color[];
    private tmpArray: any[] = [];

    private color1: Color;
    private color2: Color;
    graphic3D: Graphic3D;
    graphicMeshRenderer: Graphic3DMeshRenderer;

    constructor() { }

    async run() {

        Matrix4.maxCount = 500000;
        Matrix4.allocCount = 500000;

        const engine = this.engine = await Engine3D.init({
            beforeRender: () => this.update(),
            setting: {
                render: { debug: true },
                shadow: { },
            },
        });

        this.colors = [];

        GUIHelp.init();

        this.scene = new Scene3D();
        this.scene.addComponent(Stats);
        let sky = this.scene.addComponent(AtmosphericComponent);
        sky.enable = false;
        let camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, engine.aspect, 1, 5000.0);

        camera.object3D.addComponent(HoverCameraController).setCamera(30, 0, 120);

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;

        this.graphic3D = new Graphic3D();
        this.scene.addChild(this.graphic3D);

        engine.startRenderView(this.view);

        GUIUtil.renderDebug(this.view);

        await this.initScene();
    }

    async initScene() {
        let texts = [];
        texts.push(await this.engine.res.loadTexture("textures/spriteSheet/sequence_0040.png") as BitmapTexture2D);

        let bitmapTexture2DArray = new BitmapTexture2DArray(texts[0].width, texts[0].height, texts.length, this.engine.context3D);
        bitmapTexture2DArray.setTextures(texts);

        let mat = new UnLitTexArrayMaterial(this.engine.context3D);
        mat.baseMap = bitmapTexture2DArray;
        mat.name = "LitMaterial";

        GUIHelp.add(this, "cafe", 0.0, 100.0);
        GUIHelp.add(this, "frame", 0.0, 100.0);
        {
            this.width = 15;
            this.height = 15;
            let geometry = new PlaneGeometry(1, 1, 1, 1, Vector3.Z_AXIS);
            this.graphicMeshRenderer = Graphic3DMesh.draw(this.scene, geometry, bitmapTexture2DArray, this.width * this.height);
            this.parts = this.graphicMeshRenderer.object3Ds;

            this.graphicMeshRenderer.material.blendMode = BlendMode.ADD;
            this.graphicMeshRenderer.material.transparent = true;
            this.graphicMeshRenderer.material.depthWriteEnabled = false;
            this.graphicMeshRenderer.material.useBillboard = true;

            for (let i = 0; i < this.width * this.height; i++) {
                const element = this.parts[i];
                this.graphicMeshRenderer.setTextureID(i, 0);
                element.transform.scaleX = 5.5;
                element.transform.scaleY = 5.5;
                element.transform.scaleZ = 5.5;
            }

            this.color1 = new Color(1.5, 0.1, 0.2, 1.0);
            this.color2 = new Color(0.1, 0.1, 4.5, 1.0);
            let c2 = new Color(1.0, 1.1, 0.2, 0.45);
            this.colors.push(c2);
            this.colors.push(c2);
            this.colors.push(c2);
            this.colors.push(c2);
            this.colors.push(c2);
            this.colors.push(c2);
        }

        this.updateOnce(1000);
    }

    update() {
        this.updateOnce(Time.frame);
    }

    updateOnce(engineFrame: number) {
        if (this.parts) {
            this.tmpArray.length = 0;
            let len = this.parts.length;
            for (let i = 0; i < len; i++) {
                const element = this.parts[i];
                let tmp = this.sphericalFibonacci(i, len);
                tmp.multiplyScalar(this.cafe);
                element.transform.localPosition = tmp;
                this.tmpArray.push(element);
                // update uv
                this.graphicMeshRenderer.setUVRect(i, UV.getUVSheet((i / len) * 100 + engineFrame * 0.08, 3, 3));
            }

            for (let i = 0; i < this.tmpArray.length - 1; i++) {
                this.graphic3D.Clear(i.toString());
                this.graphic3D.drawLines(i.toString(), [
                    Vector3.ZERO,
                    this.tmpArray[i + 1].transform.worldPosition,
                ],
                    this.colors);
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
