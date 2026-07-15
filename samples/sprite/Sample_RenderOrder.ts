import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    AtmosphericComponent,
    BitmapTexture2D,
    CameraUtil,
    Color,
    DirectLight,
    Engine3D,
    HoverCameraController,
    KelvinUtil,
    Object3D,
    Scene3D,
    SpriteRenderer,
    Vector2,
    Vector3,
    View3D,
} from "@orillusion/core";

/**
 * Three overlapping sprite cards demonstrating `SpriteRenderer.renderOrder` —
 * the sort key the engine uses inside the transparent bucket
 * (renderOrder >= 3000). Higher number renders later, so it ends up on top.
 *
 * The preset buttons cycle which color is in front. Each click assigns
 * 3002 / 3001 / 3000 to the three cards so the named one ends up drawn
 * last and visibly covers the overlap zone.
 */
class Sample_RenderOrder {
    engine: Engine3D;
    scene: Scene3D;
    view: View3D;
    lightObj: Object3D;
    texture: BitmapTexture2D;

    private cards: Array<{ sprite: SpriteRenderer; name: string }> = [];

    async run() {
        GUIHelp.init();

        this.engine = await Engine3D.init({});

        this.scene = new Scene3D();
        let sky = this.scene.addComponent(AtmosphericComponent);

        let camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 0.1, 5000.0);
        camera.object3D.addComponent(HoverCameraController).setCamera(0, -10, 8);

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;

        this.engine.startRenderView(this.view);

        await this.initScene();
        sky.relativeTransform = this.lightObj.transform;

        this.initGUI();
    }

    async initScene() {
        /******** light *******/
        {
            this.lightObj = new Object3D();
            this.lightObj.rotationX = 45;
            this.lightObj.rotationY = 110;
            let lc = this.lightObj.addComponent(DirectLight);
            lc.lightColor = KelvinUtil.color_temperature_to_rgb(5355);
            lc.intensity = 3;
            this.scene.addChild(this.lightObj);
        }

        /******** texture *******/
        {
            this.texture = new BitmapTexture2D();
            this.texture.flipY = true;
            await this.texture.load('textures/KB3D_NTT_Ads_basecolor.png');
        }

        /******** three overlapping cards *******/
        //
        // The three cards live at z=0 but are offset slightly in X/Y so the
        // user can see each one's outline. They all fit inside a ~2x2 region
        // so the overlap zone in the middle is where renderOrder actually
        // decides what's on top.
        //
        const defs = [
            { name: 'red',   color: new Color(1.0, 0.3, 0.3, 1), offsetX: -0.5, offsetY:  0.4, order: 3000 },
            { name: 'green', color: new Color(0.3, 1.0, 0.4, 1), offsetX:  0.5, offsetY:  0.4, order: 3001 },
            { name: 'blue',  color: new Color(0.4, 0.5, 1.0, 1), offsetX:  0.0, offsetY: -0.4, order: 3002 },
        ] as const;

        for (const d of defs) {
            const obj = new Object3D();
            const sprite = obj.addComponent(SpriteRenderer);
            sprite.texture = this.texture;
            sprite.size = new Vector2(2.0, 2.0);
            sprite.pivot = new Vector2(0.5, 0.5);
            sprite.cornerRadius = 0.2;
            sprite.color = d.color;
            obj.localPosition = new Vector3(d.offsetX, d.offsetY + 2, 0);
            this.scene.addChild(obj);
            // Set renderOrder AFTER addChild. addChild triggers onEnable which
            // calls `RenderNode.set materials`, and that setter recomputes
            // renderOrder from the material's pass — any pre-addChild value
            // is overwritten there. Post-addChild sets apply cleanly.
            sprite.renderOrder = d.order;
            this.cards.push({ sprite, name: d.name });
        }
    }

    private _preset(topName: string) {
        // Named card gets the highest renderOrder (drawn last = on top).
        // The other two share 3000 and 3001.
        const others = this.cards.filter(c => c.name !== topName);
        others[0].sprite.renderOrder = 3000;
        others[1].sprite.renderOrder = 3001;
        this.cards.find(c => c.name === topName)!.sprite.renderOrder = 3002;
    }

    private initGUI() {
        GUIHelp.addFolder('Bring to front');
        GUIHelp.addButton('Red on top',   () => this._preset('red'));
        GUIHelp.addButton('Green on top', () => this._preset('green'));
        GUIHelp.addButton('Blue on top',  () => this._preset('blue'));
        GUIHelp.open();
        GUIHelp.endFolder();
    }
}

new Sample_RenderOrder().run();
