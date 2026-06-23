// Playwright + Electron sample runner.
//
// For EACH samples/*/Sample_*.ts:
//   1. Navigate the samples page with sessionStorage.target seeded.
//   2. Listen for vite compile errors, pageerrors, and fatal console errors.
//   3. Wait for the srcdoc iframe's <canvas> to appear with non-zero size.
//   4. Wait a short settle window for frames to render.
//   5. Read pixels from the canvas via a 2D drawImage round-trip and compute
//      coarse variance. Near-zero variance == nothing drawn.
//   6. Record status: OK | FAIL_COMPILE | FAIL_RUNTIME | FAIL_RENDER.
//
// Outputs (under test/multi/_out/):
//   playwright_report.json    — structured per-sample result
//   playwright_report.html    — readable report with screenshots
//   screenshots/<flat>.png    — full-window screenshot per sample
//
// Usage:
//   node test/multi/playwright/runner.mjs                       # full suite
//   node test/multi/playwright/runner.mjs --samples='base/'     # regex filter
//   node test/multi/playwright/runner.mjs --limit=5             # first N
//   node test/multi/playwright/runner.mjs --headed              # show window

import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { PNG } from 'pngjs';
import { spawn } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { readdir } from 'fs/promises';

function varianceFromPng(buf) {
    const png = PNG.sync.read(buf);
    const { width: w, height: h, data } = png;
    // Sample a 64×64 grid (cheap) for stddev and per-channel non-uniformity.
    const sx = Math.max(1, Math.floor(w / 64));
    const sy = Math.max(1, Math.floor(h / 64));
    let sum = 0, count = 0;
    const grays = [];
    for (let y = 0; y < h; y += sy) {
        for (let x = 0; x < w; x += sx) {
            const i = (y * w + x) * 4;
            const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            grays.push(g); sum += g; count++;
        }
    }
    const mean = sum / count;
    let vs = 0;
    for (const g of grays) { const d = g - mean; vs += d * d; }
    return Math.sqrt(vs / count);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const OUT = resolve(__dirname, '../_out');
const SHOTS = join(OUT, 'screenshots');
const SAMPLES_DIR = join(ROOT, 'samples');
const MAIN_JS = join(__dirname, 'main.js');
const HOST = 'http://localhost:4000';

const LOAD_TIMEOUT_MS = 20000;
const CANVAS_WAIT_MS = 10000;
const SETTLE_MS = 2500;
const VARIANCE_THRESHOLD = 6;       // grayscale stddev below this == uniform canvas

const SKIP = new Set([
    'audio/Sample_DynamicAudio.ts',
    'audio/Sample_StaticAudio.ts',
    // Pure CPU benchmark — no Engine3D.init, no canvas by design.
    'benchmark/Sample_Matrix.ts',
]);

const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const m = a.match(/^--([^=]+)=(.*)$/);
        return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
    }),
);

// Coverage note: `packages/*` is exercised transitively through samples/.
//   - @orillusion/debug            -> almost every sample uses GUIHelp
//   - @orillusion/physics + ammo   -> samples/physics/*
//   - @orillusion/graphic          -> samples/graphic/*
//   - @orillusion/stats            -> samples/stats/* + many others
//   - @orillusion/geometry         -> samples/geometry/*
//   - @orillusion/media-extention  -> samples/material/Sample_VideoMaterial
//   - @orillusion/particle         -> samples/particle/*
//   - @orillusion/post             -> samples/post/* (re-exported by core)
//   - @orillusion/draco            -> samples/animation/Sample_Skeleton3 (draco glb)
// No package ships its own samples/ today; if that changes, this walker
// needs to also pick up packages/*/samples/.
async function listSamples() {
    const out = [];
    async function walk(dir, prefix) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            const p = join(dir, e.name);
            const rel = prefix ? prefix + '/' + e.name : e.name;
            if (e.isDirectory()) await walk(p, rel);
            else if (/^Sample_.*\.ts$/.test(e.name)) out.push(rel);
        }
    }
    await walk(SAMPLES_DIR, '');
    let list = out.sort().filter(s => !SKIP.has(s));
    if (args.samples) {
        const re = new RegExp(args.samples);
        list = list.filter(s => re.test(s));
    }
    if (args.limit) list = list.slice(0, parseInt(args.limit, 10));
    return list;
}

