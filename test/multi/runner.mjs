// Electron runner for the multi-instance test.
// Loads http://localhost:4000/test/multi/ and captures every console
// line from the renderer. Writes logs + screenshots to ./_out/.

import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const URL_ = 'http://localhost:4000/test/multi/';
const TIMEOUT_MS = 20000;

const logs = [];

function captureLog(level, line) {
    const ts = new Date().toISOString().substring(11, 23);
    const s = `[${ts}] [${level}] ${line}`;
    logs.push(s);
    // mirror to stdout in real time so the parent script sees progress
    process.stdout.write(s + '\n');
}

async function writeAll() {
    await fs.mkdir(OUT, { recursive: true });
    await fs.writeFile(join(OUT, 'console.log'), logs.join('\n'), 'utf8');
}

async function main() {
    await app.whenReady();

    const win = new BrowserWindow({
        width: 800,
        height: 700,
        show: false,
        webPreferences: {
            offscreen: false,
            sandbox: false,
        }
    });

    win.webContents.on('console-message', (_e, level, message, line, source) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        captureLog(lv, `${message}  (${source}:${line})`);
    });

    win.webContents.on('render-process-gone', (_e, details) => {
        captureLog('error', `render-process-gone: ${JSON.stringify(details)}`);
    });

    win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
        captureLog('error', `did-fail-load: ${errorCode} ${errorDescription} ${validatedURL}`);
    });

    // listen for the test harness's `end` message via IPC-style script injection
    let ended = false;
    let endResult = null;

    await win.loadURL(URL_);

    // Inject a listener that reads window.postMessage from util.ts end()
    await win.webContents.executeJavaScript(`
        new Promise((res, rej) => {
            window.__endPromise = new Promise((r) => {
                window.addEventListener('message', (e) => {
                    if (e.data && e.data.type === 'end') {
                        window.__endResult = e.data;
                        r(e.data);
                    }
                });
            });
            res(true);
        });
    `);

    // Wait for completion or timeout.
    const start = Date.now();
    while (!ended && Date.now() - start < TIMEOUT_MS) {
        await new Promise(r => setTimeout(r, 300));
        try {
            endResult = await win.webContents.executeJavaScript('window.__endResult || null');
        } catch { /* ignored */ }
        if (endResult) { ended = true; break; }
    }

    // Dump scene state one more time for inspection.
    try {
        const dom = await win.webContents.executeJavaScript(`
            (function() {
                const logEl = document.getElementById('log');
                return logEl ? logEl.textContent : '(no #log)';
            })();
        `);
        captureLog('info', '--- on-page log panel begin ---');
        for (const line of String(dom).split('\n')) captureLog('info', line);
        captureLog('info', '--- on-page log panel end ---');
    } catch (e) {
        captureLog('error', 'dom dump failed: ' + e.message);
    }

    // screenshots
    try {
        const png = await win.webContents.capturePage();
        await fs.mkdir(OUT, { recursive: true });
        await fs.writeFile(join(OUT, 'screenshot.png'), png.toPNG());
        captureLog('info', `screenshot saved: ${join(OUT, 'screenshot.png')}`);
    } catch (e) {
        captureLog('error', 'screenshot failed: ' + e.message);
    }

    if (!ended) {
        captureLog('error', `TIMEOUT after ${TIMEOUT_MS} ms`);
    } else {
        captureLog('info', `end event received: ${JSON.stringify(endResult)}`);
    }

    await writeAll();

    const pass = ended && endResult && endResult.fail === 0;
    process.exit(pass ? 0 : 1);
}

main().catch(async (e) => {
    captureLog('error', 'runner exception: ' + (e.stack || e.message));
    await writeAll();
    process.exit(2);
});
