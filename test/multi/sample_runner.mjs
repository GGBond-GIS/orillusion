// Smoke test for samples/base/Sample_MultiInstance.ts through the real
// samples menu on port 8000. Seeds sessionStorage.target, reloads,
// captures screenshot + console.
import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const URL_ = 'http://localhost:4000/';
const TARGET = './base/Sample_MultiInstance.ts';
const WAIT_MS = 6000;

const logs = [];
function capture(level, line) {
    const ts = new Date().toISOString().substring(11, 23);
    logs.push(`[${ts}] [${level}] ${line}`);
    process.stdout.write(`[${ts}] [${level}] ${line}\n`);
}

async function main() {
    await app.whenReady();
    const win = new BrowserWindow({ width: 900, height: 520, show: false, webPreferences: { sandbox: false } });

    win.webContents.on('console-message', (_e, level, message, line, source) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        capture(lv, `${message}  (${source}:${line})`);
    });
    win.webContents.on('render-process-gone', (_e, d) => capture('error', 'gone:' + JSON.stringify(d)));

    await win.loadURL(URL_);
    await win.webContents.executeJavaScript(`sessionStorage.setItem('target', ${JSON.stringify(TARGET)});`);
    await win.loadURL(URL_);

    await new Promise(r => setTimeout(r, WAIT_MS));

    await fs.mkdir(OUT, { recursive: true });
    const png = await win.webContents.capturePage();
    await fs.writeFile(join(OUT, 'sample_screenshot.png'), png.toPNG());
    await fs.writeFile(join(OUT, 'sample_console.log'), logs.join('\n'));
    capture('info', `screenshot saved: ${join(OUT, 'sample_screenshot.png')}`);
    process.exit(0);
}

main().catch(e => { capture('error', e.stack || e.message); process.exit(2); });
