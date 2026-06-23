// Rapid-fire mode switching probe. Drives Sample_WBOIT through 200
// mode switches at 30ms intervals (faster than a single render frame
// at 60fps), to catch races between the sample's mode-flip path and
// the engine's per-frame render. Logs every console error/warning
// and screenshots a sample of late-cycle frames.

import { app, BrowserWindow } from 'electron/main';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const HOST = 'http://localhost:4000';
const WAIT_BOOT_MS = 5500;
const SAMPLE = './alpha/Sample_WBOIT.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out', 'wboit_rapid_mode');

const errors = [];
const warnings = [];
const logs = [];
function log(level, line) {
    const s = `[${level}] ${line}`;
    logs.push(s);
    if (level === 'error') errors.push(s);
    else if (level === 'warning') warnings.push(s);
}

async function main() {
    await app.whenReady();
    await fs.mkdir(OUT, { recursive: true });

    const win = new BrowserWindow({
        width: 800, height: 600, show: false,
        webPreferences: { offscreen: false, sandbox: false },
    });
    win.webContents.on('console-message', (_e, level, msg) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        log(lv, msg);
    });

    await win.loadURL(HOST + '/samples/');
    await win.webContents.executeJavaScript(`sessionStorage.setItem('target', '${SAMPLE}'); true`);
    await win.loadURL(HOST + '/samples/');
    await new Promise((r) => setTimeout(r, WAIT_BOOT_MS));

    const driver = (script) =>
        win.webContents.executeJavaScript(`
            (async () => { const w = document.querySelector('iframe').contentWindow; ${script} })()
        `);

    // Set up: PBR, alpha=0.5, weighted mode.
    await driver(`w.__wboit.setMaterial('pbr');`);
    await new Promise((r) => setTimeout(r, 1500));
    await driver(`w.__wboit.setAlpha(0.5);`);

    // Inject a frame counter so we know if rendering is keeping up.
    await driver(`
        w.__wboit_renderCount = 0;
        const orig = w.requestAnimationFrame;
        w.requestAnimationFrame = (cb) => orig.call(w, (t) => { w.__wboit_renderCount++; cb(t); });
    `);

    // Drive 200 mode switches at MIN delay between each call. The
    // browser dispatches each as a microtask and each setMode does
    // 27 spheres × 2 setter calls. We expect occasional frame drops
    // but no GPU validation errors and no permanent black canvas.
    const N = 200;
    const modes = ['sorted', 'weighted', 'hash'];

    process.stdout.write(`=== Rapid mode switch ×${N} ===\n`);
    const errBefore = errors.length;
    const startFrames = await driver(`return w.__wboit_renderCount;`);
    const t0 = Date.now();

    for (let i = 0; i < N; i++) {
        const mode = modes[i % 3];
        await driver(`w.__wboit.setMode('${mode}');`);
        // No additional wait — let the browser microtask queue flush.
    }
    const t1 = Date.now();
    const endFrames = await driver(`return w.__wboit_renderCount;`);
    const errAfter = errors.length;

    process.stdout.write(`elapsed: ${t1 - t0}ms  frames: ${endFrames - startFrames}  new errors: ${errAfter - errBefore}\n`);

    // Wait a beat then snapshot final state.
    await new Promise((r) => setTimeout(r, 500));
    const finalPng = await win.webContents.capturePage();
    await fs.writeFile(join(OUT, 'final.png'), finalPng.toPNG());
    const finalSize = (await fs.stat(join(OUT, 'final.png'))).size;
    process.stdout.write(`final canvas size: ${finalSize} bytes (final mode: ${modes[(N - 1) % 3]})\n`);

    // Now do alternating mode flips with a SINGLE-MICROTASK gap (no
    // setTimeout, just await Promise.resolve). This is the tightest
    // possible cycle.
    process.stdout.write(`\n=== Microtask-tight switching ×100 ===\n`);
    const errBefore2 = errors.length;
    await driver(`
        const modes = ['sorted', 'weighted', 'hash'];
        for (let i = 0; i < 100; i++) {
            w.__wboit.setMode(modes[i % 3]);
            await Promise.resolve();
        }
        return 'done';
    `);
    const errAfter2 = errors.length;
    process.stdout.write(`new errors: ${errAfter2 - errBefore2}\n`);

    await new Promise((r) => setTimeout(r, 500));
    const png2 = await win.webContents.capturePage();
    await fs.writeFile(join(OUT, 'after_microtask.png'), png2.toPNG());
    const size2 = (await fs.stat(join(OUT, 'after_microtask.png'))).size;
    process.stdout.write(`canvas size after microtask cycle: ${size2} bytes\n`);

    // Final: capture frames during a slow visible cycle so we can
    // inspect for visual artifacts manually.
    process.stdout.write(`\n=== Slow visible cycle (15 mode switches, screenshot each) ===\n`);
    for (let i = 0; i < 15; i++) {
        const mode = modes[i % 3];
        await driver(`w.__wboit.setMode('${mode}');`);
        await new Promise((r) => setTimeout(r, 350));
        const png = await win.webContents.capturePage();
        const path = join(OUT, `slow_${String(i).padStart(2, '0')}_${mode}.png`);
        await fs.writeFile(path, png.toPNG());
        const sz = (await fs.stat(path)).size;
        process.stdout.write(`  slow_${i}_${mode}: ${sz}b\n`);
    }

    process.stdout.write(`\n===== Summary =====\n`);
    process.stdout.write(`total errors: ${errors.length}  warnings: ${warnings.length}\n`);
    if (errors.length > 0) {
        process.stdout.write('\nFirst 30 errors:\n');
        for (const e of errors.slice(0, 30)) process.stdout.write(e + '\n');
    }
    const seenW = new Set();
    if (warnings.length > 0) {
        process.stdout.write('\nUnique warnings (excl. CSP):\n');
        for (const w of warnings) {
            if (seenW.has(w) || w.includes('Electron Security')) continue;
            seenW.add(w);
            process.stdout.write(w + '\n');
        }
    }

    process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
    process.stderr.write('probe exception: ' + (e.stack || e.message) + '\n');
    process.exit(2);
});
