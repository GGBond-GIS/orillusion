// Probe: verify shadowCameraNear actually clips the shadow map.
// Set near=100 — far more than any wall's distance from the light. If the
// near plane is being applied, walls clipped from the shadow map, so floor
// should NO LONGER be shadowed by them → lit area grows noticeably.
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
await page.evaluate(() => sessionStorage.setItem('target', './lights/Sample_SpotLight.ts'));
await page.goto('about:blank');
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);

const inner = page.frames().find(f => f !== page.mainFrame());

const setup = await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.pointLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    light.transform.y = 338.13;
    return { pos: [light.transform.x, light.transform.y, light.transform.z] };
});
console.log('setup', JSON.stringify(setup));

// Frame 1: default near (0.01)
await inner.page().waitForTimeout(1500);
let png = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/spot_near_default.png`, png);

// Frame 2: near = 100 — should clip wall tops at y≈100 (distance from light ≈ 238)
// Wait, 238 > 100, so walls NOT clipped. Set near=250 instead.
const after = await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.pointLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    light.shadowCameraFar = 0;
    light.shadowCameraNear = 500;  // clips walls (~380 from light) — their shadows on floor should disappear
    // Also inspect actual cube camera near values
    await new Promise(r => setTimeout(r, 100));
    // Find the renderer's cached cube camera
    const views = [light.transform.view3D];
    const v = views[0];
    const job = v.engine3D.renderJobs.get(v);
    const pr = job.pointLightShadowRenderer;
    const info = pr?._shadowCameraDic?.get(light);
    const faces = info?.cubeCamera ? [
        { near: info.cubeCamera.right_camera?.near, far: info.cubeCamera.right_camera?.far },
        { near: info.cubeCamera.front_camera?.near, far: info.cubeCamera.front_camera?.far },
    ] : null;
    return { shadowCameraFar: light.shadowCameraFar, faces };
});
console.log('after', JSON.stringify(after));

await inner.page().waitForTimeout(1500);
png = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/spot_near_large.png`, png);

await app.close();
