// Sample center / off-center pixels from the WBOIT canvas in each mode.
// Lets us tell apart "alpha=0 transparent" vs "actually rendered black/white".
//
// Usage: node test/multi/_chrome_pixel_probe.mjs

import { spawn } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const HOST = 'http://localhost:4000';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = mkdtempSync(join(tmpdir(), 'cdp-pix-'));
const port = 9222 + Math.floor(Math.random() * 1000);

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
    '--enable-unsafe-webgpu', '--enable-features=Vulkan',
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1024,768', '--window-position=2400,2400',
    'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', () => {}); chrome.stdout.on('data', () => {});

async function fetchJson(u) { return (await fetch(u)).json(); }
async function waitPort() {
    for (let i = 0; i < 60; i++) { try { return await fetchJson(`http://localhost:${port}/json/version`); } catch {} await new Promise(r => setTimeout(r, 250)); }
    throw new Error('no cdp');
}

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); this.l = new Set();
        ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
            if (m.id != null && this.p.has(m.id)) { const x = this.p.get(m.id); this.p.delete(m.id); m.error ? x.rej(new Error(m.error.message)) : x.res(m.result); }
            else if (m.method) for (const fn of this.l) fn(m); });
    }
    send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    on(fn) { this.l.add(fn); }
}

async function main() {
    await waitPort();
    const tabs = await fetchJson(`http://localhost:${port}/json`);
    const tab = tabs.find(t => t.type === 'page');
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, rj) => { ws.addEventListener('open', r); ws.addEventListener('error', rj); });
    const cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const mode of ['sorted', 'weighted', 'hash']) {
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `globalThis.__VERIFY_MODE='${mode}';` });
        await cdp.send('Page.navigate', { url: HOST + '/' });
        await new Promise(r => { const off = (m) => { if (m.method === 'Page.loadEventFired') { cdp.l.delete(off); r(); } }; cdp.l.add(off); });
        await cdp.send('Runtime.evaluate', { expression: `sessionStorage.setItem('target', './alpha/Sample_WBOIT.ts')` });
        await cdp.send('Page.reload');
        await new Promise(r => { const off = (m) => { if (m.method === 'Page.loadEventFired') { cdp.l.delete(off); r(); } }; cdp.l.add(off); });
        await new Promise(r => setTimeout(r, 8000));

        // Sample 5 pixels: center, NW corner of cluster, mid-left, mid-right, far corner
        const probe = await cdp.send('Runtime.evaluate', {
            expression: `(async () => {
                const f = document.querySelector('iframe');
                const d = f.contentDocument, w = f.contentWindow;
                const src = d.querySelector('canvas');
                const c = d.createElement('canvas');
                c.width = src.width; c.height = src.height;
                const ctx = c.getContext('2d');
                await new Promise(r => w.requestAnimationFrame(r));
                ctx.drawImage(src, 0, 0);
                const samples = [
                    ['center', src.width / 2, src.height / 2],
                    ['cluster_lt', src.width * 0.4, src.height * 0.4],
                    ['cluster_rt', src.width * 0.6, src.height * 0.4],
                    ['cluster_lb', src.width * 0.4, src.height * 0.6],
                    ['far_corner', 50, 50],
                ];
                return samples.map(([name, x, y]) => {
                    const p = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
                    return [name, p[0], p[1], p[2], p[3]];
                });
            })()`,
            awaitPromise: true, returnByValue: true,
        });
        process.stdout.write(`\n=== mode=${mode} ===\n`);
        for (const [n, r, g, b, a] of probe.result.value) {
            process.stdout.write(`  ${n.padEnd(12)} rgba=(${r},${g},${b},${a})\n`);
        }
    }

    chrome.kill('SIGTERM');
    setTimeout(() => process.exit(0), 200);
}

main().catch((e) => { process.stderr.write('err: ' + e.message + '\n'); chrome.kill('SIGTERM'); process.exit(2); });
