import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { GUIUtil } from "@samples/utils/GUIUtil";
import { createExampleScene } from "@samples/utils/ExampleScene";
import { Object3D, Scene3D, Color, Engine3D, OutlinePost, SphereGeometry, LitMaterial, MeshRenderer, ColliderComponent, PointerEvent3D, outlinePostManager, FXAAPost } from "@orillusion/core";

export class Sample_OutlineEffectPick {
    engine: Engine3D;
    lightObj: Object3D;
    scene: Scene3D;
    selectColor: Color;
    highLightColor: Color;

    constructor() {
        this.selectColor = new Color(1.0, 0, 0.0, 1.0);
        this.highLightColor = new Color(0.0, 1.0, 1.0, 1);
    }

    async run() {
        // init Engine3D
        const engine = this.engine = await Engine3D.init({
            setting: {
                shadow: {
                    enable: true,
                    shadowSize: 2048,
                },
                pick: {
                    mode: `pixel`,
                },
                render: {
                    postProcessing: {
                        outline: {
                            outlinePixel: 3,
                            fadeOutlinePixel: 6,
                            strength: 1,
                        },
                    },
                },
            },
        });

        let exampleScene = createExampleScene(engine);
        this.scene = exampleScene.scene;

        GUIHelp.init();
        GUIUtil.renderDirLight(exampleScene.light, false);

        let job = engine.startRenderView(exampleScene.view);
        job.addPost(new OutlinePost());

        this.initPickObject(this.scene);
    }

    private initPickObject(scene: Scene3D): void {
        let size: number = 9;
        let geometry = new SphereGeometry(size / 2, 20, 20);
        for (let i = 0; i < 10; i++) {
            let obj = new Object3D();
            obj.name = 'sphere ' + i;
            scene.addChild(obj);
            obj.x = (i - 5) * 10;

            let mat = new LitMaterial();
            mat.emissiveMap = this.engine.res.grayTexture;
            mat.emissiveIntensity = 0.0;

            let renderer = obj.addComponent(MeshRenderer);
            renderer.geometry = geometry;
            renderer.material = mat;

            // register collider component
            obj.addComponent(ColliderComponent);
        }

        let pickFire = scene.view.pickFire;
        // register event
        pickFire.addEventListener(PointerEvent3D.PICK_UP, this.onMouseUp, this);
        pickFire.addEventListener(PointerEvent3D.PICK_DOWN, this.onMouseDown, this);
        pickFire.addEventListener(PointerEvent3D.PICK_CLICK, this.onMousePick, this);
        pickFire.addEventListener(PointerEvent3D.PICK_OVER, this.onMouseOver, this);
        pickFire.addEventListener(PointerEvent3D.PICK_OUT, this.onMouseOut, this);
        pickFire.addEventListener(PointerEvent3D.PICK_MOVE, this.onMouseMove, this);
    }

    private onMouseUp(e: PointerEvent3D) {
        if (e.target) {
            outlinePostManager.clearOutline();
        }
    }

    private onMouseDown(e: PointerEvent3D) {
        if (e.target) {
            outlinePostManager.setOutline([e.target], this.selectColor);
        }
    }

    private onMousePick(e: PointerEvent3D) {
        if (e.target) {
            outlinePostManager.setOutline([e.target], this.selectColor);
        }
    }

    private onMouseOver(e: PointerEvent3D) {
        if (e.target) {
            outlinePostManager.setOutline([e.target], this.highLightColor);
        }
    }

    private onMouseOut(e: PointerEvent3D) {
        if (e.target) {
            outlinePostManager.clearOutline();
        }
    }

    private onMouseMove(e: PointerEvent3D) {
        if (e.target) {
            console.log("onMove -> ", e.target.name);
        }
    }

}

// new Sample_OutlineEffectPick().run();