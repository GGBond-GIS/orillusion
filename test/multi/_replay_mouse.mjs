// Replay a recorded mouse trace against Sample_AnimationIK and capture
// periodic screenshots. Usage:
//   npx electron test/multi/_replay_mouse.mjs <trace.json> [outDir]
//
// The trace JSON is the format produced by the mouse-trace-recorder skill:
//   { recordedAt, durationMs, sampleCount, samples: [{t, x, y}] }
//
// Replay strategy: read the trace inside the page, drop a pointerdown on
// the canvas, then dispatch pointermove events at the recorded
// timestamps so HoverCameraController orbits exactly as it did during
// recording. Screenshots are captured every SHOT_INTERVAL_MS along the
// way and dumped to _out/replay/.

import { app, BrowserWindow } from 'electron/main';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const HOST = 'http://localhost:4000';
const SAMPLE = './animation/Sample_AnimationIK.ts';
const SHOT_INTERVAL_MS = 1500;
const FAST = 1; // playback speed multiplier (1=realtime, 4=4× faster)

// argv layout under electron: [electron, scriptPath, ...userArgs]
const userArgs = process.argv.slice(2);
const tracePath = userArgs.find((a) => a.endsWith('.json'));
if (!tracePath) {
    process.stderr.write('usage: electron _replay_mouse.mjs <trace.json> [outDir]\n');
    process.exit(2);
}
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = userArgs.find((a) => !a.endsWith('.json')) || join(__dirname, '_out/replay');

async function main() {
    const traceJson = JSON.parse(await fs.readFile(tracePath, 'utf8'));
    process.stdout.write(`[replay] trace: ${traceJson.sampleCount} samples / ${traceJson.durationMs}ms\n`);
    await fs.mkdir(OUT_DIR, { recursive: true });

    await app.whenReady();
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        show: false,
        webPreferences: { offscreen: false, sandbox: false },
    });
    win.webContents.on('console-message', (_e, level, msg) => {
        if (level >= 2) process.stderr.write(`[page ${level}] ${msg}\n`);
    });

    await win.loadURL(HOST + '/samples/');
    await win.webContents.executeJavaScript(
        `sessionStorage.setItem('target', '${SAMPLE}'); true;`
    );
    await win.loadURL(HOST + '/samples/');
    process.stdout.write(`[replay] sample loaded; warm-up wait\n`);
    await new Promise((r) => setTimeout(r, 6000));

    // Drive the HoverCameraController directly using trace deltas. The
    // sample exposes its instance on `window.__sample` (set in
    // initScene). HoverCameraController has public roll (yaw degrees)
    // and pitch (degrees); pointer drag in the original recording
    // updated them via `dragSmooth * deltaX` / `dragSmooth * deltaY`,
    // so apply the same delta-pixels → degrees mapping that the input
    // path uses (default coefficient ≈ 0.1°/px is good enough for a
    // fly-through). Synthetic PointerEvents won't trigger HoverCamera
    // because `canvas.setPointerCapture` rejects synthetic pointerIds,
    // hence this direct approach.
    await win.webContents.executeJavaScript(`
        (() => {
            const trace = ${JSON.stringify(traceJson.samples)};
            const fast = ${FAST};
            const findSample = () => {
                if (window.__sample) return window.__sample;
                for (const f of document.querySelectorAll('iframe')) {
                    try { if (f.contentWindow.__sample) return f.contentWindow.__sample; } catch (e) {}
                }
                return null;
            };
            const sample = findSample();
            if (!sample || !sample.cameraCtrl) {
                console.error('[replay] window.__sample.cameraCtrl not ready');
                return;
            }
            const ctrl = sample.cameraCtrl;
            console.log('[replay] driving cameraCtrl: start roll=' + ctrl.roll + ' pitch=' + ctrl.pitch);

            const ROLL_PER_PX = -0.25;   // Yaw degrees per pixel of dx
            const PITCH_PER_PX = -0.25;  // Pitch degrees per pixel of dy
            const startRoll = ctrl.roll;
            const startPitch = ctrl.pitch;
            const x0 = trace[0].x;
            const y0 = trace[0].y;
            const tBase = trace[0].t;

            for (const s of trace) {
                const delay = (s.t - tBase) / fast;
                setTimeout(() => {
                    ctrl.roll = startRoll + (s.x - x0) * ROLL_PER_PX;
                    ctrl.pitch = startPitch + (s.y - y0) * PITCH_PER_PX;
                }, delay);
            }
            const last = trace[trace.length - 1];
            window.__replayTotalDelay = (last.t - tBase) / fast;
        })();
        true;
    `);

    const totalDelay = await win.webContents.executeJavaScript('window.__replayTotalDelay || 10000');
    process.stdout.write(`[replay] dispatching trace, total ~${(totalDelay / 1000).toFixed(1)}s\n`);

    // Take screenshots throughout the playback.
    let shotIdx = 0;
    const startTs = Date.now();
    const endTs = startTs + totalDelay + 300;
    while (Date.now() < endTs) {
        await new Promise((r) => setTimeout(r, SHOT_INTERVAL_MS));
        try {
            const png = await win.webContents.capturePage();
            const path = join(OUT_DIR, `frame_${String(shotIdx).padStart(3, '0')}.png`);
            await fs.writeFile(path, png.toPNG());
            process.stdout.write(`[shot ${shotIdx}] elapsed=${((Date.now() - startTs) / 1000).toFixed(1)}s -> ${path}\n`);
            shotIdx++;
        } catch (e) {
            process.stderr.write('[shot] capture failed: ' + e.message + '\n');
        }
    }

    process.stdout.write(`[replay] done — ${shotIdx} screenshots in ${OUT_DIR}\n`);
    process.exit(0);
}

main().catch((e) => {
    process.stderr.write('replay exception: ' + (e.stack || e.message) + '\n');
    process.exit(2);
});
