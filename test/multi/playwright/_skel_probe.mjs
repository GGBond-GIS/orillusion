// Quick playwright probe for Sample_Skeleton variants. Reuses the existing
// vite on :4000.
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { promises as fs } from 'fs';

const HOST = 'http://localhost:4000';
const SAMPLES = process.argv.slice(2);
const OUT = '/tmp';

const main_js = '/Users/jbai/orillusion/test/multi/playwright/main.js';

const app = await electron.launch({
    executablePath: electronPath,
    args: [main_js],
    timeout: 30000,
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.addInitScript(() => {
    if (!sessionStorage.getItem('target')) sessionStorage.setItem('target', '__noop__');
});

for (const sample of SAMPLES) {
    const target = './' + sample;
    await page.goto('about:blank');
    await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => sessionStorage.setItem('target', t), target);
    await page.goto('about:blank');
    await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const png = await page.screenshot({ fullPage: false });
    const out = `${OUT}/skel_${sample.replace(/[\/]/g, '_').replace(/\.ts$/, '.png')}`;
    await fs.writeFile(out, png);
    process.stdout.write(`saved ${out}\n`);
}
await app.close();
