import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Engine3D, View3D, Scene3D, CameraUtil, AtmosphericComponent, webGPUContext, HoverCameraController, Object3D, DirectLight, KelvinUtil, PlaneGeometry, VertexAttributeName, LitMaterial, MeshRenderer, BoxGeometry, SphereGeometry, CylinderGeometry, TorusGeometry, Vector2, Color, UnLitMaterial, Camera3D } from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";

// sample of overlay view
export class Sample_OverlayView {
    lightObj: Object3D;
    mainCamera: Camera3D;
    
    async run() {
        Engine3D.setting.shadow.autoUpdate = true;
        Engine3D.setting.shadow.shadowBound = 200;
        GUIHelp.init();

        await Engine3D.init();
        
        let view = new View3D();
        view.scene = new Scene3D();
        let sky = view.scene.addComponent(AtmosphericComponent);

        view.camera = CameraUtil.createCamera3DObject(view.scene);
        view.camera.perspective(60, webGPUContext.aspect, 1, 5000.0);
        view.camera.object3D.z = -15;
        let hoverCtrl = view.camera.object3D.addComponent(HoverCameraController);
        hoverCtrl.setCamera(35, -20, 150);
        this.mainCamera = view.camera;

        Engine3D.startRenderView(view);

        await this.createScene(view.scene);
        // sky.relativeTransform = this.lightObj.transform;

        if (true) {
            let scene = new Scene3D();

            let axisObj = new Object3D();
            axisObj.y = 20;
            scene.addChild(axisObj);

            let xAxis = this.createArrows(new Color(1, 0, 0));
            xAxis.rotationZ = -90;
            axisObj.addChild(xAxis);

            let yAxis = this.createArrows(new Color(0, 1, 0));
            axisObj.addChild(yAxis);

            let zAxis = this.createArrows(new Color(0, 0, 1));
            zAxis.rotationX = 90;
            axisObj.addChild(zAxis);

            let overlayView = new View3D();
            overlayView.scene = scene;
            overlayView.camera = this.mainCamera;
            Engine3D.addOverlayView(overlayView);
        }
    }

    private createArrows(baseColor: Color): Object3D {
        let mat = new UnLitMaterial();
        mat.baseColor = baseColor;

        const rodLen = 10;
        const rodRadius = 0.15;
        const arrowLen = 2.5;
        const arrowRadius = 0.6;

        let rod = new Object3D();
        let mrRod = rod.addComponent(MeshRenderer);
        mrRod.geometry = new CylinderGeometry(rodRadius, rodRadius, rodLen, 10, 1);
        mrRod.material = mat;
        rod.y = rodLen / 2;
        
        let arrow = new Object3D();
        let mrArrow = arrow.addComponent(MeshRenderer);
        mrArrow.geometry = new CylinderGeometry(0, arrowRadius, arrowLen, 10, 1);
        mrArrow.material = mat;
        arrow.y = rodLen + arrowLen / 2;

        let meshObj = new Object3D();
        meshObj.addChild(rod);
        meshObj.addChild(arrow);
        return meshObj;
    }

    private async createScene(scene: Scene3D) {
        // add a direction light
        let lightObj3D = this.lightObj = new Object3D();
        let sunLight = lightObj3D.addComponent(DirectLight);
        sunLight.intensity = 2;
        sunLight.lightColor = KelvinUtil.color_temperature_to_rgb(6553);
        sunLight.castShadow = true;
        sunLight.enableCSM = true;
        lightObj3D.rotationX = 53.2;
        lightObj3D.rotationY = 220;
        lightObj3D.rotationZ = 5.58;

        GUIUtil.renderDirLight(sunLight);
        scene.addChild(lightObj3D);

        let material = new LitMaterial();

        // add a plane
        {
            let plane = new Object3D();
            let meshRenderer = plane.addComponent(MeshRenderer);
            meshRenderer.geometry = new PlaneGeometry(200, 200, 80, 80);
            meshRenderer.material = material;
            scene.addChild(plane);
        }

        // add a box
        {
            let box = new Object3D();
            let meshRenderer = box.addComponent(MeshRenderer);
            meshRenderer.geometry = new BoxGeometry(50, 10, 20);
            meshRenderer.material = material;
            box.y = 10;
            scene.addChild(box);
        }

        // add a sphere
        {
            let sphere = new Object3D();
            let meshRenderer = sphere.addComponent(MeshRenderer);
            meshRenderer.geometry = new SphereGeometry(10, 20, 20);
            meshRenderer.material = material;
            sphere.y = 10;
            sphere.x = -50;
            scene.addChild(sphere);
        }

        // add a cylinder opened
        {
            let cylinderA = new Object3D();
            let meshRenderer = cylinderA.addComponent(MeshRenderer);
            meshRenderer.geometry = new CylinderGeometry(5, 10, 20, 50, 20, true);
            meshRenderer.material = material;
            material.cullMode = 'none'
            cylinderA.y = 20;
            cylinderA.x = 50;
            scene.addChild(cylinderA);
        }

        // add a cylinder closed
        {
            let cylinderB = new Object3D();
            let meshRenderer = cylinderB.addComponent(MeshRenderer);
            meshRenderer.geometry = new CylinderGeometry(5, 10, 20, 50, 20);
            meshRenderer.materials = [material, material, material];

            cylinderB.y = 20;
            cylinderB.x = 50;
            cylinderB.z = 50;
            scene.addChild(cylinderB);
        }


        // add a torus
        {
            let torus = new Object3D();
            let meshRenderer = torus.addComponent(MeshRenderer);
            meshRenderer.geometry = new TorusGeometry(10, 4, 20, 50);
            meshRenderer.material = material;
            torus.y = 20;
            torus.x = 50;
            torus.z = -50;
            scene.addChild(torus);
        }
    }
}
