// Narrow Electron runner for the Frame Graph test suite.
// Loads each ./graph/*.test.ts module directly and collects its
// `end` message. Used when the main CI runner aborts on pre-existing
// flakes in other test files and we need a focused signal on just
// the graph work. Mirrors test/multi/runner.mjs.
//
// Usage:
//   (npx vite --port 4000 --strictPort &) && sleep 3
//   npx electron test/graph/runner.mjs

import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const HOST = 'http://localhost:4000';
const TIMEOUT_MS = 25000;

const TARGETS = [
    './graph/RenderGraph.test.ts',
    './graph/ForwardRendererJob.test.ts',
    './graph/ClusterLightingPass.test.ts',
    './graph/PreDepthPass.test.ts',
    './graph/ShadowPass.test.ts',
    './graph/PointShadowPass.test.ts',
    './graph/ReflectionPass.test.ts',
    './graph/GIPass.test.ts',
    './graph/ColorPass.test.ts',
    './graph/PostPass.test.ts',
    './graph/GUIPass.test.ts',
];

async function runOne(win, target) {
    const logs = [];
    const hookListener = (_e, level, msg) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        logs.push(`[${lv}] ${msg}`);
    };
    win.webContents.on('console-message', hookListener);

    await win.loadURL(HOST + '/test/');
    // The test menu registers each .test.ts as a clickable link; the
    // handler reads sessionStorage on click and injects the iframe.
    // We simulate the click programmatically so the menu's logic
    // runs in-place without forcing a page navigation — avoids the
    // ERR_FAILED race that comes from reloading out of executeJavaScript.
    await win.webContents.executeJavaScript(`
        (() => {
            window.__endResult = null;
            window.addEventListener('message', e => {
                if (e.data && e.data.type === 'end') window.__endResult = e.data;
            });
            const link = document.getElementById(${JSON.stringify(target)});
            if (!link) throw new Error('no link for ' + ${JSON.stringify(target)});
            link.click();
            return true;
        })();
    `);

    const deadline = Date.now() + TIMEOUT_MS;
    let result = null;
    while (!result && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
        try {
            result = await win.webContents.executeJavaScript('window.__endResult');
        } catch { /* iframe reloading */ }
    }
    await fs.writeFile(join(OUT, target.replace(/[./]/g, '_') + '.log'), logs.join('\n'), 'utf8');
    win.webContents.removeListener('console-message', hookListener);
    return { target, result };
}

async function main() {
    await app.whenReady();
    await fs.mkdir(OUT, { recursive: true });
    const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { sandbox: false } });
    const results = [];
    for (const t of TARGETS) {
        const r = await runOne(win, t);
        console.log(JSON.stringify(r));
        results.push(r);
    }
    const allPass = results.every(r => r.result && r.result.fail === 0);
    console.log(allPass ? '\x1b[32mGRAPH CI PASS\x1b[0m' : '\x1b[31mGRAPH CI FAIL\x1b[0m');
    win.destroy();
    process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
