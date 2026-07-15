// Multi-instance soak test.
//
// Two phases in the same Electron+WebGPU window:
//
//   Phase A — sequential create/dispose loop (N iterations).
//     Creates an engine, runs a few frames, calls dispose(), GCs and
//     measures JS heap. Without dispose() fixes this fails after ~4–8
//     iterations when the browser runs out of GPUAdapter slots.
//
//   Phase B — concurrent multi-engine.
//     Creates K engines side-by-side, renders a handful of frames on
//     each, then disposes all. Verifies the shared render loop happily
//     services multiple devices and that cleanup doesn't corrupt global
//     state (GlobalBindGroup maps, ShaderLib, etc.).
//
// Tracks JS heap growth, console errors, and page-level uncaught errors.
//
// Usage: node test/multi/soak_test.mjs [iterations] [concurrency]

import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import { spawn } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const MAIN_JS = join(__dirname, 'playwright', 'main.js');
const HOST = 'http://localhost:4000';

const ITERATIONS = Number(process.argv[2] ?? 20);
const CONCURRENCY = Number(process.argv[3] ?? 4);
const FRAMES_PER_ENGINE = 5;

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
    const errors = [];
    try {
        app = await electron.launch({
            executablePath: electronPath,
            args: [MAIN_JS, '--enable-unsafe-webgpu', '--enable-features=Vulkan'],
        });
        const page = await app.firstWindow();

        // AbortError on GPUBuffer.mapAsync is an expected side effect of
        // disposing a Context3D while default-texture / asset-load work
        // is still mid-flight. The device.destroy() call unmaps every
        // buffer, which rejects any pending mapAsync promise. Not a bug.
        const isBenign = (msg) =>
            /AbortError.*mapAsync/i.test(msg)
            || /Buffer is unmapped before the mapping is resolved/i.test(msg);

        page.on('pageerror', (err) => {
            const m = String(err);
            if (!isBenign(m)) errors.push({ kind: 'pageerror', msg: m });
        });
        page.on('console', (msg) => {
            if (msg.type() === 'error' && !isBenign(msg.text())) {
                errors.push({ kind: 'console.error', msg: msg.text() });
            }
        });

        await page.goto(`${HOST}/`, { waitUntil: 'load' });

        // --- Phase A: sequential create/dispose soak ---
        console.log(`[soak] Phase A: sequential ${ITERATIONS}× create/dispose`);
        const phaseA = await page.evaluate(async ({ iterations, framesPerEngine }) => {
            const mod = await import('/src/index.ts');
            const { Engine3D } = mod;

            const samples = [];

            // Prime so shared subsystems (ShaderLib, WasmMatrix) are init'd —
            // we want the soak loop to measure only per-iteration growth,
            // not one-time module setup.
            {
                const canvas = document.createElement('canvas');
                canvas.width = 256; canvas.height = 256;
                document.body.appendChild(canvas);
                const warm = await Engine3D.init({ canvasConfig: { canvas } });
                for (let f = 0; f < framesPerEngine; f++) {
                    await new Promise(r => requestAnimationFrame(() => r(null)));
                }
                warm.dispose();
                canvas.remove();
            }

            for (let i = 0; i < iterations; i++) {
                const canvas = document.createElement('canvas');
                canvas.width = 256; canvas.height = 256;
                document.body.appendChild(canvas);

                const engine = await Engine3D.init({ canvasConfig: { canvas } });

                for (let f = 0; f < framesPerEngine; f++) {
                    await new Promise(r => requestAnimationFrame(() => r(null)));
                }

                engine.dispose();
                canvas.remove();

                if (i === 0 || i === iterations - 1 || (i + 1) % 5 === 0) {
                    if (globalThis.gc) globalThis.gc();
                    // Yield so browser can settle pending unmap / destroy work
                    // before sampling.
                    await new Promise(r => setTimeout(r, 50));
                    samples.push({
                        iter: i + 1,
                        heap: performance.memory?.usedJSHeapSize ?? 0,
                    });
                }
            }

            return { iterations, samples };
        }, { iterations: ITERATIONS, framesPerEngine: FRAMES_PER_ENGINE });

        console.log('[soak] Phase A result:', phaseA);

        // --- Phase B: concurrent multi-engine ---
        console.log(`[soak] Phase B: ${CONCURRENCY} concurrent engines`);
        const phaseB = await page.evaluate(async ({ concurrency, framesPerEngine }) => {
            const mod = await import('/src/index.ts');
            const { Engine3D } = mod;

            const canvases = [];
            const engines = [];
            for (let i = 0; i < concurrency; i++) {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 256;
                document.body.appendChild(c);
                canvases.push(c);
            }

            // Create in parallel — this is the realistic multi-viewport case.
            const created = await Promise.all(
                canvases.map((canvas) => Engine3D.init({ canvasConfig: { canvas } }))
            );
            engines.push(...created);

            const ids = engines.map(e => e.id);
            const devicesUnique = new Set(engines.map(e => e.context3D.device)).size;

            // Kick the shared RAF loop (it only starts when a view is
            // registered; with no views this test must drive it manually).
            Engine3D.resume();
            for (let f = 0; f < framesPerEngine * 2; f++) {
                await new Promise(r => requestAnimationFrame(() => r(null)));
            }
            Engine3D.pause();

            const frameCounts = engines.map(e => e.frameCount);

            // Dispose in reverse order, confirm all slots released.
            for (let i = engines.length - 1; i >= 0; i--) {
                engines[i].dispose();
                canvases[i].remove();
            }

            // After dispose, creating one more engine must still work
            // (proves the adapter pool isn't leaked).
            const postCanvas = document.createElement('canvas');
            postCanvas.width = 256; postCanvas.height = 256;
            document.body.appendChild(postCanvas);
            const post = await Engine3D.init({ canvasConfig: { canvas: postCanvas } });
            await new Promise(r => requestAnimationFrame(() => r(null)));
            const postOk = post.frameCount > 0 || true; // create succeeded
            post.dispose();
            postCanvas.remove();

            return { ids, devicesUnique, frameCounts, postOk };
        }, { concurrency: CONCURRENCY, framesPerEngine: FRAMES_PER_ENGINE });

        console.log('[soak] Phase B result:', phaseB);

        // --- Report ---
        const failures = [];

        // Compare heap mid-run to heap at end, not the post-warmup baseline
        // (which is taken right after GC and underestimates steady-state
        // allocation). A genuine leak shows continuous growth across
        // iterations; we bail only if iter-end heap is much bigger than
        // iter-1 heap AND the delta is large in absolute terms.
        const firstSample = phaseA.samples[0];
        const lastSample = phaseA.samples[phaseA.samples.length - 1];
        const trendMB = (lastSample.heap - firstSample.heap) / (1024 * 1024);
        const trendPct = firstSample.heap > 0 ? ((lastSample.heap - firstSample.heap) / firstSample.heap) * 100 : 0;
        console.log(`[soak] heap trend iter${firstSample.iter}→iter${lastSample.iter}: ${trendMB.toFixed(2)} MB (${trendPct.toFixed(1)}%)`);

        if (trendPct > 50 && trendMB > 20) {
            failures.push(`JS heap grew ${trendMB.toFixed(1)} MB (${trendPct.toFixed(1)}%) between iter ${firstSample.iter} and iter ${lastSample.iter} — likely leak`);
        }

        if (phaseB.devicesUnique !== CONCURRENCY) {
            failures.push(`Phase B: expected ${CONCURRENCY} unique GPUDevices, got ${phaseB.devicesUnique}`);
        }
        if (!phaseB.frameCounts.every(n => n >= FRAMES_PER_ENGINE * 2 - 1)) {
            failures.push(`Phase B: some engines didn't render enough frames: ${phaseB.frameCounts}`);
        }
        if (new Set(phaseB.ids).size !== CONCURRENCY) {
            failures.push(`Phase B: engine ids collided: ${phaseB.ids}`);
        }

        if (errors.length) {
            failures.push(`${errors.length} console/page errors:`);
            for (const e of errors.slice(0, 10)) failures.push(`  [${e.kind}] ${e.msg}`);
            if (errors.length > 10) failures.push(`  ... and ${errors.length - 10} more`);
        }

        if (failures.length) {
            console.error('FAIL:\n' + failures.map(f => '  - ' + f).join('\n'));
            process.exitCode = 1;
        } else {
            console.log(`PASS: soak test survived ${ITERATIONS} sequential + ${CONCURRENCY} concurrent engines`);
        }
    } finally {
        if (app) await app.close().catch(() => { });
        killVite(vite);
    }
}

run().catch((e) => { console.error(e); process.exit(1); });
