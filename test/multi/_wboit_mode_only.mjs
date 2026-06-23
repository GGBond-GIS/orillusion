// Mode-only switching probe. Drives Sample_WBOIT through dense mode
// transitions WITHOUT touching alpha or material — isolates mode
// switching as the only changing axis. Captures every transition.

import { app, BrowserWindow } from 'electron/main';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const HOST = 'http://localhost:4000';
const WAIT_BOOT_MS = 5500;
const WAIT_RENDER_MS = 400;
const SAMPLE = './alpha/Sample_WBOIT.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out', 'wboit_mode_only');

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

    const ready = await win.webContents.executeJavaScript(`
        (() => { const ifr = document.querySelector('iframe');
                 return !!(ifr && ifr.contentWindow && ifr.contentWindow.__wboit); })()
    `);
    if (!ready) {
        process.stderr.write('probe: hook not ready\n');
        process.exit(2);
    }

    const driver = (script) =>
        win.webContents.executeJavaScript(`
            (async () => { const w = document.querySelector('iframe').contentWindow; ${script} })()
        `);

    const shoot = async (name) => {
        await new Promise((r) => setTimeout(r, WAIT_RENDER_MS));
        const png = await win.webContents.capturePage();
        const path = join(OUT, name + '.png');
        await fs.writeFile(path, png.toPNG());
        return (await fs.stat(path)).size;
    };

    // Pin material to PBR and alpha to 0.5; drive mode through every
    // ordered pair of (sorted, weighted, hash) so we exercise all 6
    // directional transitions, plus repeats.
    await driver(`w.__wboit.setMaterial('pbr');`);
    await new Promise((r) => setTimeout(r, 1500));
    await driver(`w.__wboit.setAlpha(0.5);`);
    await new Promise((r) => setTimeout(r, 600));

    const sequence = [
        'sorted', 'weighted',  // SW (lazy OIT create)
        'weighted', 'sorted',  // WS (OIT pass becomes idle)
        'sorted', 'hash',      // SH (BLEND→HASH, opaque queue)
        'hash', 'sorted',      // HS (back to BLEND/sorted)
        'hash', 'weighted',    // HW (HASH→WBOIT)
        'weighted', 'hash',    // WH
        'sorted', 'weighted', 'hash', 'sorted', // chained
        'weighted', 'sorted', 'hash', 'weighted', // chained
        'hash', 'weighted', 'sorted', 'hash', // chained
    ];

    const sizes = [];
    for (let i = 0; i < sequence.length; i++) {
        const mode = sequence[i];
        const errBefore = errors.length;
        await driver(`w.__wboit.setMode('${mode}');`);
        await new Promise((r) => setTimeout(r, WAIT_RENDER_MS));
        const errAfter = errors.length;
        const size = await shoot(`step${String(i).padStart(2, '0')}_${mode}`);
        sizes.push({ step: i, mode, size, errs: errAfter - errBefore });
        const tag = size < 50_000 ? '!! BLACK ' : '   render';
        process.stdout.write(`${tag} step${i.toString().padStart(2, '0')} ${mode}: ${size}b errs=${errAfter - errBefore}\n`);
    }

    // Detect "stuck black" patterns — any mode that consistently
    // black-canvases in this sequence.
    const blackCounts = {};
    for (const s of sizes) {
        if (s.size < 50_000) blackCounts[s.mode] = (blackCounts[s.mode] || 0) + 1;
    }

    process.stdout.write('\n===== Summary =====\n');
    process.stdout.write(`steps: ${sequence.length}  errors: ${errors.length}  warnings: ${warnings.length}\n`);
    if (Object.keys(blackCounts).length > 0) {
        process.stdout.write('Modes that produced black canvas:\n');
        for (const [mode, count] of Object.entries(blackCounts)) {
            process.stdout.write(`  ${mode}: ${count} times\n`);
        }
    }

    if (errors.length > 0) {
        process.stdout.write('\nFirst 20 errors:\n');
        for (const e of errors.slice(0, 20)) process.stdout.write(e + '\n');
    }
    const seenW = new Set();
    if (warnings.length > 0) {
        process.stdout.write('\nUnique warnings:\n');
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