function startVite() {
    return new Promise((res, rej) => {
        const proc = spawn(
            'npx', ['vite', '--port', '4000', '--strictPort'],
            { cwd: ROOT, detached: true },
        );
        let ready = false;
        proc.stdout.on('data', (buf) => {
            const s = buf.toString();
            process.stdout.write('[vite] ' + s);
            if (!ready && /vite.*ready/i.test(s)) { ready = true; res(proc); }
        });
        proc.stderr.on('data', (b) => process.stderr.write('[vite-err] ' + b.toString()));
        proc.on('error', rej);
        setTimeout(() => { if (!ready) rej(new Error('vite not ready in 30s')); }, 30000);
    });
}

function killVite(proc) {
    if (!proc) return;
    try { process.kill(-proc.pid); } catch { /* ignored */ }
}

const BENIGN = [
    /Electron Security/i,
    /Content Security/i,
    /Autofill\.enable/,
    /Download the React DevTools/i,
    /DevTools listening/i,
    /devtoolsUrl/,
    /Insecure Content-Security-Policy/i,
];
const isBenign = (msg) => BENIGN.some(re => re.test(msg));

const isCompileError = (msg) => (
    /Failed to fetch dynamically imported module/.test(msg) ||
    /\[vite\].*error/i.test(msg) ||
    /Transform failed/i.test(msg) ||
    /error TS\d+/.test(msg) ||
    /Pre-transform error/.test(msg) ||
    /SyntaxError:.*Unexpected/i.test(msg)
);

const flatName = (s) => s.replace(/[\/\\]/g, '__').replace(/\.ts$/, '.png');

