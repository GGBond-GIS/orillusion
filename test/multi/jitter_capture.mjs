// Reproduce + capture an animation jitter bug:
// 1. Load Sample_AnimationAdditiveBlending
// 2. After 3s init, programmatically set sneak_pose layer weight to 0.5
// 3. Capture 8 screenshots at 250ms intervals
// 4. Save as smoke_jitter_NN.png so we can visually diff successive frames
import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const HOST = 'http://localhost:4000';

async function main() {
    await app.whenReady();
    await fs.mkdir(OUT, { recursive: true });

    const win = new BrowserWindow({
        width: 1920, height: 1080, show: false,
        webPreferences: { offscreen: false, sandbox: false, webSecurity: false }
    });

    const logs = [];
    win.webContents.on('console-message', (_e, _l, msg) => logs.push(msg));

    const SAMPLE = process.argv[2] || './animation/Sample_AnimationAdditiveBlending.ts';
    await win.loadURL(HOST + '/');
    await win.webContents.executeJavaScript(
        `sessionStorage.setItem('target', '${SAMPLE}'); true`
    );
    await win.loadURL(HOST + '/');
    await new Promise(r => setTimeout(r, 5000));

    // Capture 12 frames at 80ms intervals — fast enough to catch
    // per-frame jitter that 250ms misses.
    for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 80));
        const png = await win.webContents.capturePage();
        const path = join(OUT, `jitter_${String(i).padStart(2, '0')}.png`);
        await fs.writeFile(path, png.toPNG());
        process.stdout.write(`captured frame ${i}\n`);
    }

    await fs.writeFile(join(OUT, 'jitter_console.log'), logs.join('\n'));
    app.exit(0);
}
main().catch(e => { console.error(e); app.exit(2); });
