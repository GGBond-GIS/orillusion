import { test, expect, end, delay } from '../util'
import {
    Engine3D,
    Scene3D,
    View3D,
    CameraUtil,
    AtmosphericComponent,
    HoverCameraController,
    Object3D,
    DirectLight,
    PointLight,
    KelvinUtil,
    MeshRenderer,
    LitMaterial,
    BoxGeometry,
    SphereGeometry,
    Color,
} from '@orillusion/core';

// ---------- helpers ----------

function makeCanvas(id: string, left: number, width = 320, height = 240): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.id = id;
    c.width = width;
    c.height = height;
    c.style.position = 'absolute';
    c.style.top = '0';
    c.style.left = left + 'px';
    c.style.width = width + 'px';
    c.style.height = height + 'px';
    c.style.background = '#000';
    document.body.appendChild(c);
    return c;
}

type InstanceReport = {
    instanceId: number,
    canvasId: string,
    canvasSize: number[],
    presentationSize: number[],
    aspect: number,
    sceneChildren: number,
    meshNames: string[],
    lightCount: number,
    lightTypes: string[],
    cameraPos: number[],
    cameraFov: number,
    renderJobAttached: boolean,
};

function snapshot(engine: Engine3D, view: View3D, canvas: HTMLCanvasElement): InstanceReport {
    let scene = view.scene;
    let meshNames: string[] = [];
    let lightTypes: string[] = [];
    let lightCount = 0;
    scene.forChild((c: Object3D) => {
        if (c.hasComponent(MeshRenderer)) meshNames.push(c.name || '<unnamed>');
        if (c.hasComponent(DirectLight)) { lightTypes.push('Direct'); lightCount++; }
        if (c.hasComponent(PointLight)) { lightTypes.push('Point'); lightCount++; }
    });
    let cam = view.camera;
    return {
        instanceId: engine.id,
        canvasId: canvas.id,
        canvasSize: [canvas.width, canvas.height],
        presentationSize: [...engine.context3D.presentationSize],
        aspect: engine.context3D.aspect,
        sceneChildren: (scene as any).entityChildren?.length ?? 0,
        meshNames,
        lightCount,
        lightTypes,
        cameraPos: [cam.transform.worldPosition.x, cam.transform.worldPosition.y, cam.transform.worldPosition.z],
        cameraFov: (cam as any).fov ?? -1,
        renderJobAttached: !!engine.getRenderJob(view),
    };
}

// ---------- test ----------

let canvasA = makeCanvas('canvasA', 10);
let canvasB = makeCanvas('canvasB', 350);

let engineA!: Engine3D;
let engineB!: Engine3D;
let viewA!: View3D;
let viewB!: View3D;

await test('create two Engine3D instances with isolated GPU devices', async () => {
    // Build each engine's scene while that engine's Context3D is active so
    // all GPU resources (buffers, samplers, default textures) are created
    // on that engine's device. The pattern is create → build → startView.
    engineA = await Engine3D.init({ canvasConfig: { canvas: canvasA, devicePixelRatio: 1 } });
    {
        // ----- Scene A: red box + direct light -----
        const sceneA = new Scene3D();
        sceneA.addComponent(AtmosphericComponent);

        const camA = CameraUtil.createCamera3D(null, sceneA);
        camA.perspective(60, engineA.context3D.aspect, 1, 2000);
        const ctrlA = camA.object3D.addComponent(HoverCameraController);
        ctrlA.setCamera(30, -15, 120);

        const lightObjA = new Object3D();
        lightObjA.rotationX = 45; lightObjA.rotationY = 60;
        const dirA = lightObjA.addComponent(DirectLight);
        dirA.lightColor = KelvinUtil.color_temperature_to_rgb(5500);
        dirA.intensity = 3;
        sceneA.addChild(lightObjA);

        const boxA = new Object3D();
        boxA.name = 'redBox';
        const mrA = boxA.addComponent(MeshRenderer);
        mrA.geometry = new BoxGeometry(40, 40, 40);
        const matA = new LitMaterial(engineA.context3D);
        matA.baseColor = new Color(1, 0.15, 0.15, 1);
        mrA.material = matA;
        sceneA.addChild(boxA);

        viewA = new View3D();
        viewA.scene = sceneA;
        viewA.camera = camA;
    }

    engineB = await Engine3D.init({ canvasConfig: { canvas: canvasB, devicePixelRatio: 1 } });
    {
        // ----- Scene B: blue sphere + point light -----
        const sceneB = new Scene3D();
        sceneB.addComponent(AtmosphericComponent);

        const camB = CameraUtil.createCamera3D(null, sceneB);
        camB.perspective(45, engineB.context3D.aspect, 1, 2000);
        const ctrlB = camB.object3D.addComponent(HoverCameraController);
        ctrlB.setCamera(0, 0, 140);

        const ptLightObj = new Object3D();
        ptLightObj.transform.x = 40;
        ptLightObj.transform.y = 30;
        const ptLight = ptLightObj.addComponent(PointLight);
        ptLight.lightColor = new Color(1, 1, 1);
        ptLight.intensity = 30;
        ptLight.range = 300;
        sceneB.addChild(ptLightObj);

        const sphB = new Object3D();
        sphB.name = 'blueSphere';
        const mrB = sphB.addComponent(MeshRenderer);
        mrB.geometry = new SphereGeometry(25, 32, 32);
        const matB = new LitMaterial(engineB.context3D);
        matB.baseColor = new Color(0.1, 0.4, 1.0, 1);
        mrB.material = matB;
        sceneB.addChild(sphB);

        viewB = new View3D();
        viewB.scene = sceneB;
        viewB.camera = camB;
    }

    const diffIds = engineA.id !== engineB.id;
    const diffDevices = engineA.context3D.device !== engineB.context3D.device;
    const diffAdapters = engineA.context3D.adapter !== engineB.context3D.adapter;
    const canvasAok = engineA.context3D.canvas === canvasA;
    const canvasBok = engineB.context3D.canvas === canvasB;
    const diffContexts = engineA.context3D !== engineB.context3D;
    console.log('[multi] engineA.id =', engineA.id, 'engineB.id =', engineB.id);
    console.log('[multi] isolated devices =', diffDevices);
    console.log('[multi] isolated adapters =', diffAdapters);
    console.log('[multi] distinct context3D =', diffContexts);
    console.log('[multi] canvasA bound =', canvasAok, ', canvasB bound =', canvasBok);

    expect(diffIds).toEqual(true);
    expect(diffDevices).toEqual(true);
    expect(diffContexts).toEqual(true);
    expect(canvasAok).toEqual(true);
    expect(canvasBok).toEqual(true);
});

