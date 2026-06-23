import { Engine3D, Scene3D, EarthSkyRenderer, AxisObject, CameraUtil, HoverCameraController, View3D, Vector3, Object3D, MeshRenderer, SphereGeometry, UnLitMaterial, SkyRenderer } from "@orillusion/core";
import { GUIHelp } from "@orillusion/debug/GUIHelp";

// sample to use EarthSkyRenderer - renders backface of a sphere sampling cube texture
class Sample_EarthSky {
    async run() {
        // init engine — Engine3D.init now returns the engine instance;
        // runtime accessors (res / aspect / startRenderView / setting) live on
        // it because the engine is multi-instance. Settings are passed in via
        // the init payload rather than the removed global Engine3D.setting.
        const engine = await Engine3D.init({
            setting: {
                doublePrecision: true,
                useRTE: true,
                render: {
                    useLogDepth: true,
                },
            },
        });

        GUIHelp.init();

        // init scene. EarthSkyRenderer now carries RendererMask.Sky and
        // occupies the scene's single sky slot, so we do NOT also attach a
        // plain SkyRenderer here — the two would race for the same slot
        // (last-write wins in EntityCollect.setSky).
        let scene = new Scene3D();
        let sky = scene.addComponent(SkyRenderer);
        engine.res.loadLDRTextureCube('https://cdn.orillusion.com/images/space.webp').then(tex => sky.map = tex);

        const RADIUS = 6378137;

        // init Camera3D
        let camera = CameraUtil.createCamera3DObject(scene);
        camera.perspective(45, engine.aspect, 0.1, RADIUS * 6);
        camera.lookAt(
            new Vector3(5202999.946567677, 3175373.735383637, -1893737.1094392757),
            new Vector3(5202994.729998277, 3175383.3505969886, -1893735.210763289),
            new Vector3(0.8137976813493738, 0.5000000000000017, -0.29619813272602075)
        );

        // create a basic cube for reference
        scene.addChild(new AxisObject(6, 0.1));
        {
            let obj = new Object3D();
            let mr = obj.addComponent(MeshRenderer);
            mr.geometry = new SphereGeometry(RADIUS, 256, 256);
            mr.material = new UnLitMaterial();
            engine.res.loadTexture('https://cdn.orillusion.com/images/earth-day.jpg').then((texture) => {
                (mr.material as UnLitMaterial).baseMap = texture;
            });
            scene.addChild(obj);
        }

        // init View3D
        let view = new View3D();
        view.scene = scene;
        view.camera = camera;

        // start renderer
        engine.startRenderView(view);

        let targetPos = new Vector3(5202994.729998277, 3175383.3505969886, -1893735.210763289);

        // init Camera Controller
        let cameraCtrl = camera.object3D.addComponent(HoverCameraController);
        cameraCtrl.setCamera(0, 0, RADIUS, targetPos);
        cameraCtrl.maxDistance = RADIUS * 5;

        // add EarthSkyRenderer component
        let earthSky = scene.addComponent(EarthSkyRenderer);

        // optionally set the radius
        earthSky.radius = RADIUS + 100 * 1000;

        // load sky texture (cube map with 6 faces)
        engine.res.loadTextureCubeMaps([
            'textures/cubemap/sky/right.jpg',
            'textures/cubemap/sky/left.jpg',
            'textures/cubemap/sky/top.jpg',
            'textures/cubemap/sky/bottom.jpg',
            'textures/cubemap/sky/front.jpg',
            'textures/cubemap/sky/back.jpg',
        ]).then((cubeTexture) => {
            // set the cube texture to earth sky
            earthSky.map = cubeTexture;
        });
        
        // set exposure (optional)
        earthSky.exposure = 1.0;
        
        // set roughness for mipmap level (optional)
        earthSky.roughness = 0.0;

        // Set yaw and pitch to control sky rotation independently of camera
        earthSky.yaw = 0.0;
        earthSky.pitch = 0.0;

        // Debug
        GUIHelp.add(earthSky, 'exposure', 0, 5, 0.1);
        GUIHelp.add(earthSky, 'roughness', 0, 1, 0.01);
        GUIHelp.add(earthSky, 'yaw', -Math.PI, Math.PI, 0.01);
        GUIHelp.add(earthSky, 'pitch', -Math.PI / 2, Math.PI / 2, 0.01);
    }
}

new Sample_EarthSky().run();
