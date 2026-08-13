import { test, expect, end, delay, waitUntil } from '../util'
import {
    BitmapTexture2D,
    BitmapTexture2DArray,
    BoxGeometry,
    CameraUtil,
    Engine3D,
    GeometryBase,
    LitMaterial,
    MeshRenderer,
    Object3D,
    PlaneGeometry,
    PointerEvent3D,
    Ray,
    Raycaster,
    Scene3D,
    SpriteMaterial,
    SpriteRenderer,
    StripeGeometry,
    Vector2,
    Vector3,
    View3D,
} from '@orillusion/core';
import { Graphic3DMesh } from '@orillusion/graphic';

const engine = await Engine3D.init({ setting: { pick: { mode: 'ray' } } });

function createBoxMesh(cullMode: GPUCullMode = 'back'): Object3D {
    let obj = new Object3D();
    let renderer = obj.addComponent(MeshRenderer);
    renderer.geometry = new BoxGeometry(2, 2, 2);
    renderer.material = new LitMaterial();
    renderer.material.cullMode = cullMode;
    return obj;
}

// the ray must hit the box from exactly one side with default culling
// (winding depends on the geometry data), so cast from both sides and
// take the side that reports hits
function boxHitsFromAnySide(obj: Object3D): { hits: any[], fromUp: boolean } {
    let up = new Raycaster(new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0))).intersectObject(obj);
    if (up.length > 0) return { hits: up, fromUp: true };
    let down = new Raycaster(new Ray(new Vector3(0, -3, 0), new Vector3(0, 1, 0))).intersectObject(obj);
    return { hits: down, fromUp: false };
}

await test('raycaster hits indexed geometry with uv/barycoord/face/normal', async () => {
    let obj = createBoxMesh();
    let { hits, fromUp } = boxHitsFromAnySide(obj);

    // a face consists of two triangles, both are reported (three.js semantics)
    expect(hits.length).toEqual(2);
    let hit = hits[0];
    expect(hit.object).tobe(obj);
    expect(hit.distance).toSubequal(2, 0.001);
    expect(hit.point.y).toSubequal(fromUp ? 1 : -1, 0.001);
    expect(hit.point.x).toSubequal(0, 0.001);
    expect(hit.point.z).toSubequal(0, 0.001);
    expect(hit.faceIndex).toRange(0, 11);
    expect(hit.face.a).toRange(0, 23);
    expect(hit.face.b).toRange(0, 23);
    expect(hit.face.c).toRange(0, 23);

    // uv interpolates to the face center (0.5, 0.5) for both triangles
    expect(hit.uv.x).toSubequal(0.5, 0.001);
    expect(hit.uv.y).toSubequal(0.5, 0.001);
    // barycentric coordinates sum to 1 and map to (a, b, c)
    expect(hit.barycoord.x + hit.barycoord.y + hit.barycoord.z).toSubequal(1, 0.001);
    // interpolated normal is unit length and faces toward the ray
    expect(Math.abs(hit.normal.y)).toSubequal(1, 0.001);
    expect(hit.normal.y * (fromUp ? -1 : 1)).toRange(-1.001, 0.001);
})

await test('raycaster backface culling follows material cullMode', async () => {
    let obj = createBoxMesh('back');
    let { hits: hitsBack, fromUp } = boxHitsFromAnySide(obj);
    expect(hitsBack.length).toEqual(2);

    // double sided: the ray passes through the box, reporting the entrance
    // face AND the exit face (2 triangles each)
    obj.getComponent(MeshRenderer).material.cullMode = 'none';
    let up = new Raycaster(new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0))).intersectObject(obj);
    let down = new Raycaster(new Ray(new Vector3(0, -3, 0), new Vector3(0, 1, 0))).intersectObject(obj);
    expect(up.length).toEqual(4);
    expect(down.length).toEqual(4);

    // 'front' cull reverses the winding: the side that was hit before is now
    // culled, so the same ray reports the opposite face instead
    obj.getComponent(MeshRenderer).material.cullMode = 'front';
    let frontSide = fromUp
        ? new Raycaster(new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0))).intersectObject(obj)
        : new Raycaster(new Ray(new Vector3(0, -3, 0), new Vector3(0, 1, 0))).intersectObject(obj);
    expect(frontSide.length).toEqual(2);
    expect(frontSide[0].point.y).toSubequal(fromUp ? -1 : 1, 0.001);
})

