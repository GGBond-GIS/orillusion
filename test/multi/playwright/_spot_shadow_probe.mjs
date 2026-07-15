// Probe: reproduce the SpotLight corner-leak scene the user reported and
// verify the fix. Applies the user's exact GUI params to the first spot
// light in Sample_SpotLight, screenshots before/after camera tweaks.
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
if (!inner) { console.error('no iframe'); await app.close(); process.exit(1); }

// Apply the user's exact params to the first spot light.
const setup = await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.pointLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    if (!light) return { ok: false, reason: 'no spot light found in pointLightList' };
    light.transform.x = -86;
    light.transform.y = 338.13;
    light.transform.z = -300;
    light.transform.rotationX = 342;
    light.transform.rotationY = 360;
    light.transform.rotationZ = 199;
    light.intensity = 4;
    light.at = 25;
    light.radius = 1;
    light.range = 787;
    if ('outerAngle' in light) light.outerAngle = 96;
    if ('innerAngle' in light) light.innerAngle = 0;
    light.castShadow = true;
    return {
        ok: true,
        pos: [light.transform.x, light.transform.y, light.transform.z],
        range: light.lightData.range,
    };
});
console.log('setup', JSON.stringify(setup));

await inner.page().waitForTimeout(1500);

const biasInfo = await inner.evaluate(async () => {
    const core = await import('/src/index.ts');
    const { ShadowLightsCollect } = core;
    let light = null;
    for (const [, list] of ShadowLightsCollect.pointLightList.entries()) {
        if (list && list.length) { light = list[0]; break; }
    }
    return {
        shadowBias0: light.lightData.shadowBias[0],
        normalBias0: light.lightData.normalBias[0],
    };
});
console.log('biasInfo', JSON.stringify(biasInfo, null, 2));

const png = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/spot_shadow_probe.png`, png);

console.log('\n--- errors / warnings ---');
for (const m of consoleMessages) if (m.includes('error') || m.includes('pageerror') || m.includes('warn')) console.log(m.substring(0, 200));

await app.close();
