// Chrome (system, with --enable-unsafe-webgpu) + raw CDP via built-in WebSocket.
// Drives the samples/ menu via sessionStorage.target and captures a PNG.
//
// Usage: node test/multi/_chrome_shot.mjs <rel-sample-path> [wait_ms] [mode]
//   mode is optional; sets globalThis.__VERIFY_MODE before the iframe loads.
//
// Assumes vite is already running on :4000.

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');

const sampleArg = process.argv[2] || 'alpha/Sample_WBOIT.ts';
const WAIT_MS = Number(process.argv[3] ?? 5000);
const MODE = process.argv[4] || '';
const sample = sampleArg.startsWith('./') ? sampleArg : './' + sampleArg;
const HOST = 'http://localhost:4000';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const userDataDir = mkdtempSync(join(tmpdir(), 'cdp-shot-'));
const port = 9222 + Math.floor(Math.random() * 1000);

// SHOT_WINDOW_SIZE=WxH overrides the Chrome window OUTER size — used to
// reproduce RT-size-sensitive bugs (the bloom black-square repro is
// window-outer 1141x767 on macOS). Default kept off-screen + tiny so
// CI runs don't grab focus; setting SHOT_WINDOW_SIZE moves the window
// on-screen so Chrome reports its true frame dimensions to the page.
const WIN = process.env.SHOT_WINDOW_SIZE || '1024,768';
const ONSCREEN = !!process.env.SHOT_WINDOW_SIZE;
// SHOT_KEEP_ALIVE leaves the Chrome window running after the screenshot
// so the caller can inspect/drive it manually. Detached + stdio:ignore
// so this Node process exits cleanly without killing Chrome.
const KEEP_ALIVE = !!process.env.SHOT_KEEP_ALIVE;

const chrome = spawn(CHROME, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu-sandbox',
    `--window-size=${WIN.replace('x', ',')}`,
    ONSCREEN ? '--window-position=0,0' : '--window-position=2400,2400',
    'about:blank',
], KEEP_ALIVE
    ? { detached: true, stdio: 'ignore' }
    : { stdio: ['ignore', 'pipe', 'pipe'] });

if (chrome.stderr) chrome.stderr.on('data', () => {});
if (chrome.stdout) chrome.stdout.on('data', () => {});

async function fetchJson(url) {
    const r = await fetch(url);
    return r.json();
}

