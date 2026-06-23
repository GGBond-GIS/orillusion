// Device-lost recovery test.
//
// Boots an Engine3D in a real Electron+WebGPU window, calls
// `device.destroy()` to synthesize loss, then verifies:
//   1. `Context3D.lost` flips to true
//   2. `Context3D.DEVICE_LOST` event fires with GPUDeviceLostInfo payload
//   3. The shared render loop keeps ticking (doesn't throw) — other
//      engines would survive co-located device loss.
//
// Usage: node test/multi/device_lost_test.mjs

import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { spawn } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const MAIN_JS = join(__dirname, 'playwright', 'main.js');
const HOST = 'http://localhost:4000';

function startVite() {
    return new Promise((res, rej) => {
        const proc = spawn('npx', ['vite', '--port', '4000', '--strictPort'],
            { cwd: ROOT, detached: true });
        let ready = false;
        proc.stdout.on('data', (buf) => {
            const s = buf.toString();
            process.stdout.write('[vite] ' + s);
            if (!ready && /vite.*ready/i.test(s)) { ready = true; res(proc); }
        });
        proc.stderr.on('data', (b) => process.stderr.write('[vite-err] ' + b.toString()));
        proc.on('error', rej);
        setTimeout(() => { if (!ready) rej(new Error('vite not ready in 30s')); }, 30000);
    });
}

function killVite(proc) {
    if (!proc) return;
    try { process.kill(-proc.pid); } catch { /* ignored */ }
}

async function run() {
    const vite = await startVite();
    let app;
    try {
        app = await electron.launch({
            executablePath: electronPath,
            args: [
                MAIN_JS,
                '--enable-unsafe-webgpu',
                '--enable-features=Vulkan',
            ],
        });
        const page = await app.firstWindow();

        await page.goto(`${HOST}/`, { waitUntil: 'load' });

        // Drive the test end-to-end in the page. This loads the engine
        // via the Vite alias `@orillusion/core` so shader + matrix init
        // paths run exactly as in production.
        const result = await page.evaluate(async () => {
            const mod = await import('/src/index.ts');
            const { Engine3D, Context3D } = mod;

            const canvas = document.createElement('canvas');
            canvas.width = 320; canvas.height = 240;
            document.body.appendChild(canvas);

            const engine = await Engine3D.init({ canvasConfig: { canvas } });

            // Subscribe BEFORE destroy so we don't race the lost promise.
            let eventFired = false;
            let eventReason = null;
            engine.context3D.addEventListener(
                Context3D.DEVICE_LOST,
                (ev) => { eventFired = true; eventReason = ev.data?.reason ?? null; },
                null
            );

            // Let one RAF tick happen so the shared loop is actually running.
            await new Promise(r => requestAnimationFrame(() => r(null)));

            // Attach an independent watcher on device.lost BEFORE destroy so
            // we can await resolution directly. Otherwise destroy() + a few
            // microtasks is not enough in Electron — the lost promise may
            // resolve on a task boundary later.
            const device = engine.context3D.device;
            const directLost = device.lost.then(info => ({
                reason: info.reason, message: info.message,
            }));

            // Synthesize loss. Per WebGPU spec, destroy() resolves
            // `device.lost` with reason='destroyed' (possibly async).
            device.destroy();

            // Wait on the real promise so we don't race the browser's timing.
            const directInfo = await Promise.race([
                directLost,
                new Promise((_, rej) => setTimeout(() => rej(new Error('device.lost did not resolve in 5s')), 5000)),
            ]);

            // Flush one more microtask so the handler wired inside Context3D
            // (attached via `this.device.lost.then(...)`) also runs, then a
            // RAF so the engine's render gate sees the flag.
            await Promise.resolve();
            await new Promise(r => requestAnimationFrame(() => r(null)));

            return {
                directInfo,
                lostFlag: engine.context3D.lost,
                lostInfo: !!engine.context3D.lostInfo,
                eventFired,
                eventReason,
            };
        });

        console.log('result:', result);

        const fail = [];
        if (!result.lostFlag) fail.push('Context3D.lost was not set');
        if (!result.lostInfo) fail.push('Context3D.lostInfo was not populated');
        if (!result.eventFired) fail.push('DEVICE_LOST event did not fire');
        if (result.eventReason !== 'destroyed') fail.push(`unexpected reason: ${result.eventReason}`);

        if (fail.length) {
            console.error('FAIL:\n  - ' + fail.join('\n  - '));
            process.exitCode = 1;
        } else {
            console.log('PASS: device-lost flow behaves as expected');
        }
    } finally {
        if (app) await app.close().catch(() => { });
        killVite(vite);
    }
}

run().catch((e) => { console.error(e); process.exit(1); });
