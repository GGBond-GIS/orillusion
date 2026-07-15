// Probe samples and capture errors + warnings, including WebGPU validation
// warnings. Aggregates by message signature so we can see which samples emit
// which warnings.
//
// Approach: webContents.console-message catches both JS console.* AND
// Chromium's internal warnings (incl. WebGPU validation). DevTools
// Protocol attach was unreliable here, so we stick to the simpler API.
import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import { readdir } from 'fs/promises';
import { resolve } from 'path';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');
// Make stdout line-buffered so progress shows live.
process.stdout._handle?.setBlocking?.(true);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const HOST = 'http://localhost:4000';
const SAMPLES_DIR = resolve(__dirname, '../../samples');
const WAIT_MS = 3500;

const SKIP = new Set([
    'audio/Sample_DynamicAudio.ts',
    'audio/Sample_StaticAudio.ts',
]);

const argv = process.argv.slice(2);
function arg(name) {
    const it = argv.find((a) => a.startsWith('--' + name + '='));
    return it ? it.slice(name.length + 3) : null;
}
const only = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const limit = parseInt(arg('limit') ?? '0', 10);
const start = parseInt(arg('start') ?? '0', 10);

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
    let r = out.sort().filter((s) => !SKIP.has(s));
    if (only) r = r.filter((s) => only.some((o) => s.includes(o)));
    if (start > 0) r = r.slice(start);
    if (limit > 0) r = r.slice(0, limit);
    return r;
}

function signatureOf(text) {
    const first = (text.split('\n')[0] || '').trim();
    return first
        .replace(/"[^"]*"/g, '"…"')
        .replace(/\b\d+\b/g, 'N')
        .slice(0, 240);
}

const IGNORE_SIG_FRAGMENTS = [
    'Electron Security Warning',
    'Content Security Policy',
    'Autofill.enable',
    'Download the React',
    'DevTools',
    'devtoolsUrl',
];

let captured = [];
function record(level, text) {
    if (level !== 'warning' && level !== 'error') return;
    const sig = signatureOf(text);
    if (IGNORE_SIG_FRAGMENTS.some((f) => sig.includes(f))) return;
    captured.push({ level, text, sig });
}

async function probe(win, sample) {
    captured = [];
    await win.loadURL(HOST + '/samples/');
    await win.webContents.executeJavaScript(
        `sessionStorage.setItem('target', '${sample}'); true`,
    );
    await win.loadURL(HOST + '/samples/');
    await new Promise((r) => setTimeout(r, WAIT_MS));
    return { sample, captured: captured.slice() };
}

async function main() {
    await app.whenReady();
    await fs.mkdir(OUT, { recursive: true });

    const samples = await listSamples();
    process.stdout.write(`probing ${samples.length} samples\n`);

    const win = new BrowserWindow({
        width: 600,
        height: 400,
        show: false,
        webPreferences: { offscreen: false, sandbox: false },
    });
    win.webContents.on('console-message', (_e, level, msg) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        record(lv, msg);
    });

    const results = [];
    const agg = new Map();

    for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        process.stdout.write(`[${i + 1}/${samples.length}] ${s}`);
        let r;
        try {
            r = await probe(win, s);
        } catch (e) {
            r = { sample: s, captured: [{ level: 'error', text: 'probe exception: ' + (e.message || e), sig: 'probe-exception' }] };
        }
        const ws = r.captured;
        const errCount = ws.filter((w) => w.level === 'error').length;
        const warnCount = ws.length - errCount;
        const counts = new Map();
        for (const w of ws) {
            counts.set(w.sig, (counts.get(w.sig) || 0) + 1);
            let a = agg.get(w.sig);
            if (!a) {
                a = { sig: w.sig, total: 0, samples: new Set(), example: w.text, level: w.level };
                agg.set(w.sig, a);
            }
            a.total++;
            a.samples.add(s);
        }
        const top = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 1)
            .map(([sig, n]) => `${n}× ${sig.slice(0, 70)}`)
            .join(' | ');
        const tag = errCount > 0 ? `FAIL(e=${errCount},w=${warnCount})` : warnCount > 0 ? `WARN(w=${warnCount})` : 'OK';
        process.stdout.write(`  ${tag}${top ? '  ' + top : ''}\n`);
        results.push({ sample: s, status: tag.split('(')[0], err: errCount, warn: warnCount, signatures: [...counts.entries()] });
    }

    process.stdout.write(`\n===== aggregated (sorted by sample-coverage) =====\n`);
    const sorted = [...agg.values()].sort((a, b) => b.samples.size - a.samples.size);
    for (const a of sorted) {
        process.stdout.write(`[${a.level}] ${a.samples.size} samples, ${a.total}×\n  sig: ${a.sig}\n  ex : ${(a.example.split('\n')[0] || '').slice(0, 220)}\n`);
    }

    process.stdout.write(`\n===== summary =====\n`);
    const fails = results.filter((r) => r.status === 'FAIL');
    const warns = results.filter((r) => r.status === 'WARN');
    const ok = results.filter((r) => r.status === 'OK');
    process.stdout.write(`OK=${ok.length}  WARN=${warns.length}  FAIL=${fails.length}  total=${results.length}\n`);
    if (fails.length) {
        process.stdout.write(`\nFAIL list:\n`);
        for (const f of fails) process.stdout.write(`  ${f.sample}  err=${f.err}\n`);
    }

    await fs.writeFile(
        join(OUT, 'sample_warnings.json'),
        JSON.stringify(
            {
                results,
                aggregated: sorted.map((a) => ({ ...a, samples: [...a.samples] })),
            },
            null,
            2,
        ),
        'utf8',
    );
    process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
    console.error('probe exception', e);
    process.exit(2);
});