await test('raycaster respects world transform (translation & scale)', async () => {
    let obj = createBoxMesh('none');
    obj.y = 10;
    let hits = new Raycaster(new Ray(new Vector3(0, 13, 0), new Vector3(0, -1, 0))).intersectObject(obj);
    // double sided: entrance (y=11) + exit (y=9)
    expect(hits.length).toEqual(4);
    expect(hits[0].point.y).toSubequal(11, 0.001);
    expect(hits[0].distance).toSubequal(2, 0.001);

    obj.scaleY = 2;
    let hits2 = new Raycaster(new Ray(new Vector3(0, 15, 0), new Vector3(0, -1, 0))).intersectObject(obj);
    expect(hits2.length).toEqual(4);
    expect(hits2[0].point.y).toSubequal(12, 0.001);
    expect(hits2[0].distance).toSubequal(3, 0.001);
})

await test('raycaster hits non-indexed geometry without uv/normal', async () => {
    let obj = new Object3D();
    let renderer = obj.addComponent(MeshRenderer);
    let geometry = new GeometryBase();
    // a single triangle in the xz plane: (0,0,0) (2,0,0) (0,0,2)
    geometry.setVertexs(new Float32Array([0, 0, 0, 2, 0, 0, 0, 0, 2]));
    renderer.geometry = geometry;
    renderer.material = new LitMaterial();

    let up = new Raycaster(new Ray(new Vector3(0.5, 1, 0.5), new Vector3(0, -1, 0))).intersectObject(obj);
    let down = new Raycaster(new Ray(new Vector3(0.5, -1, 0.5), new Vector3(0, 1, 0))).intersectObject(obj);
    expect(up.length + down.length).toEqual(1);

    let hits = up.length > 0 ? up : down;
    expect(hits.length).toEqual(1);
    expect(hits[0].faceIndex).toEqual(0);
    expect(hits[0].point.x).toSubequal(0.5, 0.001);
    expect(hits[0].point.y).toSubequal(0, 0.001);
    expect(hits[0].point.z).toSubequal(0.5, 0.001);
    expect(hits[0].uv === undefined).tobe(true);
    expect(hits[0].normal === undefined).tobe(true);
    // face geometric normal is still provided
    expect(Math.abs(hits[0].face.normal.y)).toSubequal(1, 0.001);
})

await test('raycaster near/far filter', async () => {
    let obj = createBoxMesh('none');
    let raycaster = new Raycaster(new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0)));
    // hit distances are 2 (entrance) and 4 (exit)
    expect(raycaster.intersectObject(obj).length).toEqual(4);

    raycaster.near = 5;
    expect(raycaster.intersectObject(obj).length).toEqual(0);
    raycaster.near = 0;

    raycaster.far = 1;
    expect(raycaster.intersectObject(obj).length).toEqual(0);
    raycaster.far = 5;
    expect(raycaster.intersectObject(obj).length).toEqual(4);
})

await test('raycaster recursive / scene / disabled renderer', async () => {
    let parent = new Object3D();
    let child = createBoxMesh('none');
    child.x = 3;
    parent.addChild(child);
    let scene = new Scene3D();
    scene.addChild(parent);

    let raycaster = new Raycaster(new Ray(new Vector3(3, 3, 0), new Vector3(0, -1, 0)));
    expect(raycaster.intersectObject(parent, false).length).toEqual(0);
    expect(raycaster.intersectObject(parent, true).length).toEqual(4);
    expect(raycaster.intersectObjects([parent], true).length).toEqual(4);
    expect(raycaster.intersectScene(scene).length).toEqual(4);

    // disabled renderer is skipped
    child.getComponent(MeshRenderer).enable = false;
    expect(raycaster.intersectObject(parent, true).length).toEqual(0);
    child.getComponent(MeshRenderer).enable = true;
    expect(raycaster.intersectObject(parent, true).length).toEqual(4);
})

