// Probe a single sample against vite :4000. Usage:
//   electron test/multi/sample_check_one.mjs <sample-rel-path>
// e.g. sprite/Sample_World.ts

import { app, BrowserWindow } from 'electron/main';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const HOST = 'http://localhost:4000';
const WAIT_MS = Number(process.env.SL_WAIT_MS) || 4000;

const sampleArg = process.argv[process.argv.length - 1];
if (!sampleArg || !sampleArg.endsWith('.ts')) {
    process.stdout.write(`usage: electron sample_check_one.mjs <rel-path-ending-in.ts>\n`);
    process.exit(2);
}
// samples/index.ts uses `import.meta.glob('./*/*.ts')` whose keys are
// prefixed with './'. The menu's <a> ids are those keys verbatim, and the
// load-on-refresh resolver does `document.querySelector('[id="${target}"]')`.
// Without the './' prefix the lookup fails silently and no iframe is created
// — the sample never runs.
const sample = sampleArg.startsWith('./') ? sampleArg : './' + sampleArg;

const errors = [];
const logs = [];
function log(level, line) {
    const s = `[${level}] ${line}`;
    logs.push(s);
    if (level === 'error') errors.push(s);
}

async function main() {
    await app.whenReady();

    const win = new BrowserWindow({
        width: Number(process.env.SL_W) || 800,
        height: Number(process.env.SL_H) || 600,
        show: false,
        webPreferences: { offscreen: false, sandbox: false },
    });
    win.webContents.on('console-message', (_e, level, msg) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        log(lv, msg);
    });

    await win.loadURL(HOST + '/samples/');
    const extra = [`sessionStorage.setItem('target', '${sample}');`];
    if (process.env.SL_Y) extra.push(`sessionStorage.setItem('spotlightY', '${process.env.SL_Y}');`);
    if (process.env.SL_SWEEP) extra.push(`sessionStorage.setItem('spotlightSweep', '1');`);
    if (process.env.SL_SHADOW_TYPE) extra.push(`sessionStorage.setItem('shadowType', '${process.env.SL_SHADOW_TYPE}');`);
    extra.push('true');
    await win.webContents.executeJavaScript(extra.join(' '));
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
    const warnLines = logs.filter((l) => l.startsWith('[warning]'));

    // capture a screenshot so we can eyeball the scene when the log isn't
    // enough. landing spot matches runner.mjs's _out/ convention.
    try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const OUT = join(__dirname, '_out');
        await fs.mkdir(OUT, { recursive: true });
        const png = await win.webContents.capturePage();
        await fs.writeFile(join(OUT, 'screenshot.png'), png.toPNG());
        process.stdout.write(`[info] screenshot: ${join(OUT, 'screenshot.png')}\n`);
    } catch (e) {
        process.stdout.write(`[warn] screenshot failed: ${e.message}\n`);
    }

    process.stdout.write(`===== ${sample} =====\n`);
    process.stdout.write(`logs: ${logs.length}   errors: ${fatal.length}   warnings: ${warnLines.length}\n`);
    for (const l of logs) process.stdout.write(l + '\n');
    process.exit(fatal.length ? 1 : 0);
}

main().catch((e) => {
    process.stderr.write('probe exception: ' + (e.stack || e.message) + '\n');
    process.exit(2);
});
