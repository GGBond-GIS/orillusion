// Probe: toggle debugShadowBound on the light, then move light.transform.x,
// screenshot both states, and verify the debug frustum tracks the position.
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { promises as fs } from 'fs';

const HOST = 'http://localhost:4000';
const OUT = '/tmp';
const main_js = '/Users/jbai/orillusion/test/multi/playwright/main.js';

const app = await electron.launch({ executablePath: electronPath, args: [main_js], timeout: 30000 });
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');

await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => sessionStorage.setItem('target', './animation/Sample_Skeleton.ts'));
await page.goto('about:blank');
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// Access the inner iframe where the sample is actually running.
const frames = page.frames();
const inner = frames.find(f => f !== page.mainFrame());
if (!inner) {
    console.error('no iframe found');
    await app.close();
    process.exit(1);
}

// Find the DirectLight via the engine core module.
const setup = await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    const lists = ShadowLightsCollect.directionLightList;
    let light = null;
    for (const [, list] of lists.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    if (!light) return { ok: false, reason: 'no direct light' };
    window['__probeLight'] = light;
    return {
        ok: true,
        pos: [light.transform.x, light.transform.y, light.transform.z],
        debugShadowBound: light.debugShadowBound,
        debugCSM: light.debugCSM,
        enableCSM: light.enableCSM,
        hasBindOnChange: !!light.bindOnChange,
    };
});
console.log('setup', JSON.stringify(setup));

// Pull the camera back so we can see the whole shadow frustum move.
await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.directionLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    const view = light.transform.view3D;
    const ctrl = view.camera.object3D.getComponent(core.HoverCameraController);
    if (ctrl) ctrl.setCamera(-30, -30, 600);
});
await inner.page().waitForTimeout(500);

// Toggle debugShadowBound via the GUIUtil helper so the closure is installed.
await inner.evaluate(async () => {
    const light = window['__probeLight'];
    const { GUIUtil } = await import('/samples/utils/GUIUtil.ts');
    light.debugShadowBound = true;
    GUIUtil.refreshDirectLightDebug(light);
    const sc = light.shadowCamera.transform;
    // Locate the graphic3D and grab the shape for the shadow camera.
    const g = light.transform.view3D.scene.getChildByName('graphic3D');
    const frustumId = `CameraFrustum_${light.shadowCamera.object3D.instanceID}`;
    const shape = g?.mLineRender?.shapes?.get(frustumId);
    window['__probeLog'] = [{
        tag: 'after-toggle',
        lightPos: [light.transform.x, light.transform.y, light.transform.z],
        lightWorldPos: [light.transform.worldPosition.x, light.transform.worldPosition.y, light.transform.worldPosition.z],
        shadowCamLocalPos: [sc.x, sc.y, sc.z],
        shadowCamWorldPos: [sc.worldPosition.x, sc.worldPosition.y, sc.worldPosition.z],
        frustumShapePresent: !!shape,
        shapeKeys: g ? [...g.mLineRender.shapes.keys()] : null,
        frustumFirstPoint: shape?.pointData ? [shape.pointData[0], shape.pointData[1], shape.pointData[2]] : null,
        frustumCount: shape?.count,
    }];
});
await inner.page().waitForTimeout(800);
let png = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/shadow_bound_before.png`, png);

// Move the light's X by +150 (the slider range is -500..500, and the skeleton
// light starts at y=100 so +150 x should be visible).
await inner.evaluate(() => {
    const light = window['__probeLight'];
    light.transform.x = 150;
    const sc = light.shadowCamera.transform;
    const g = light.transform.view3D.scene.getChildByName('graphic3D');
    const frustumId = `CameraFrustum_${light.shadowCamera.object3D.instanceID}`;
    const shape = g?.mLineRender?.shapes?.get(frustumId);
    window['__probeLog'].push({
        tag: 'after-move-x',
        lightPos: [light.transform.x, light.transform.y, light.transform.z],
        lightWorldPos: [light.transform.worldPosition.x, light.transform.worldPosition.y, light.transform.worldPosition.z],
        shadowCamLocalPos: [sc.x, sc.y, sc.z],
        shadowCamWorldPos: [sc.worldPosition.x, sc.worldPosition.y, sc.worldPosition.z],
        frustumShapePresent: !!shape,
        shapeKeys: g ? [...g.mLineRender.shapes.keys()] : null,
        frustumFirstPoint: shape?.pointData ? [shape.pointData[0], shape.pointData[1], shape.pointData[2]] : null,
        frustumCount: shape?.count,
    });
});
await inner.page().waitForTimeout(800);
png = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/shadow_bound_after.png`, png);

const log = await inner.evaluate(() => window['__probeLog']);
console.log('log', JSON.stringify(log, null, 2));

await app.close();
