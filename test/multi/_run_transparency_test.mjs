// Quick one-off runner for the Transparency.test.ts unit test.
// Loads http://localhost:4000/test/, sets sessionStorage.target to
// our test file, reloads, captures console + the on-page postMessage
// 'end' event from util.ts.
import { app, BrowserWindow } from 'electron/main';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const HOST = 'http://localhost:4000';
const TARGET = './graph/Transparency.test.ts';

const logs = [];
const errors = [];
function log(level, line) {
    const s = `[${level}] ${line}`;
    logs.push(s);
    if (level === 'error') errors.push(s);
}

let endResult = null;
async function main() {
    await app.whenReady();
    const win = new BrowserWindow({
        width: 800, height: 600, show: false,
        webPreferences: { offscreen: false, sandbox: false },
    });
    win.webContents.on('console-message', (_e, level, msg) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        log(lv, msg);
    });

    await win.loadURL(HOST + '/test/');
    await win.webContents.executeJavaScript(`sessionStorage.setItem('target', '${TARGET}'); true`);
    await win.loadURL(HOST + '/test/');
    // Listener has to be injected AFTER the second load — the first
    // loadURL navigates the page (clearing any prior script state) so
    // anything we inject before the navigation is wiped. The page
    // hosting the iframe is the recipient of the iframe's
    // `window.parent.postMessage('end', ...)` from util.ts.
    await win.webContents.executeJavaScript(`
        window.__transparency_end__ = null;
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'end') window.__transparency_end__ = e.data;
        });
        true
    `);

    // Poll for the end event up to 20s.
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const r = await win.webContents.executeJavaScript(`window.__transparency_end__`).catch(() => null);
        if (r) { endResult = r; break; }
        await new Promise(r => setTimeout(r, 200));
    }

    process.stdout.write(`===== ${TARGET} =====\n`);
    process.stdout.write(`logs: ${logs.length}   errors: ${errors.length}\n`);
    if (endResult) {
        process.stdout.write(`end: success=${endResult.success}  fail=${endResult.fail}\n`);
    } else {
        process.stdout.write(`end: timed out — no postMessage('end') received\n`);
    }
    for (const e of errors.filter(e =>
        !e.includes('Electron Security') && !e.includes('Content Security') && !e.includes('Autofill') &&
        !e.includes('DevTools')
    )) {
        process.stdout.write(e + '\n');
    }
    app.quit();
    process.exit(endResult && endResult.fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
