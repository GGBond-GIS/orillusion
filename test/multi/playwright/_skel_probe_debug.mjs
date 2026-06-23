// Debug version: capture console messages and pageerrors.
import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { promises as fs } from 'fs';

const HOST = 'http://localhost:4000';
const SAMPLE = process.argv[2] || 'animation/Sample_Skeleton3.ts';
const main_js = '/Users/jbai/orillusion/test/multi/playwright/main.js';

const app = await electron.launch({
    executablePath: electronPath,
    args: [main_js],
    timeout: 30000,
});
const page = await app.firstWindow();
const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text().slice(0,500)}`));
page.on('pageerror', err => logs.push(`[pageerror] ${err.message}\n${err.stack || ''}`));

await page.waitForLoadState('domcontentloaded');
const target = './' + SAMPLE;
// Set sessionStorage on every navigation BEFORE the page script runs so
// the index loads our target on the very first navigation — avoids
// running the index's default-first-sample path which may itself crash
// and pollute the error logs with unrelated noise.
await page.addInitScript((t) => {
    try { sessionStorage.setItem('target', t); } catch {}
}, target);
await page.goto(HOST + '/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const png = await page.screenshot({ fullPage: false });
const out = `/tmp/skel_dbg.png`;
await fs.writeFile(out, png);
process.stdout.write(`saved ${out}\n`);
process.stdout.write('--- logs ---\n');
for (const l of logs) process.stdout.write(l + '\n');
await app.close();
