// Probe: Sample_PointLightShadow — inspect auto-bias numbers and dump a screenshot.
// Used to diagnose why the point-light auto bias still looks wrong.
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
await page.evaluate(() => sessionStorage.setItem('target', './lights/Sample_PointLightShadow.ts'));
await page.goto('about:blank');
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);

const frames = page.frames();
const inner = frames.find(f => f !== page.mainFrame());
if (!inner) { console.error('no iframe'); await app.close(); process.exit(1); }

// Pull point-light bias state + shadow camera near/far actually used.
const info = await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.pointLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    // Also find a shadow camera via the point shadow renderer if we can reach it
    return {
        lightPos: [light.transform.x, light.transform.y, light.transform.z],
        range: light.lightData.range,
        shadowBias0: light.lightData.shadowBias[0],
        normalBias0: light.lightData.normalBias[0],
        // Host calculator inputs
        shadowMapWidth: light.shadowMapWidth,
        pointShadowSize: light.transform.view3D?.engine3D?.setting.shadow.pointShadowSize,
    };
});
console.log('info', JSON.stringify(info, null, 2));

await inner.page().waitForTimeout(600);
const png = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/point_shadow_probe.png`, png);

// Toggle debug-range via the GUIUtil helper so the wireframe sphere shows.
await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.pointLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    const { GUIUtil } = await import('/samples/utils/GUIUtil.ts');
    light.debugShadowRange = true;
    GUIUtil.refreshPointLightDebug(light);
});
await inner.page().waitForTimeout(800);
const png2 = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/point_shadow_probe_debug.png`, png2);

console.log('\n--- console ---');
for (const m of consoleMessages) if (m.includes('error') || m.includes('Error') || m.includes('pageerror')) console.log(m);

await app.close();
