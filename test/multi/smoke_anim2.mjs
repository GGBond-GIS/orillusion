// Smoke test for animation samples: hooks console + window.onerror +
// unhandledrejection inside the sample iframe so we actually catch sample-
// level failures (the outer page's console-message events miss iframe errors).
import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const HOST = 'http://localhost:4000';

const SAMPLES = process.argv.slice(2);
if (SAMPLES.length === 0) {
    SAMPLES.push(
        './animation/Sample_Skeleton.ts',
        './animation/Sample_AnimationIK.ts',
        './animation/Sample_AnimationAdditiveBlending.ts',
        './animation/Sample_AnimationRetargeting.ts',
    );
}

const allLogs = {};

async function probe(win, sample) {
    const logs = [];
    const handler = (_e, level, message, line, source) => {
        const lv = ['verbose','info','warning','error'][level] || 'log';
        logs.push({ lv, msg: message, line, source });
    };
    win.webContents.on('console-message', handler);

    await win.loadURL(HOST + '/');
    await win.webContents.executeJavaScript(`sessionStorage.setItem('target', '${sample}'); true`);
    await win.loadURL(HOST + '/');

    await new Promise(r => setTimeout(r, 1500));
    try {
        await win.webContents.executeJavaScript(`
            (function(){
                const ifr = document.querySelector('iframe');
                if (!ifr || !ifr.contentWindow) return;
                const w = ifr.contentWindow;
                w.__smokeErrors = [];
                w.addEventListener('error', e => {
                    w.__smokeErrors.push('window.error: ' + (e.message || e.error));
                });
                w.addEventListener('unhandledrejection', e => {
                    const r = e.reason;
                    w.__smokeErrors.push('unhandledrejection: ' + (r && r.stack || r));
                });
            })();
        `);
    } catch { /* iframe might not be ready yet */ }

    await new Promise(r => setTimeout(r, 5000));

    let frameErrors = [];
    try {
        frameErrors = await win.webContents.executeJavaScript(`
            (function(){
                const ifr = document.querySelector('iframe');
                if (!ifr || !ifr.contentWindow) return [];
                return ifr.contentWindow.__smokeErrors || [];
            })();
        `);
    } catch { /* ignored */ }

    // Capture screenshot for visual verification.
    try {
        const png = await win.webContents.capturePage();
        const slug = sample.replace(/[^a-zA-Z0-9]+/g, '_');
        await fs.writeFile(join(OUT, `smoke_${slug}.png`), png.toPNG());
    } catch { /* ignored */ }

    win.webContents.off('console-message', handler);

    const errs = logs.filter(l => l.lv === 'error').filter(l =>
        !l.msg.includes('Electron Security') &&
        !l.msg.includes('Content Security'));
    allLogs[sample] = { logs, frameErrors };

    const pass = errs.length === 0 && frameErrors.length === 0;
    process.stdout.write(`  errors=${errs.length} frameErrors=${frameErrors.length} ${pass ? 'PASS' : 'FAIL'}\n`);
    if (frameErrors.length > 0) for (const e of frameErrors) process.stdout.write('    fe: ' + e + '\n');
    if (errs.length > 0) for (const e of errs) process.stdout.write('    er: ' + (e.msg||'').slice(0,200) + '\n');
    return { sample, pass, errors: errs, frameErrors };
}

async function main() {
    await app.whenReady();
    await fs.mkdir(OUT, { recursive: true });
    const win = new BrowserWindow({ width: 1280, height: 800, show: false,
        webPreferences: { offscreen: false, sandbox: false, webSecurity: false } });

    const results = [];
    for (const s of SAMPLES) {
        process.stdout.write(`\n===== probing ${s} =====\n`);
        results.push(await probe(win, s));
    }
    await fs.writeFile(join(OUT, 'smoke_anim2.json'), JSON.stringify({ results, allLogs }, null, 2));

    const failed = results.filter(r => !r.pass);
    process.stdout.write(`\n=== SUMMARY ===\nTotal: ${results.length}, Failed: ${failed.length}\n`);
    if (failed.length === 0) process.stdout.write('PASS\n');
    else process.stdout.write('FAIL: ' + failed.map(r => r.sample).join(', ') + '\n');
    app.exit(failed.length === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); app.exit(2); });
