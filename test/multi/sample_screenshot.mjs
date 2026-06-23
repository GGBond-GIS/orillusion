// Capture a screenshot of one sample after WAIT_MS so we can eyeball the actual render.
// Usage: electron sample_screenshot.mjs <rel-sample-path> [wait_ms]
import { app, BrowserWindow } from 'electron/main';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const HOST = 'http://localhost:4000';
const sampleArg = process.argv[process.argv.length - 1].endsWith('.ts')
    ? process.argv[process.argv.length - 1]
    : 'sprite/Sample_Overlay.ts';
const sample = sampleArg.startsWith('./') ? sampleArg : './' + sampleArg;
const WAIT_MS = 3500;

async function main() {
    await app.whenReady();
    await fs.mkdir(OUT, { recursive: true });
    const win = new BrowserWindow({ width: 800, height: 700, show: false, webPreferences: { offscreen: false, sandbox: false } });
    await win.loadURL(HOST + '/samples/');
    await win.webContents.executeJavaScript(`sessionStorage.setItem('target', '${sample}'); true`);
    await win.loadURL(HOST + '/samples/');
    await new Promise(r => setTimeout(r, WAIT_MS));
    const png = await win.webContents.capturePage();
    const out = join(OUT, 'shot_' + sample.replace(/\//g, '_').replace(/\.ts$/, '') + '.png');
    await fs.writeFile(out, png.toPNG());
    process.stdout.write('saved ' + out + '\n');
    process.exit(0);
}
main().catch(e => { process.stderr.write('err: ' + e.message + '\n'); process.exit(2); });
