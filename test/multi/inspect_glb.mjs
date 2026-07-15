// Inspect a GLB's animations + bone names by running it through Orillusion's
// loader inside an Electron renderer. Logs the clip names and the first few
// bones so we can write demos against the real animation set.
import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL_ = process.argv[2] || 'gltfs/glb/Xbot.glb';

const captured = [];

async function main() {
    await app.whenReady();
    const win = new BrowserWindow({ width: 600, height: 400, show: false,
        webPreferences: { offscreen: false, sandbox: false, webSecurity: false } });
    win.webContents.on('console-message', (_e, level, msg) => {
        captured.push({ lv: ['v','i','w','e'][level] || 'l', msg });
    });

    // Tell vite-served samples/index.ts which file to load, plus stash the
    // GLB URL on window for the inspector module.
    await win.loadURL('http://localhost:4000/');
    await win.webContents.executeJavaScript(`
        sessionStorage.setItem('target', './animation/_Sample_InspectGLB.ts');
        window.__INSPECT_URL__ = ${JSON.stringify(URL_)};
        true
    `);
    await win.loadURL('http://localhost:4000/');
    // Also propagate window.__INSPECT_URL__ into the iframe right after it mounts.
    await new Promise(r => setTimeout(r, 800));
    await win.webContents.executeJavaScript(`
        (function(){
            const ifr = document.querySelector('iframe');
            if (ifr && ifr.contentWindow) ifr.contentWindow.__INSPECT_URL__ = ${JSON.stringify(URL_)};
        })()
    `);

    // Wait for "DONE"
    let done = false;
    for (let i = 0; i < 30 && !done; i++) {
        await new Promise(r => setTimeout(r, 1000));
        for (const c of captured) if ((c.msg||'').includes('DONE')) { done = true; break; }
    }
    for (const c of captured) {
        if ((c.msg||'').includes('Insecure') || (c.msg||'').includes('webSecurity')) continue;
        process.stdout.write(c.msg + '\n');
    }
    app.exit(0);
}
main().catch(e => { console.error(e); app.exit(2); });
