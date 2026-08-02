import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    Engine3D, Scene3D, AtmosphericComponent, Object3D, OrbitController,
    DirectLight, Color, View3D, UnLitMaterial, MeshRenderer, PlaneGeometry,
    SphereGeometry, Vector3, CameraUtil, GPUCullMode,
} from "@orillusion/core";

/**
 * Stencil buffer demo — uses `Material.stencilFront/Back/ReadMask/
 * WriteMask/Ref` to cut one object out of another.
 *
 * Scene composition:
 *   1. A red sphere is the **mask writer**. `compare: 'always'` accepts
 *      every fragment and `passOp: 'replace'` stamps `stencilRef = 1`
 *      into the stencil buffer wherever the sphere covers.
 *      `depthWriteEnabled = false` keeps the depth buffer free so the
 *      plane behind it can still pass the depth test in the sphere's
 *      footprint — the stencil test is the only gate.
 *   2. A green plane sitting behind the sphere is the **mask reader**.
 *      With the test on (`compare: 'not-equal' / ref: 1`) every pixel
 *      the sphere stamped is rejected — a sphere-shaped hole is cut
 *      out of the plane, the red sphere shows through it. Flip the
 *      test off (`compare: 'always'`) and the plane wins everywhere,
 *      painting over the sphere.
 *
 * Required engine settings (both flipped below before `Engine3D.init()`):
 *   - `useStencil = true`: switches the GBuffer depth attachment from
 *     `depth32float` to `depth24plus-stencil8`. Without it the pipeline
 *     silently drops every stencil field on the material.
 *   - `zPrePass = false`: the default z-prepass routes the color pass
 *     through a separate depth-only `zPreTexture` that has no stencil
 *     aspect, so material stencil state would never reach the color
 *     pipeline. Disable the prepass for stencil work.
 */
class Sample_Stencil {
    async run() {
        const engine = await Engine3D.init({
            setting: {
                render: {
                    useStencil: true,
                    zPrePass: false,
                },
            },
        });
        GUIHelp.init();

        const scene = new Scene3D();
        const sky = scene.addComponent(AtmosphericComponent);

        const camera = CameraUtil.createCamera3DObject(scene);
        camera.perspective(60, engine.aspect, 0.01, 10000.0);
        camera.object3D.z = 4;
        camera.object3D.addComponent(OrbitController);

        const view = new View3D();
        view.scene = scene;
        view.camera = camera;
        engine.startRenderView(view);

        const lightObj = new Object3D();
        lightObj.rotationX = 45;
        const light = lightObj.addComponent(DirectLight);
        light.lightColor = new Color(1, 1, 1, 1);
        light.intensity = 3;
        scene.addChild(lightObj);
        sky.relativeTransform = light.transform;

        // ---------- Mask writer: red sphere stamps stencil = 1 ----------
        const maskMaterial = new UnLitMaterial(engine.context3D);
        maskMaterial.baseColor = new Color(1.0, 0.25, 0.25, 1.0);
        maskMaterial.depthWriteEnabled = false;
        maskMaterial.stencilWriteMask = 0xFF;
        maskMaterial.stencilRef = 1;
        const writeFace: GPUStencilFaceState = {
            compare: 'always',
            passOp: 'replace',
            failOp: 'keep',
            depthFailOp: 'keep',
        };
        maskMaterial.stencilFront = writeFace;
        maskMaterial.stencilBack = writeFace;

        const maskObj = new Object3D();
        const maskMR = maskObj.addComponent(MeshRenderer);
        maskMR.geometry = new SphereGeometry(0.7, 32, 32);
        maskMR.material = maskMaterial;
        // Added first → drawn first → stamps the stencil buffer before
        // any stencil-tested geometry sees it.
        scene.addChild(maskObj);

        // ---------- Mask reader: green plane gated by the stencil test ----------
        const planeMaterial = new UnLitMaterial(engine.context3D);
        planeMaterial.baseColor = new Color(0.25, 1.0, 0.45, 1.0);
        planeMaterial.cullMode = GPUCullMode.none;
        planeMaterial.stencilReadMask = 0xFF;
        planeMaterial.stencilRef = 1;
        setPlaneCompare(planeMaterial, 'not-equal');

        const planeObj = new Object3D();
        planeObj.z = -1;
        const planeMR = planeObj.addComponent(MeshRenderer);
        planeMR.geometry = new PlaneGeometry(8, 5, 1, 1, Vector3.Z_AXIS);
        planeMR.material = planeMaterial;
        scene.addChild(planeObj);

        GUIHelp.addFolder('Stencil');
        GUIHelp.add({ stencilTest: true }, 'stencilTest').onChange((on: boolean) => {
            // `'not-equal'` keeps the plane out of pixels the sphere
            // stamped; `'always'` disables the test, the plane wins.
            setPlaneCompare(planeMaterial, on ? 'not-equal' : 'always');
        });
        GUIHelp.open();
        GUIHelp.endFolder();
    }
}

function setPlaneCompare(mat: UnLitMaterial, compare: GPUCompareFunction) {
    const face: GPUStencilFaceState = {
        compare,
        passOp: 'keep',
        failOp: 'keep',
        depthFailOp: 'keep',
    };
    mat.stencilFront = face;
    mat.stencilBack = face;
}

new Sample_Stencil().run();