async function waitForPort() {
    for (let i = 0; i < 60; i++) {
        try {
            const v = await fetchJson(`http://localhost:${port}/json/version`);
            if (v?.webSocketDebuggerUrl) return v;
        } catch {}
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('Chrome CDP did not come up');
}

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.eventListeners = new Set();
        ws.addEventListener('message', (e) => {
            const msg = JSON.parse(e.data);
            if (msg.id != null && this.pending.has(msg.id)) {
                const { res, rej } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) rej(new Error(msg.error.message));
                else res(msg.result);
            } else if (msg.method) {
                for (const fn of this.eventListeners) fn(msg);
            }
        });
    }
    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((res, rej) => {
            this.pending.set(id, { res, rej });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    onEvent(fn) { this.eventListeners.add(fn); return () => this.eventListeners.delete(fn); }
}

async function main() {
    await fs.mkdir(OUT, { recursive: true });
    const v = await waitForPort();

    // Get the first/only target page.
    const tabs = await fetchJson(`http://localhost:${port}/json`);
    const tab = tabs.find(t => t.type === 'page') || tabs[0];

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const cdp = new CDP(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // SHOT_CANVAS_SIZE=WxH forces the iframe canvas to a specific pixel
    // size via Emulation.setDeviceMetricsOverride. Used when reproducing
    // RT-size-sensitive bugs where the exact canvas dimensions matter
    // (e.g. the bloom black-square repro at canvas 950x680).
    const canvasMatch = (process.env.SHOT_CANVAS_SIZE || '').match(/^(\d+)[x,](\d+)$/);
    if (canvasMatch) {
        const [, w, h] = canvasMatch;
        // index.html iframe sample selector occupies ~191px on the left;
        // viewport = canvas + 191 wide, same height.
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: Number(w) + 191,
            height: Number(h),
            deviceScaleFactor: 1,
            mobile: false,
        });
        process.stderr.write(`[shot] forced canvas ${w}x${h} (viewport ${Number(w) + 191}x${h})\n`);
    } else {
        // Else fall back to forcing Chrome window outer dimensions.
        const sizeMatch = WIN.match(/^(\d+)[x,](\d+)$/);
        if (process.env.SHOT_WINDOW_SIZE && sizeMatch) {
            const [, w, h] = sizeMatch;
            try {
                const { windowId } = await cdp.send('Browser.getWindowForTarget');
                await cdp.send('Browser.setWindowBounds', {
                    windowId,
                    bounds: { left: 0, top: 0, width: Number(w), height: Number(h), windowState: 'normal' },
                });
                process.stderr.write(`[shot] forced window outer ${w}x${h}\n`);
            } catch (e) {
                process.stderr.write(`[shot] setWindowBounds failed: ${e.message}\n`);
            }
        }
    }

    // Inject __VERIFY_MODE BEFORE the first navigation so it lands on the
    // top page AND propagates into the srcdoc iframe (the iframe inherits
    // pre-document scripts via Page.addScriptToEvaluateOnNewDocument).
    if (MODE) {
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            source: `globalThis.__VERIFY_MODE='${MODE}';`,
        });
    }

    // Capture console for debugging
    cdp.onEvent((m) => {
        if (m.method === 'Runtime.consoleAPICalled') {
            const args = (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
            process.stderr.write(`[page:${m.params.type}] ${args}\n`);
        } else if (m.method === 'Runtime.exceptionThrown') {
            const e = m.params.exceptionDetails;
            process.stderr.write(`[page:exception] ${e.text} ${e.exception?.description || ''}\n`);
        }
    });

    // Step 1: load page once to seed sessionStorage.
    await cdp.send('Page.navigate', { url: HOST + '/' });
    await waitFor(cdp, 'Page.loadEventFired', 15000);

    const seed = `(() => { sessionStorage.setItem('target', '${sample}');` +
        (MODE ? ` globalThis.__VERIFY_MODE='${MODE}';` : '') + ' return true; })()';
    await cdp.send('Runtime.evaluate', { expression: seed });

    // Step 2: reload so the seeded target is picked up. The pre-doc script
    // (from addScriptToEvaluateOnNewDocument) runs on this load too.
    await cdp.send('Page.reload');
    await waitFor(cdp, 'Page.loadEventFired', 15000);

    process.stderr.write(`[shot] settling ${WAIT_MS}ms...\n`);
    await new Promise(r => setTimeout(r, WAIT_MS));

    // macOS Chrome's Page.captureScreenshot can't sample the WebGPU swap chain
    // through the parent compositor (returns black for the iframe's region).
    // Workaround: blit the WebGPU canvas into a 2D canvas via drawImage from
    // INSIDE the iframe and toDataURL — this DOES work because drawImage on a
    // WebGPU canvas reads its current presentation texture directly.
    const blit = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {
            const f = document.querySelector('iframe');
            const d = f.contentDocument, w = f.contentWindow;
            const src = d.querySelector('canvas');
            if (!src) return { err: 'no canvas' };
            const c = d.createElement('canvas');
            c.width = src.width; c.height = src.height;
            const ctx = c.getContext('2d');
            await new Promise(r => w.requestAnimationFrame(r));
            ctx.drawImage(src, 0, 0);
            return { dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height };
        })()`,
        awaitPromise: true,
        returnByValue: true,
    });
    if (blit.result.value?.err) throw new Error('blit: ' + blit.result.value.err);
    process.stderr.write(`[blit] ${blit.result.value.w}x${blit.result.value.h}\n`);
    const data = blit.result.value.dataUrl.replace(/^data:image\/png;base64,/, '');
    const flat = sample.replace(/^\.\//, '').replace(/\//g, '_').replace(/\.ts$/, '');
    const tag = MODE ? `_${MODE}` : '';
    const out = join(OUT, `chrome_${flat}${tag}.png`);
    await fs.writeFile(out, Buffer.from(data, 'base64'));
    process.stdout.write(out + '\n');

    // SHOT_KEEP_ALIVE leaves Chrome running for manual inspection
    // (e.g. dragging the window to repro size-sensitive bugs). Caller
    // closes it themselves; this script exits Node but Chrome stays.
    if (process.env.SHOT_KEEP_ALIVE) {
        process.stderr.write(`[shot] keep-alive: chrome PID ${chrome.pid} stays running, CDP ws on port ${port}\n`);
        chrome.unref();
        ws.close();
        // Detach so Chrome isn't killed when this Node process exits.
        process.exit(0);
    }

    ws.close();
    chrome.kill('SIGTERM');
    setTimeout(() => process.exit(0), 200);
}

function waitFor(cdp, method, ms) {
    return new Promise((res, rej) => {
        const to = setTimeout(() => { off(); rej(new Error('timeout: ' + method)); }, ms);
        const off = cdp.onEvent((m) => { if (m.method === method) { clearTimeout(to); off(); res(m.params); } });
    });
}

main().catch((e) => {
    process.stderr.write('err: ' + (e.stack || e.message) + '\n');
    chrome.kill('SIGTERM');
    process.exit(2);
});
