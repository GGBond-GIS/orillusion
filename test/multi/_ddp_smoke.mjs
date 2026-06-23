// Stage 1 smoke: load Sample_WBOIT, then directly set `oitMode='depth-peel'`
// on every sphere material via the __wboit_sample hook. The new oitMode
// value should not crash the engine; depth-peel materials currently fall
// through to the sorted path because no derived passes exist yet (stage
// 2/3 will fill them in).

import { app, BrowserWindow } from 'electron/main';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const HOST = 'http://localhost:4000';
const SAMPLE = './alpha/Sample_WBOIT.ts';

const errors = [];
function log(level, line) {
    if (level === 'error') errors.push(line);
}

async function main() {
    await app.whenReady();
    const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { offscreen: false, sandbox: false } });
    win.webContents.on('console-message', (_e, level, msg) => log(['verbose','info','warning','error'][level] || 'log', msg));

    await win.loadURL(HOST + '/samples/');
    await win.webContents.executeJavaScript(`sessionStorage.setItem('target', '${SAMPLE}'); true`);
    await win.loadURL(HOST + '/samples/');
    await new Promise(r => setTimeout(r, 5500));

    const before = errors.length;
    const result = await win.webContents.executeJavaScript(`
        (async () => {
            const w = document.querySelector('iframe').contentWindow;
            const sample = w.__wboit_sample;
            if (!sample) return 'no-sample-hook';
            let count = 0;
            for (const m of sample.sphereMaterials) {
                m.oitMode = 'depth-peel';
                count++;
            }
            // Sleep one frame so castNeedPass / createDepthPeelPasses
            // had a chance to run.
            await new Promise(r => requestAnimationFrame(r));
            // Inspect first material's shader for the three derived passes.
            const mat0 = sample.sphereMaterials[0];
            const passShader = mat0.shader.passShader;
            const passTypes = [];
            for (const [k, v] of passShader) {
                passTypes.push({ type: k, count: v.length });
            }
            return JSON.stringify({ flipped: count, passTypes });
        })()
    `);
    await new Promise(r => setTimeout(r, 800));
    const after = errors.length;

    process.stdout.write(`result: ${JSON.stringify(result)}\n`);
    process.stdout.write(`total logs: ${errors.length}\n`);
    process.stdout.write(`new errors: ${after - before}\n`);
    if (after > before) {
        for (const e of errors.slice(before)) process.stdout.write('  ' + e + '\n');
    }
    process.exit(after - before === 0 ? 0 : 1);
}

main().catch(e => { process.stderr.write('CAUGHT: ' + (e.stack || e.message || String(e)) + '\n'); process.exit(2); });