async function probeSample(page, sample) {
    const state = {
        consoleErrors: [], consoleWarnings: [], pageErrors: [],
        compile: false, variance: 0,
        status: 'UNKNOWN', detail: '',
    };

    const onConsole = (m) => {
        if (m.type() !== 'error' && m.type() !== 'warning') return;
        const text = m.text();
        if (isBenign(text)) return;
        if (m.type() === 'error') state.consoleErrors.push(text);
        else if (m.type() === 'warning') state.consoleWarnings.push(text);
        if (isCompileError(text)) state.compile = true;
    };
    const onPageErr = (err) => {
        const msg = err.message || String(err);
        const stack = err.stack ? String(err.stack) : '';
        const first = stack.split('\n').find(l => l.includes('http://') || l.includes('/src/') || l.includes('/samples/'));
        const s = first ? `${msg}  @ ${first.trim()}` : msg;
        state.pageErrors.push(s);
        if (isCompileError(s)) state.compile = true;
    };
    try {
        // Menu entries are keyed by the globbed path, which looks like
        // './base/Sample_X.ts' — the leading './' must be preserved.
        const target = sample.startsWith('./') ? sample : './' + sample;

        // Park on about:blank first so any previous sample's teardown errors
        // don't get attributed to this one. Then seed storage and load.
        await page.goto('about:blank', { timeout: LOAD_TIMEOUT_MS });
        await page.goto(HOST + '/', { timeout: LOAD_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
        await page.evaluate((t) => {
            sessionStorage.setItem('target', t);
            sessionStorage.setItem('top', '0');
        }, target);
        await page.goto('about:blank', { timeout: LOAD_TIMEOUT_MS });

        // Attach listeners now — only errors from the sample's own run count.
        page.on('console', onConsole);
        page.on('pageerror', onPageErr);

        await page.goto(HOST + '/', { timeout: LOAD_TIMEOUT_MS, waitUntil: 'domcontentloaded' });

        // Wait for the srcdoc iframe and its canvas to appear.
        const started = Date.now();
        let canvasInfo = null;
        let sampleFrame = null;
        while (Date.now() - started < CANVAS_WAIT_MS) {
            sampleFrame = page.frames().find(f => f !== page.mainFrame());
            if (sampleFrame) {
                try {
                    canvasInfo = await sampleFrame.evaluate(() => {
                        const c = document.querySelector('canvas');
                        if (!c) return null;
                        return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight,
                                 count: document.querySelectorAll('canvas').length };
                    });
                } catch { /* frame may be attaching; retry */ }
            }
            if (canvasInfo && canvasInfo.w > 0 && canvasInfo.h > 0) break;
            if (state.compile) break;
            await page.waitForTimeout(150);
        }

        if (state.compile) {
            state.status = 'FAIL_COMPILE';
            state.detail = [...state.pageErrors, ...state.consoleErrors].find(isCompileError) || 'compile error';
            return state;
        }
        if (!canvasInfo) {
            state.status = 'FAIL_RENDER';
            state.detail = 'no <canvas> appeared in iframe within ' + CANVAS_WAIT_MS + 'ms';
            return state;
        }

        // Let the scene render a few frames.
        await page.waitForTimeout(SETTLE_MS);

        // Any runtime error fired during settle?
        const runtime = [...state.pageErrors, ...state.consoleErrors].filter(s => !isCompileError(s));
        if (runtime.length) {
            state.status = 'FAIL_RUNTIME';
            state.detail = runtime[0].slice(0, 300);
            return state;
        }

        // Pixel variance across every canvas. drawImage on a WebGPU canvas is
        // unreliable (presentation texture can be unreadable), so we use the
        // window composite instead: Playwright screenshots the page region
        // covering each canvas (in iframe coords + iframe offset), then we
        // decode the PNG and compute grayscale stddev.
        const rects = await sampleFrame.evaluate(() => {
            const canvases = Array.from(document.querySelectorAll('canvas'));
            return canvases.map((c) => {
                const r = c.getBoundingClientRect();
                // Hidden 2D canvases (e.g. image-processing scratch buffers)
                // report zero-size rects. Skip them so they don't masquerade
                // as failed readbacks from the engine's render target.
                const hidden = c.hidden || c.offsetParent === null;
                return { x: r.x, y: r.y, w: r.width, h: r.height, hidden };
            });
        });
        const iframeBox = await page.locator('iframe').first().boundingBox();
        const variances = [];
        for (const r of rects) {
            if (r.hidden || !r.w || !r.h) continue;
            const clip = {
                x: Math.round((iframeBox?.x || 0) + r.x),
                y: Math.round((iframeBox?.y || 0) + r.y),
                width: Math.max(1, Math.round(r.w)),
                height: Math.max(1, Math.round(r.h)),
            };
            try {
                const png = await page.screenshot({ clip });
                variances.push(varianceFromPng(png));
            } catch (e) {
                variances.push(-2);
            }
        }
        state.variance = variances.length ? Math.min(...variances) : 0;
        state.canvasCount = variances.length;

        if (state.variance < 0) {
            state.status = 'FAIL_RENDER';
            state.detail = `pixel readback failed (codes=${variances.join(',')})`;
        } else if (state.variance < VARIANCE_THRESHOLD) {
            state.status = 'FAIL_RENDER';
            state.detail = `canvas uniform (min stddev=${state.variance.toFixed(2)}/${VARIANCE_THRESHOLD}; per-canvas=[${variances.map(v=>v.toFixed(1)).join(',')}])`;
        } else {
            state.status = 'OK';
            state.detail = `canvases=${variances.length} min-stddev=${state.variance.toFixed(2)}`;
        }
    } catch (e) {
        state.status = 'FAIL_RUNTIME';
        state.detail = 'probe exception: ' + (e.message || e);
    } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageErr);
    }
    return state;
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c])); }