await test('start two render loops on isolated scenes', async () => {
    engineA.startRenderView(viewA);
    engineB.startRenderView(viewB);

    // log initial state
    const reportA = snapshot(engineA, viewA, canvasA);
    const reportB = snapshot(engineB, viewB, canvasB);
    console.log('[multi] scene A snapshot:', JSON.stringify(reportA));
    console.log('[multi] scene B snapshot:', JSON.stringify(reportB));

    // expectation: each engine has exactly its own scene content
    expect(reportA.meshNames).toEqual(['redBox']);
    expect(reportB.meshNames).toEqual(['blueSphere']);
    expect(reportA.lightTypes).toEqual(['Direct']);
    expect(reportB.lightTypes).toEqual(['Point']);
    expect(reportA.renderJobAttached).toEqual(true);
    expect(reportB.renderJobAttached).toEqual(true);
});

await test('both engines advance their render loops', async () => {
    const startA = engineA.frameCount;
    const startB = engineB.frameCount;
    // ~1.5s wall time; at 60fps each engine should tick many frames.
    for (let i = 0; i < 30; i++) await delay(50);
    const deltaA = engineA.frameCount - startA;
    const deltaB = engineB.frameCount - startB;

    console.log('[multi] engineA advanced frames:', deltaA);
    console.log('[multi] engineB advanced frames:', deltaB);

    const finalA = snapshot(engineA, viewA, canvasA);
    const finalB = snapshot(engineB, viewB, canvasB);
    console.log('[multi] final scene A:', JSON.stringify(finalA));
    console.log('[multi] final scene B:', JSON.stringify(finalB));

    expect(deltaA > 5).toEqual(true);
    expect(deltaB > 5).toEqual(true);
});

await test('Plan B: bindCtx throws when the same GPU resource is used by two engines', async () => {
    // Plan B contract: a GPU-bearing resource (Texture / Material / Geometry /
    // GPUBuffer / Shader) may only be bound to one Context3D. Attempting to
    // use it with a different engine must throw.
    const { bindCtx } = await import('../../src/gfx/graphics/webGpu/Context3D');

    // A minimal GPU-bearing object: any object with a `_boundCtx` field.
    const fakeResource: { _boundCtx: any } = { _boundCtx: null };

    // First bind: succeeds and sets _boundCtx to engine A's context.
    bindCtx(fakeResource, engineA.context3D);
    expect(fakeResource._boundCtx === engineA.context3D).toEqual(true);

    // Second bind to the same ctx: idempotent (no throw).
    bindCtx(fakeResource, engineA.context3D);
    expect(fakeResource._boundCtx === engineA.context3D).toEqual(true);

    // Third bind to a DIFFERENT ctx: throws.
    let threw = false;
    try {
        bindCtx(fakeResource, engineB.context3D);
    } catch (e) {
        threw = true;
    }
    expect(threw).toEqual(true);
});

await test('Plan B: each engine with its own independent scene graph renders fine', async () => {
    // Under Plan B, users create per-engine Geometry/Material/Texture and
    // render them independently. Built-in materials accept an optional
    // `Context3D` arg so default-textures bind to the right device. Geometry
    // buffers bind to their engine's Context3D at first render.
    const hostA2 = new Object3D();
    hostA2.name = 'planBHostA';
    hostA2.transform.y = 25;
    const mrA2 = hostA2.addComponent(MeshRenderer);
    mrA2.geometry = new SphereGeometry(10, 16, 16);
    const matA2 = new LitMaterial(engineA.context3D);
    matA2.baseColor = new Color(1, 0.6, 0.2, 1);
    mrA2.material = matA2;
    viewA.scene.addChild(hostA2);

    const hostB2 = new Object3D();
    hostB2.name = 'planBHostB';
    hostB2.transform.y = -25;
    const mrB2 = hostB2.addComponent(MeshRenderer);
    mrB2.geometry = new SphereGeometry(10, 16, 16);
    const matB2 = new LitMaterial(engineB.context3D);
    matB2.baseColor = new Color(0.2, 0.4, 1, 1);
    mrB2.material = matB2;
    viewB.scene.addChild(hostB2);

    const startA = engineA.frameCount;
    const startB = engineB.frameCount;
    for (let i = 0; i < 20; i++) await delay(50);
    const deltaA = engineA.frameCount - startA;
    const deltaB = engineB.frameCount - startB;

    console.log('[multi] Plan B engineA advanced', deltaA, 'engineB advanced', deltaB);

    expect(deltaA > 5).toEqual(true);
    expect(deltaB > 5).toEqual(true);
});

setTimeout(end, 500);
