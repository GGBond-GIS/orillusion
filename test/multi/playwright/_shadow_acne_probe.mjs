// Probe: reproduce the user's skeleton demo params that showed shadow acne,
// screenshot, and dump any console warnings / errors. Used to verify the
// slope-adaptive shadow bias fix in ShadowMapping_frag.
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { promises as fs } from 'fs';

const HOST = 'http://localhost:4000';
const OUT = '/tmp';
const main_js = '/Users/jbai/orillusion/test/multi/playwright/main.js';

const app = await electron.launch({ executablePath: electronPath, args: [main_js], timeout: 30000 });
const page = await app.firstWindow();

const consoleMessages = [];
page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', err => {
    consoleMessages.push(`[pageerror] ${err.message}`);
});

await page.waitForLoadState('domcontentloaded');
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => sessionStorage.setItem('target', './animation/Sample_Skeleton.ts'));
await page.goto('about:blank');
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

const frames = page.frames();
const inner = frames.find(f => f !== page.mainFrame());
if (!inner) {
    console.error('no iframe found');
    await app.close();
    process.exit(1);
}

// Apply the user's exact light params that triggered the acne.
const setup = await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.directionLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    if (!light) return { ok: false };
    // User-reported params (second scene — near-perpendicular light, large bound)
    light.transform.x = 0;
    light.transform.y = 100;
    light.transform.z = 0;
    light.transform.rotationX = 177.74;
    light.transform.rotationY = 0;
    light.transform.rotationZ = 0;
    light.shadowBoundWidth = 121.1;
    light.shadowBoundHeight = 219.7;
    light.shadowBoundNear = 0.01;
    light.shadowBoundFar = 200;
    light.intensity = 3;
    light.castShadow = true;
    light.enableCSM = false;
    return {
        ok: true,
        pos: [light.transform.x, light.transform.y, light.transform.z],
        bound: [light.shadowBoundWidth, light.shadowBoundHeight, light.shadowBoundFar],
        castShadow: light.castShadow,
    };
});
console.log('setup', JSON.stringify(setup));

// Let a few frames render so the auto-bias settles.
await inner.page().waitForTimeout(1500);

// Pull the per-frame bias values to verify the formula output is sensible.
const biasInfo = await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.directionLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    return {
        shadowBias0: light.lightData.shadowBias[0],
        normalBias0: light.lightData.normalBias[0],
        shadowMapWidth: light.shadowMapWidth,
        camExtent: light.shadowCamera.right - light.shadowCamera.left,
        camDepth: light.shadowCamera.far - light.shadowCamera.near,
    };
});
console.log('biasInfo', JSON.stringify(biasInfo, null, 2));

await inner.page().waitForTimeout(500);
const png = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/shadow_acne_probe.png`, png);

console.log('\n--- console messages ---');
for (const m of consoleMessages) console.log(m);

await app.close();
