// Deep iframe-console sweep across every samples/**/Sample_*.ts.
//
// The standard `sample_check_all.mjs` listens to the parent window's
// console-message events, which DO NOT bubble up from the srcdoc
// iframe that actually runs the demo. Bugs that fire inside the
// iframe (shader compile errors, GPU validation, dynamic-import
// failures) get reported as 0 errors — false green.
//
// This probe loads each sample, polls for the iframe element, and
// installs a console.error/warn forwarder + window.onerror /
// unhandledrejection listeners INSIDE the iframe so its diagnostics
// surface in the parent's console-message stream. Use this — not
// sample_check_all — for color-space / shader / GPU regressions.
//
// Usage:
//   npx electron test/multi/sample_check_deep.mjs
// Writes report to test/multi/_out/sample_check_deep.json.
import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { promises as fs } from 'fs';
import { readdir } from 'fs/promises';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const HOST = 'http://localhost:4000';
const SAMPLES_DIR = resolve(__dirname, '../../samples');
const WAIT_MS = Number(process.env.SL_WAIT_MS) || 4500;

const SKIP = new Set([
    'audio/Sample_DynamicAudio.ts',
    'audio/Sample_StaticAudio.ts',
]);

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
    return out.sort().filter((s) => !SKIP.has(s));
}

const HOOK_INSTALL = `
(function(){
    const f = document.querySelector('iframe');
    if (!f || !f.contentWindow) return false;
    if (window.__hookInstalled) return true;
    try {
        const iw = f.contentWindow;
        ['log','info','warn','error'].forEach(lv => {
            const orig = iw.console[lv].bind(iw.console);
            iw.console[lv] = function(...args) {
                try {
                    const fmt = args.map(a => {
                        if (a && a.stack) return a.stack;
                        if (typeof a === 'object') { try { return JSON.stringify(a).slice(0,300); } catch(_) { return String(a); } }
                        return String(a);
                    }).join(' ');
                    (lv === 'error' ? console.error : lv === 'warn' ? console.warn : console.log)('[iframe.' + lv + '] ' + fmt);
                } catch(_) {}
                try { orig(...args); } catch(_) {}
            };
        });
        iw.addEventListener('error', e => console.error('[iframe.uncaught] ' + e.message + ' @ ' + e.filename + ':' + e.lineno));
        iw.addEventListener('unhandledrejection', e => console.error('[iframe.unhandledrejection] ' + (e.reason && (e.reason.stack || e.reason.message || String(e.reason)))));
        window.__hookInstalled = true;
        return true;
    } catch (e) {
        return false;
    }
})();
`;

async function main() {
    await app.whenReady();
    await fs.mkdir(OUT, { recursive: true });

    const samples = await listSamples();
    process.stdout.write(`probing ${samples.length} samples\n`);

    const win = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: { offscreen: false, sandbox: false },
    });

    let lines = [];
    win.webContents.on('console-message', (_e, level, msg) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        lines.push({ lv, msg });
    });

    const results = [];
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        lines = [];
        try {
            await win.loadURL(HOST + '/samples/');
            await win.webContents.executeJavaScript(`sessionStorage.setItem('target', './${s}'); true`);
            await win.loadURL(HOST + '/samples/');

            // Poll for the iframe element (samples/index.ts adds it
            // a few ms after the second loadURL) and install the hook.
            for (let a = 0; a < 30; a++) {
                const ok = await win.webContents.executeJavaScript(HOOK_INSTALL).catch(() => false);
                if (ok) break;
                await new Promise((r) => setTimeout(r, 100));
            }

            await new Promise((r) => setTimeout(r, WAIT_MS));

            // Reset the install flag so the next iteration installs
            // a fresh hook against the next sample's iframe.
            await win.webContents.executeJavaScript(`window.__hookInstalled = false; true`).catch(() => {});
        } catch (e) {
            lines.push({ lv: 'error', msg: 'probe exception: ' + (e.message || e) });
        }

        const errors = lines.filter(
            (l) =>
                l.lv === 'error' &&
                !l.msg.includes('Electron Security') &&
                !l.msg.includes('Content Security') &&
                !l.msg.includes('Autofill') &&
                !l.msg.includes('DevTools'),
        );
        const warns = lines.filter(
            (l) =>
                l.lv === 'warning' &&
                !l.msg.includes('Electron Security') &&
                !l.msg.includes('Content Security'),
        );

        const status = errors.length === 0 ? 'OK' : 'FAIL';
        process.stdout.write(`[${i + 1}/${samples.length}] ${s} ${status} (e=${errors.length} w=${warns.length})\n`);
        if (errors.length) {
            for (const e of errors.slice(0, 3)) process.stdout.write('  E: ' + e.msg.slice(0, 200) + '\n');
        }
        results.push({
            sample: s,
            status,
            errors: errors.slice(0, 5).map((e) => e.msg.slice(0, 400)),
            warnCount: warns.length,
        });
    }

    const fails = results.filter((r) => r.status !== 'OK');
    process.stdout.write(`\n===== summary: ${results.length - fails.length}/${results.length} OK, ${fails.length} FAIL =====\n`);
    if (fails.length) {
        for (const f of fails) {
            process.stdout.write(`FAIL ${f.sample}\n`);
            for (const e of f.errors) process.stdout.write('  ' + e + '\n');
        }
    }
    await fs.writeFile(join(OUT, 'sample_check_deep.json'), JSON.stringify(results, null, 2), 'utf8');
    process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
    process.stderr.write('probe exception: ' + (e.stack || e.message) + '\n');
    process.exit(2);
});
