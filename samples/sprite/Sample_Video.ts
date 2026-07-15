import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    AtmosphericComponent,
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
    View3D,
} from "@orillusion/core";
import { VideoTexture } from "@orillusion/media-extention";

/**
 * Sprite renders a `VideoTexture` (WebGPU `texture_external`) in **world
 * space** — a textured quad floating in the 3D scene, like an in-world
 * advertising billboard or a cinematic cut-scene surface. The SpriteRenderer
 * component auto-detects the video texture and flips `USE_VIDEO_TEXTURE` on
 * the material, swapping the sampling code path at shader compile time.
 */
class Sample_Video {
    engine: Engine3D;
    scene: Scene3D;
    view: View3D;
    lightObj: Object3D;

    private obj: Object3D;
    private sprite: SpriteRenderer;
    private video: VideoTexture;

    private readonly state = {
        width: 16,
        height: 9,
        color: new Color(1, 1, 1, 1),
    };

    async run() {
        GUIHelp.init();

        this.engine = await Engine3D.init({});

        this.scene = new Scene3D();
        let sky = this.scene.addComponent(AtmosphericComponent);

        let camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 0.1, 5000.0);
        camera.object3D.addComponent(HoverCameraController).setCamera(0, -10, 40);

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

        /******** video texture *******/
        this.video = new VideoTexture(this.engine.context3D);
        await this.video.load('video/chicken.mp4');

        /******** video sprite in world space *******/
        this.obj = new Object3D();
        this.sprite = this.obj.addComponent(SpriteRenderer);
        this.sprite.size = new Vector2(this.state.width, this.state.height);
        this.sprite.pivot = new Vector2(0.5, 0.5);
        this.sprite.color = this.state.color;
        this.sprite.texture = this.video;    // auto-flips USE_VIDEO_TEXTURE define
        this.scene.addChild(this.obj);
    }

    private initGUI() {
        GUIHelp.addFolder('Video sprite');
        GUIHelp.add(this.state, 'width', 2, 40, 0.5).onChange(v => this.sprite.size = new Vector2(v, this.state.height));
        GUIHelp.add(this.state, 'height', 2, 40, 0.5).onChange(v => this.sprite.size = new Vector2(this.state.width, v));
        GUIHelp.addColor(this.state, 'color').onChange(c => this.sprite.color = c);
        GUIHelp.open();
        GUIHelp.endFolder();

    }
}

new Sample_Video().run();
