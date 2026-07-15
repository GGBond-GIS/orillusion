import { Engine3D, Scene3D, EarthAtmRenderer, AxisObject, CameraUtil, HoverCameraController, View3D, Vector3, Object3D, MeshRenderer, SphereGeometry, UnLitMaterial, SkyRenderer } from "@orillusion/core";
import { GUIHelp } from "@orillusion/debug/GUIHelp";

// Sample to use EarthAtmRenderer - renders atmospheric scattering for Earth atmosphere
// Supports both view from space (looking at Earth) and view from ground (looking at sky)
class Sample_EarthAtm {
    async run() {
        // init engine — current API: Engine3D.init returns the engine instance
        // (runtime accessors res / aspect / startRenderView / setting live on
        // it, because the engine is multi-instance). Settings are passed in
        // via the init payload rather than the removed global Engine3D.setting.
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

        // init scene
        let scene = new Scene3D();
        // Distant star background occupies the scene's single sky slot.
        // EarthAtmRenderer below is a transparent overlay (no Sky mask) so
        // the two coexist: sky pass draws stars first, atmosphere later
        // through the transparent pass.
        let sky = scene.addComponent(SkyRenderer);
        engine.res.loadLDRTextureCube('https://cdn.orillusion.com/images/space.webp').then((texture) => {
            sky.map = texture;
        });

        const EARTH_RADIUS = 6371000; // Earth radius in meters
        const ATMOSPHERE_HEIGHT = 100000; // 100km atmosphere

        // init Camera3D
        let camera = CameraUtil.createCamera3DObject(scene);
        camera.perspective(45, engine.aspect, 0.1, EARTH_RADIUS * 6);

        // Position camera on Earth surface (ground view)
        // Camera is at a position on Earth's surface looking at the sky
        const cameraAltitude = 1000; // 1km above ground
        camera.lookAt(
            new Vector3(EARTH_RADIUS + cameraAltitude, 0, 0),
            new Vector3(EARTH_RADIUS + cameraAltitude + 1000, 1000, 0),
            new Vector3(1, 0, 0)
        );

        // create reference objects
        scene.addChild(new AxisObject(6, 0.1));

        // Create Earth sphere
        {
            let obj = new Object3D();
            let mr = obj.addComponent(MeshRenderer);
            mr.geometry = new SphereGeometry(EARTH_RADIUS, 256, 256);
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

        // init Camera Controller
        let cameraCtrl = camera.object3D.addComponent(HoverCameraController);
        let targetPos = new Vector3(5202994.729998277, 3175383.3505969886, -1893735.210763289);
        cameraCtrl.setCamera(0, 0, EARTH_RADIUS * 3, targetPos);
        cameraCtrl.maxDistance = EARTH_RADIUS * 5;

        // add EarthAtmRenderer component with atmospheric scattering
        let earthAtm = scene.addComponent(EarthAtmRenderer);
        
        // Configure for space view (looking at Earth from space)
        earthAtm.configureForSpaceView();
        
        // Set sky sphere radius (should be larger than atmosphere)
        earthAtm.radius = (EARTH_RADIUS + ATMOSPHERE_HEIGHT) * 1.5;
        
        // Set sun direction (sun position in sky)
        earthAtm.sunDirection = new Vector3(1, 0.3, 0.5);
        
        // Set sun intensity
        earthAtm.sunIntensity = 22.0;
        
        // Set exposure for tone mapping
        earthAtm.exposure = 1.0;

        // Debug controls
        GUIHelp.addFolder('Atmosphere');
        GUIHelp.add(earthAtm, 'exposure', 0, 5, 0.1);
        GUIHelp.add(earthAtm, 'sunIntensity', 0, 50, 0.5);
        GUIHelp.add(earthAtm, 'mieG', 0, 0.99, 0.01);
        GUIHelp.add(earthAtm, 'rayleighScale', 1000, 20000, 100);
        GUIHelp.add(earthAtm, 'mieScale', 100, 5000, 50);
        
        // Sun direction controls
        let sunParams = { azimuth: 0, elevation: 0.3 };
        GUIHelp.add(sunParams, 'azimuth', -Math.PI, Math.PI, 0.01).onChange(() => {
            earthAtm.setSunPosition(sunParams.azimuth, sunParams.elevation);
        });
        GUIHelp.add(sunParams, 'elevation', -Math.PI / 2, Math.PI / 2, 0.01).onChange(() => {
            earthAtm.setSunPosition(sunParams.azimuth, sunParams.elevation);
        });
        
        // View mode selector
        let viewMode = { mode: 'space' };
        GUIHelp.add(viewMode, 'mode', ['space', 'ground']).onChange((value) => {
            if (value === 'space') {
                earthAtm.configureForSpaceView();
                cameraCtrl.setCamera(0, 0, EARTH_RADIUS * 3, new Vector3(0, 0, 0));
            } else {
                earthAtm.configureForGroundView();
                // Position camera on ground
                const groundPos = new Vector3(0, EARTH_RADIUS + 100, 0);
                cameraCtrl.setCamera(0, 45, 10000, groundPos);
            }
        });
    }
}

new Sample_EarthAtm().run();
