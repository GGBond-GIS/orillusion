// Probe every samples/**/Sample_*.ts against vite :4000.
// For each sample: load samples/, seed sessionStorage.target, reload, wait
// a short window, capture console. Report OK / FAIL based on presence of
// fatal console errors. Writes a per-sample JSON report.
import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { readdir } from 'fs/promises';
import { resolve } from 'path';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const HOST = 'http://localhost:4000';
const SAMPLES_DIR = resolve(__dirname, '../../samples');
const WAIT_MS = 3000;

// Samples that intentionally need user interaction / audio / large assets
// or that are known experimental — skip from smoke to keep the run finite.
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
    return out.sort().filter(s => !SKIP.has(s));
}

const errors = [];
const logs = [];
function log(level, line) {
    const s = `[${level}] ${line}`;
    logs.push(s);
    if (level === 'error') errors.push(s);
}

async function probe(win, sample) {
    errors.length = 0;
    logs.length = 0;
    await win.loadURL(HOST + '/samples/');
    await win.webContents.executeJavaScript(
        `sessionStorage.setItem('target', '${sample}'); true`,
    );
    await win.loadURL(HOST + '/samples/');
    await new Promise((r) => setTimeout(r, WAIT_MS));
    const fatal = errors.filter(
        (e) =>
            !e.includes('Electron Security') &&
            !e.includes('Content Security') &&
            !e.includes('Autofill.enable') &&
            !e.includes('Download the React') &&
            !e.includes('DevTools') &&
            !e.includes('"devtoolsUrl"'),
    );
    return {
        sample,
        status: fatal.length === 0 ? 'OK' : 'FAIL',
        errors: fatal.slice(0, 3),
        log_count: logs.length,
    };
}

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
    win.webContents.on('console-message', (_e, level, msg) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        log(lv, msg);
    });

    const results = [];
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        process.stdout.write(`[${i + 1}/${samples.length}] ${s} `);
        let r;
        try {
            r = await probe(win, s);
        } catch (e) {
            r = { sample: s, status: 'FAIL', errors: ['probe exception: ' + (e.message || e)], log_count: 0 };
        }
        process.stdout.write(r.status + (r.errors.length ? ' — ' + r.errors[0].slice(0, 140) : '') + '\n');
        results.push(r);
    }

    const fails = results.filter((r) => r.status !== 'OK');
    process.stdout.write(`\n===== summary: ${results.length - fails.length}/${results.length} OK, ${fails.length} FAIL =====\n`);
    if (fails.length) {
        for (const f of fails) {
            process.stdout.write(`FAIL ${f.sample}\n  ${f.errors.join('\n  ')}\n`);
        }
    }
    await fs.writeFile(join(OUT, 'sample_check_all.json'), JSON.stringify(results, null, 2), 'utf8');
    process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
    console.error('probe exception', e);
    process.exit(2);
});