await test('pick mode ray: PickFire dispatches PICK_CLICK with three.js style data', async () => {
    let scene = new Scene3D();
    let mainCamera = CameraUtil.createCamera3DObject(scene, "camera");
    mainCamera.perspective(60, engine.aspect, 0.1, 2000);
    mainCamera.lookAt(new Vector3(0, 5, 10), new Vector3(0, 0, 0), Vector3.Y_AXIS);

    let view = new View3D();
    view.scene = scene;
    view.camera = mainCamera;
    engine.startRenderViews([view]);

    let obj = createBoxMesh('none');
    scene.addChild(obj);

    await waitUntil(() => engine.inputSystem.canvas.clientWidth > 0)

    let pickData: any = null;
    let clicked = false;
    obj.addEventListener(PointerEvent3D.PICK_CLICK, (e: PointerEvent3D) => {
        clicked = true;
        pickData = e.data;
    }, null);

    let canvas = engine.inputSystem.canvas;
    let cx = canvas.clientWidth / 2;
    let cy = canvas.clientHeight / 2;
    // PickFire reads InputSystem.mouseX/mouseY (updated by real pointer
    // events); simulate that here since we dispatch synthetic events.
    // Re-set right before every dispatch: the native mousemove listener
    // overwrites the fields whenever the real mouse moves across the window.
    let setMouse = () => {
        engine.inputSystem.mouseX = cx;
        engine.inputSystem.mouseY = cy;
    }

    let down = new PointerEvent3D(PointerEvent3D.POINTER_DOWN);
    down.mouseX = cx;
    down.mouseY = cy;
    setMouse();
    engine.inputSystem.dispatchEvent(down);
    await delay(50);

    let click = new PointerEvent3D(PointerEvent3D.POINTER_CLICK);
    click.mouseX = cx;
    click.mouseY = cy;
    setMouse();
    engine.inputSystem.dispatchEvent(click);
    await delay(100);

    expect(clicked).tobe(true);
    expect(pickData).notEqual(null);
    // three.js style fields on the event data: the camera at (0,5,10) looks at
    // the origin, the ray enters the 2x2x2 box at the z=1 face -> (0, 0.5, 1)
    expect(pickData.distance).toRange(9.5, 10.6);
    expect(pickData.faceIndex).toRange(0, 11);
    expect(pickData.object).tobe(obj);
    expect(pickData.worldPos.x).toSubequal(0, 0.05);
    expect(pickData.worldPos.y).toSubequal(0.5, 0.05);
    expect(pickData.worldPos.z).toSubequal(1, 0.05);
    expect(pickData.uv.x).toRange(0, 1);
    expect(pickData.uv.y).toRange(0, 1);
    expect(pickData.barycoord.x + pickData.barycoord.y + pickData.barycoord.z).toSubequal(1, 0.001);

    Engine3D.pause();
})

await test('raycaster hits a vertical plane (up=Z) at any height', async () => {
    let obj = new Object3D();
    let renderer = obj.addComponent(MeshRenderer);
    renderer.geometry = new PlaneGeometry(9, 9, 1, 1, Vector3.Z_AXIS);
    renderer.material = new LitMaterial();
    renderer.material.cullMode = 'none';

    // the plane stands in the XY plane at z=0; the old fixed bounds box
    // (width, 1, height) covered y only in [-0.5, 0.5] and the raycaster
    // pre-cull rejected every hit outside that band. A ray crosses the
    // single quad at one point: 1 triangle, or 2 on the shared diagonal.
    for (let y of [-4, -3, -1, 0, 1, 3, 4]) {
        let hits = new Raycaster(new Ray(new Vector3(0, y, 5), new Vector3(0, 0, -1))).intersectObject(obj);
        expect(hits.length).toRange(1, 2);
        expect(hits[0].point.y).toSubequal(y, 0.001);
        expect(hits[0].point.z).toSubequal(0, 0.001);
    }
})

await test('raycaster hits a StripeGeometry ribbon far from origin', async () => {
    let obj = new Object3D();
    let renderer = obj.addComponent(MeshRenderer);
    let segments: [Vector3, Vector3][] = [];
    for (let i = 0; i < 9; i++) {
        let t = i / 8;
        let cx = -8 + t * 16;
        let cy = Math.sin(t * Math.PI * 2) * 3;
        segments.push([new Vector3(cx, cy, 0), new Vector3(cx, cy + 0.8, 0)]);
    }
    renderer.geometry = new StripeGeometry(segments);
    renderer.material = new LitMaterial();
    renderer.material.cullMode = 'none';

    // the ribbon spans x in [-8, 8]; the old unit-box bounds rejected hits
    // on the parts far from the origin
    for (let x of [-6, 0, 6]) {
        let t = (x + 8) / 16;
        let cy = Math.sin(t * Math.PI * 2) * 3;
        let hits = new Raycaster(new Ray(new Vector3(x, cy + 0.4, 5), new Vector3(0, 0, -1))).intersectObject(obj);
        expect(hits.length).toRange(1, 4);
        expect(hits[0].point.x).toSubequal(x, 0.001);
        expect(hits[0].point.z).toSubequal(0, 0.001);
    }
})

