// Load a GI sample, wait for it to render, then:
// 1) capture console logs (especially WebGPU shader compilation errors)
// 2) screenshot the result
// 3) read back the direct light's lightData to verify lightColor RGB
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { promises as fs } from 'fs';

const HOST = process.env.HOST || 'http://localhost:8004';
const OUT = '/tmp';
const SAMPLES = process.argv.slice(2);
const main_js = '/Users/jbai/orillusion/test/multi/playwright/main.js';

const app = await electron.launch({ executablePath: electronPath, args: [main_js], timeout: 30000 });
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');

for (const sample of SAMPLES) {
    const logs = [];
    const onConsole = (msg) => logs.push({ type: msg.type(), text: msg.text() });
    page.on('console', onConsole);

    await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => sessionStorage.setItem('target', t), './' + sample);
    await page.goto('about:blank');
    await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);

    const frames = page.frames();
    const inner = frames.find((f) => f !== page.mainFrame());
    if (!inner) {
        console.error(`[${sample}] no inner frame`);
        continue;
    }

    const info = await inner.evaluate(async () => {
        const core = await import('/src/index.ts');
        const { ShadowLightsCollect, Engine3D } = core;
        const out = { lights: [] };
        for (const [, list] of ShadowLightsCollect.directionLightList.entries()) {
            for (const l of (list || [])) {
                out.lights.push({
                    lightColor: [l.lightData.lightColor.r, l.lightData.lightColor.g, l.lightData.lightColor.b],
                    intensity: l.lightData.intensity,
                    linear: l.lightData.linear,
                    direction: [l.lightData.direction.x, l.lightData.direction.y, l.lightData.direction.z],
                    enableCSM: !!l.enableCSM,
                    castShadow: !!l.castShadow,
                    lightType: l.lightData.lightType,
                    csmShadowMapNum: l.lightData.csmShadowMapNum,
                    csmShadowMapIndex: l.lightData.csmShadowMapIndex,
                    shadowBias: Array.isArray(l.lightData.shadowBias) ? l.lightData.shadowBias.slice() : null,
                });
            }
        }
        out.giEnabled = !!Engine3D.setting.gi.enable;
        out.giSettings = {
            indirectIntensity: Engine3D.setting.gi.indirectIntensity,
            ddgiGamma: Engine3D.setting.gi.ddgiGamma,
        };
        return out;
    });

    const filtered = logs.filter((l) =>
        l.type === 'error' ||
        /shader|compile|wgsl|webgpu|validation/i.test(l.text)
    );

    const png = await page.screenshot({ fullPage: false });
    const pngPath = `${OUT}/gi_${sample.replace(/[\/]/g, '_').replace(/\.ts$/, '')}.png`;
    await fs.writeFile(pngPath, png);

    console.log(`===== ${sample} =====`);
    console.log('info', JSON.stringify(info, null, 2));
    console.log(`logs (${filtered.length} filtered of ${logs.length} total):`);
    for (const l of filtered.slice(0, 40)) console.log(`  [${l.type}] ${l.text.slice(0, 300)}`);
    console.log(`screenshot: ${pngPath}`);

    page.off('console', onConsole);
}

await app.close();
