import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Engine3D, View3D, Scene3D, CameraUtil, AtmosphericComponent, HoverCameraController, Object3D, DirectLight, KelvinUtil, PlaneGeometry, VertexAttributeName, LitMaterial, MeshRenderer, Vector4, Vector3, Matrix3, PostProcessingComponent, TAAPost, BitmapTexture2D, GlobalFog, Color, FXAAPost } from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";
import { TerrainGeometry } from "@orillusion/geometry";

// An sample of custom vertex attribute of geometry
class Sample_Terrain {
    engine: Engine3D;
    view: View3D;
    post: PostProcessingComponent;
    async run() {
        GUIHelp.init();

        const engine = this.engine = await Engine3D.init({
            setting: {
                shadow: {
                    autoUpdate: true,
                    updateFrameRate: 1,
                    shadowSize: 2048,
                },
                // render: { zPrePass: true },
            },
        });
        this.view = new View3D();
        this.view.scene = new Scene3D();
        this.view.scene.addComponent(AtmosphericComponent);

        this.view.camera = CameraUtil.createCamera3DObject(this.view.scene);
        this.view.camera.perspective(60, engine.context3D.aspect, 1, 50000.0);
        this.view.camera.object3D.z = -15;
        this.view.camera.object3D.addComponent(HoverCameraController).setCamera(35, -20, 10000);

        engine.startRenderView(this.view);

        this.post = this.view.scene.addComponent(PostProcessingComponent);
        let fxaa = this.post.addPost(FXAAPost);
        let fog = this.post.addPost(GlobalFog);
        fog.start = 2000;
        fog.end = 0;
        fog.fogHeightScale = 0.116;
        fog.density = 0.094;
        fog.ins = 0.1041;
        fog.skyFactor = 0.35;
        fog.overrideSkyFactor = 0.7;

        fog.fogColor = new Color(136 / 255, 215 / 255, 236 / 255, 1);
        fog.fogHeightScale = 0.1;
        fog.falloff = 0.626;
        fog.scatteringExponent = 8;
        fog.dirHeightLine = 6.5;
        // post.addPost(TAAPost);

        this.createScene(this.view.scene);
    }

    private async createScene(scene: Scene3D) {
        {
            let sunObj = new Object3D();
            let sunLight = sunObj.addComponent(DirectLight);
            sunLight.lightColor = KelvinUtil.color_temperature_to_rgb(6553);
            sunLight.castShadow = true;
            sunLight.intensity = 3;
            sunObj.transform.rotationX = 50;
            sunObj.transform.rotationY = 50;
            GUIUtil.renderDirLight(sunLight);
            scene.addChild(sunObj);
        }

        //bitmap
        let bitmapTexture = await this.engine.res.loadTexture('terrain/test01/bitmap.png');
        let heightTexture = await this.engine.res.loadTexture('terrain/test01/height.png');
        // let heightTexture = await this.engine.res.loadTexture('terrain/test01/china.png');

        // let heightTexture = await this.engine.res.loadTexture('terrain/grass/GustNoise.png');
        let grassTexture = await this.engine.res.loadTexture('terrain/grass/GrassThick.png');
        let gustNoiseTexture = await this.engine.res.loadTexture('terrain/grass/displ_noise_curl_1.png');
        let terrainSizeW = 20488;
        let terrainSizeH = 20488;
        let terrainGeometry: TerrainGeometry;
        {
            let mat = new LitMaterial();
            terrainGeometry = new TerrainGeometry(terrainSizeW, terrainSizeH, 2000, 2000);
            terrainGeometry.setHeight(heightTexture as BitmapTexture2D, 5000);
            let floor = new Object3D();
            let mr = floor.addComponent(MeshRenderer);
            mr.geometry = terrainGeometry;
            mat.baseMap = bitmapTexture;
            mr.material = mat;
            scene.addChild(floor);
        }

        let globalFog = this.post.getPost(GlobalFog);
        GUIUtil.renderGlobalFog(globalFog);
    }

}

new Sample_Terrain().run();