await test('raycaster hits a SpriteRenderer quad', async () => {
    let scene = new Scene3D();
    let view = new View3D();
    view.scene = scene;

    // procedural checkerboard texture (no asset files in a local checkout)
    let canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    let ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 32, 32);
    let tex = new BitmapTexture2D(false, engine.context3D);
    tex.source = canvas;

    let obj = new Object3D();
    scene.addChild(obj);
    let renderer = obj.addComponent(SpriteRenderer);
    // resource bootstrap without a running render view: _ensureResources
    // needs view3D.engine3D.context3D, which only exists after
    // startRenderView — provide the quad geometry and material directly
    renderer.geometry = new PlaneGeometry(1, 1, 1, 1, Vector3.Z_AXIS);
    renderer.material = new SpriteMaterial(engine.context3D);
    renderer.setTexture(tex);
    renderer.size = new Vector2(6, 4);
    console.error(`[DBG-sprite] geo=${!!(renderer as any)._geometry} mat=${!!(renderer as any)._materials[0]} view3D=${!!obj.transform.view3D} scene3D=${!!(obj.transform as any)._scene3d}`)

    // default pivot (0.5, 0.5): the quad spans [-3, 3] x [-2, 2] in local
    // space (unit quad ±0.5 scaled by size, centered at (0.5-pivot)*size,
    // matching the vertex shader); a ray along -Z through the origin hits
    // it at z=0
    let hits = new Raycaster(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1))).intersectObject(obj);
    console.error(`[DBG-sprite] hits=${hits.length} scene3D=${!!(obj.transform as any)._scene3d} view=${!!(obj.transform as any)._scene3d?.view}`);
    expect(hits.length).toEqual(1);
    expect(hits[0].object).tobe(obj);
    expect(hits[0].faceIndex).toEqual(-1);
    expect(hits[0].point.z).toSubequal(0, 0.001);
    expect(hits[0].uv.x).toSubequal(0.5, 0.001);
    expect(hits[0].uv.y).toSubequal(0.5, 0.001);

    // outside the quad
    let miss = new Raycaster(new Ray(new Vector3(7, 0, 5), new Vector3(0, 0, -1))).intersectObject(obj);
    expect(miss.length).toEqual(0);

    // inside the quad but outside the unit geometry bounds (x=2 is within
    // [-6, 0] but the shared quad bounds are ±0.5) — regression test for
    // the removed world-bounds pre-cull
    let edge = new Raycaster(new Ray(new Vector3(-2, 0, 5), new Vector3(0, 0, -1))).intersectObject(obj);
    expect(edge.length).toEqual(1);
    expect(edge[0].point.x).toSubequal(-2, 0.001);

    // ray parallel to the quad
    let side = new Raycaster(new Ray(new Vector3(0, 0, 5), new Vector3(0, 1, 0))).intersectObject(obj);
    expect(side.length).toEqual(0);
})

await test('raycaster hits Graphic3DMesh instances at their world positions', async () => {
    let scene = new Scene3D();
    let view = new View3D();
    view.scene = scene;

    let canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    let ctx = canvas.getContext('2d');
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(0, 0, 32, 32);
    let tex = new BitmapTexture2D(false, engine.context3D);
    tex.source = canvas;
    let texArray = new BitmapTexture2DArray(tex.width, tex.height, 1, engine.context3D);
    texArray.setTextures([tex]);
    let mr = Graphic3DMesh.draw(scene, new PlaneGeometry(2, 2, 1, 1, Vector3.Z_AXIS), texArray, 1);
    mr.material.cullMode = 'none';
    let inst = mr.object3Ds[0];
    inst.name = 'gmesh';
    inst.x = 3;

    let hits = new Raycaster(new Ray(new Vector3(3, 0, 5), new Vector3(0, 0, -1))).intersectObject(scene, true);
    expect(hits.length).toRange(1, 2);
    expect(hits[0].object).tobe(inst);
    expect(hits[0].point.x).toSubequal(3, 0.001);
    expect(hits[0].point.z).toSubequal(0, 0.001);
})

setTimeout(end, 500)