function writeHtmlReport(results) {
    const rows = results.map(r => {
        const color = r.status === 'OK' ? '#c8f7c5' : '#f7c5c5';
        const shot = r.screenshot ? `<img src="screenshots/${r.screenshot}" width="200" loading="lazy"/>` : '';
        const errs = (r.consoleErrors || []).concat(r.pageErrors || [])
            .slice(0, 3).map(e => `<div>${escapeHtml(e).slice(0, 400)}</div>`).join('');
        return `<tr style="background:${color}"><td>${r.sample}</td><td>${r.status}</td><td>${escapeHtml(r.detail || '')}</td><td>${shot}</td><td>${errs}</td></tr>`;
    }).join('');
    const ok = results.filter(r => r.status === 'OK').length;
    return `<!doctype html><meta charset="utf-8"><title>Sample Render Report</title>
<style>body{font:13px/1.4 -apple-system,sans-serif;margin:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;vertical-align:top}th{background:#eee;text-align:left}</style>
<h1>Sample Render Report</h1>
<p><b>${ok}</b> / ${results.length} OK</p>
<table><thead><tr><th>Sample</th><th>Status</th><th>Detail</th><th>Preview</th><th>Errors</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function launchElectron() {
    const app = await electron.launch({
        executablePath: electronPath,
        args: [MAIN_JS],
        timeout: 30000,
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Without this, samples/index.ts auto-clicks the alphabetically first
    // sample when no target is set — those errors then leak into the first
    // real probe. Seed a no-op target so the index script no-ops until the
    // probe overwrites it.
    await page.addInitScript(() => {
        if (!sessionStorage.getItem('target')) {
            sessionStorage.setItem('target', '__pw_noop__');
        }
    });
    return { app, page };
}

async function main() {
    await fs.mkdir(OUT, { recursive: true });
    await fs.mkdir(SHOTS, { recursive: true });

    const samples = await listSamples();
    // Electron/playwright accumulates GPU + renderer state across samples and
    // eventually the browser process dies ("Target page, context or browser
    // has been closed"). Restart every BATCH samples to keep it healthy.
    const BATCH = Number(args.batch ?? 30);
    process.stdout.write(`[pw] ${samples.length} samples to probe (batch=${BATCH})\n`);

    // Reuse an existing vite on :4000 if one is already serving — lets the
    // runner cooperate with an interactive dev session instead of fighting it
    // over the port.
    let vite = null;
    try {
        const probe = await fetch(HOST + '/');
        if (probe.ok) process.stdout.write('[pw] reusing existing vite on :4000\n');
        else throw new Error('probe not ok');
    } catch {
        vite = await startVite();
    }
    let { app: electronApp, page } = await launchElectron();

    const results = [];
    const t0 = Date.now();
    for (let i = 0; i < samples.length; i++) {
        if (i > 0 && i % BATCH === 0) {
            process.stdout.write(`[pw] restarting electron after ${i} samples\n`);
            try { await electronApp.close(); } catch { /* ignored */ }
            ({ app: electronApp, page } = await launchElectron());
        }
        const s = samples[i];
        process.stdout.write(`[${i + 1}/${samples.length}] ${s}`.padEnd(64) + ' ... ');
        let r;
        try { r = await probeSample(page, s); }
        catch (e) { r = { status: 'FAIL_RUNTIME', detail: 'outer: ' + (e.message || e), consoleErrors: [], pageErrors: [] }; }
        r.sample = s;
        try {
            const png = await page.screenshot({ fullPage: false });
            r.screenshot = flatName(s);
            await fs.writeFile(join(SHOTS, r.screenshot), png);
        } catch { /* ignored */ }
        const tag = r.status === 'OK' ? '\x1b[32mOK\x1b[0m' : '\x1b[31m' + r.status + '\x1b[0m';
        process.stdout.write(`${tag} ${r.detail || ''}\n`);
        results.push(r);

        // If the browser died mid-probe, relaunch immediately so we don't
        // lose the rest of the run to cascading "page closed" failures.
        if (r.status !== 'OK' && /browser has been closed|Target page.*closed/i.test(r.detail || '')) {
            process.stdout.write(`[pw] browser died — relaunching electron\n`);
            try { await electronApp.close(); } catch { /* ignored */ }
            ({ app: electronApp, page } = await launchElectron());
        }
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    try { await electronApp.close(); } catch { /* ignored */ }
    killVite(vite);

    await fs.writeFile(join(OUT, 'playwright_report.json'), JSON.stringify(results, null, 2), 'utf8');
    await fs.writeFile(join(OUT, 'playwright_report.html'), writeHtmlReport(results), 'utf8');

    const ok = results.filter(r => r.status === 'OK').length;
    const fail = results.length - ok;
    process.stdout.write(`\n===== ${ok}/${results.length} OK, ${fail} FAIL (${elapsed}s) =====\n`);
    process.stdout.write(`report: ${join(OUT, 'playwright_report.html')}\n`);
    if (fail) {
        for (const r of results.filter(r => r.status !== 'OK')) {
            process.stdout.write(`  ${r.status.padEnd(14)} ${r.sample} — ${r.detail}\n`);
        }
    }
    process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('runner exception', e); process.exit(2); });
