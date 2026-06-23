// Probe: turn on debugShadowRange for Sample_SpotLight and capture a view
// showing the new cone wireframe.
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
await inner.page().waitForTimeout(1000);

const png = await page.screenshot({ fullPage: false });
await fs.writeFile(`${OUT}/spot_cone_probe.png`, png);

await app.close();
