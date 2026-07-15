// Probe: reproduce user's spot scene from a camera angle matching their
// screenshot (behind wall_w looking at the U opening), to see the wall-floor
// interface artifact directly.
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { promises as fs } from 'fs';

const HOST = 'http://localhost:4000';
const OUT = '/tmp';
const main_js = '/Users/jbai/orillusion/test/multi/playwright/main.js';

const app = await electron.launch({ executablePath: electronPath, args: [main_js], timeout: 30000 });
const page = await app.firstWindow();
const consoleMessages = [];
page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

await page.waitForLoadState('domcontentloaded');
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => sessionStorage.setItem('target', './lights/Sample_SpotLight.ts'));
await page.goto('about:blank');
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);

const inner = page.frames().find(f => f !== page.mainFrame());

// User's light params
await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.pointLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    light.transform.y = 338.13;
});

// Move camera to match user's screenshot: looking at the wall-floor interface
// from inside the U (+z side of wall_w). HoverCameraController: setCamera(rotY, rotX, distance)
await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const views = Array.from(core.ShadowLightsCollect.directionLightList?.keys() ?? []);
    // Find view via main camera's HoverCameraController
    // The sample's camera was created from the mainCamera instance
    const scenes = Array.from(core.ShadowLightsCollect.pointLightList?.keys() ?? []);
    let scene = scenes[0];
    if (!scene) return;
    const view = scene['_view'] || scene.view3D;
    if (!view?.camera) return;
    const ctrl = view.camera.object3D.getComponent(core.HoverCameraController);
    if (ctrl) {
        // Position camera inside U looking back at wall_w
        // U interior is +z side, so camera at +z, looking toward -z (wall_w)
        ctrl.setCamera(0, -20, 600);
        // Move target toward the wall
        if (ctrl.target) {
            ctrl.target.set(0, 20, 50);
        }
    }
});
await inner.page().waitForTimeout(1500);

const png = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/spot_camera_probe.png`, png);

await app.close();
