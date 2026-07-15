// Stress probe for WBOIT live state transitions. Drives Sample_WBOIT
// through dense mode/material/alpha permutations, captures every
// console error/warning, and screenshots a sample of the transitions
// to inspect regressions later. Usage:
//   electron test/multi/_wboit_stress.mjs

import { app, BrowserWindow } from 'electron/main';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const HOST = 'http://localhost:4000';
const WAIT_BOOT_MS = 5500;
const WAIT_RENDER_MS = 250;
const WAIT_REBUILD_MS = 1200;
const SAMPLE = './alpha/Sample_WBOIT.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out', 'wboit_stress');

const MATERIALS = ['pbr', 'unlit', 'lambert'];
const MODES = ['weighted', 'sorted', 'hash'];
const ALPHAS_DENSE = [1.0, 0.5, 1.0, 0.0, 1.0, 0.99, 0.5, 0.1, 0.99, 1.0];

const errors = [];
const warnings = [];
const logs = [];
function log(level, line) {
    const s = `[${level}] ${line}`;
    logs.push(s);
    if (level === 'error') errors.push(s);
    else if (level === 'warning') warnings.push(s);
}

async function main() {
    await app.whenReady();
    await fs.mkdir(OUT, { recursive: true });

    const win = new BrowserWindow({
        width: 800, height: 600, show: false,
        webPreferences: { offscreen: false, sandbox: false },
    });
    win.webContents.on('console-message', (_e, level, msg) => {
        const lv = ['verbose', 'info', 'warning', 'error'][level] || 'log';
        log(lv, msg);
    });

    await win.loadURL(HOST + '/samples/');
    await win.webContents.executeJavaScript(`sessionStorage.setItem('target', '${SAMPLE}'); true`);
    await win.loadURL(HOST + '/samples/');
    await new Promise((r) => setTimeout(r, WAIT_BOOT_MS));

    const ready = await win.webContents.executeJavaScript(`
        (() => { const ifr = document.querySelector('iframe');
                 return !!(ifr && ifr.contentWindow && ifr.contentWindow.__wboit); })()
    `);
    if (!ready) {
        process.stderr.write('probe: __wboit hook not ready\n');
        for (const l of logs.slice(-30)) process.stdout.write(l + '\n');
        process.exit(2);
    }

    const driver = (script) =>
        win.webContents.executeJavaScript(`
            (async () => { const w = document.querySelector('iframe').contentWindow; ${script} })()
        `);

    const shoot = async (name) => {
        await new Promise((r) => setTimeout(r, WAIT_RENDER_MS));
        const png = await win.webContents.capturePage();
        const path = join(OUT, name + '.png');
        await fs.writeFile(path, png.toPNG());
        const size = (await fs.stat(path)).size;
        return size;
    };

    // Full Cartesian sweep — material × mode × alpha sequence, with each
    // axis flipped independently. Logs error count per transition so we
    // can correlate console errors to a specific (mat, mode, α) triple.
    const transitionLog = [];
    let transitionIdx = 0;

    const errorsAt = (label) => {
        const before = errors.length;
        return () => {
            const after = errors.length;
            if (after > before) {
                const newErrs = errors.slice(before);
                process.stdout.write(`!! ${label}: +${after - before} errors\n`);
                for (const e of newErrs.slice(0, 3)) process.stdout.write('   ' + e + '\n');
            }
            transitionLog.push({ label, errCount: after - before });
            return after - before;
        };
    };

    // 1) Material-axis stress: cycle through mat3 × mode3 with α=0.5 fixed,
    //    catch any "stale derived pass on rebuild" type bugs.
    process.stdout.write('=== Phase 1: material × mode at α=0.5 ===\n');
    for (let cycle = 0; cycle < 2; cycle++) {
        for (const mat of MATERIALS) {
            const finishMat = errorsAt(`p1_setMaterial(${mat})`);
            await driver(`w.__wboit.setMaterial('${mat}');`);
            await new Promise((r) => setTimeout(r, WAIT_REBUILD_MS));
            finishMat();

            for (const mode of MODES) {
                const finishMode = errorsAt(`p1_${mat}_setMode(${mode})`);
                await driver(`w.__wboit.setMode('${mode}'); w.__wboit.setAlpha(0.5);`);
                finishMode();

                if (transitionIdx % 5 === 0) {
                    const sz = await shoot(`p1_c${cycle}_${mat}_${mode}_a0.5`);
                    process.stdout.write(`  shot ${mat}/${mode}/0.5: ${sz}b\n`);
                } else {
                    await new Promise((r) => setTimeout(r, WAIT_RENDER_MS));
                }
                transitionIdx++;
            }
        }
    }

    // 2) Alpha sweep round-trip stress: per (mat, mode), drive
    //    OPAQUE↔BLEND boundary repeatedly to catch transient state bugs.
    process.stdout.write('=== Phase 2: alpha sweep across boundary ===\n');
    for (const mat of MATERIALS) {
        await driver(`w.__wboit.setMaterial('${mat}');`);
        await new Promise((r) => setTimeout(r, WAIT_REBUILD_MS));

        for (const mode of MODES) {
            await driver(`w.__wboit.setMode('${mode}');`);
            await new Promise((r) => setTimeout(r, WAIT_RENDER_MS));

            for (let i = 0; i < ALPHAS_DENSE.length; i++) {
                const a = ALPHAS_DENSE[i];
                const finish = errorsAt(`p2_${mat}_${mode}_α${a.toFixed(2)}`);
                await driver(`w.__wboit.setAlpha(${a});`);
                finish();
                if (i === 3 || i === 6) {
                    const sz = await shoot(`p2_${mat}_${mode}_step${i}_a${a.toFixed(2)}`);
                    if (sz < 50_000 && a > 0.001) {
                        process.stdout.write(`!! BLACK CANVAS at ${mat}/${mode}/α=${a}: ${sz}b\n`);
                    }
                } else {
                    await new Promise((r) => setTimeout(r, WAIT_RENDER_MS));
                }
                transitionIdx++;
            }
        }
    }

    // 2.5) Bare oitMode flip without alphaMode change — verifies the
    //      new Material.oitMode setter triggers castNeedPass on its
    //      own. Reaches into Sample_WBOIT's sphereMaterials array and
    //      sets oitMode directly, never touching alphaMode.
    process.stdout.write('=== Phase 2.5: bare oitMode flip ===\n');
    {
        // Drive into BLEND/sorted at α=0.5 first.
        await driver(`w.__wboit.setMaterial('pbr');`);
        await new Promise((r) => setTimeout(r, WAIT_REBUILD_MS));
        await driver(`w.__wboit.setMode('sorted'); w.__wboit.setAlpha(0.5);`);
        await new Promise((r) => setTimeout(r, WAIT_RENDER_MS));
        const baseline = await shoot('p2.5_pbr_sorted_baseline');
        process.stdout.write(`  baseline (sorted, α0.5): ${baseline}b\n`);

        // Now flip ONLY oitMode (not alphaMode) directly on each material.
        // alphaMode stays 'BLEND'. The new oitMode setter must trigger
        // castNeedPass to create the OIT_ACCUM pass.
        const flipResult = await driver(`
            const sample = w.__wboit_sample;
            if (!sample) return 'no-sample';
            let count = 0;
            for (const m of sample.sphereMaterials) {
                m.oitMode = 'weighted';
                count++;
            }
            return 'flipped ' + count;
        `);
        process.stdout.write(`  oitMode flip result: ${flipResult}\n`);
        await new Promise((r) => setTimeout(r, WAIT_RENDER_MS * 2));
        const switched = await shoot('p2.5_pbr_weighted_via_oitMode_alone');
        process.stdout.write(`  weighted (after bare oitMode flip): ${switched}b\n`);
        if (switched < 50_000) {
            process.stdout.write(`!! BLACK CANVAS — oitMode setter didn't trigger castNeedPass\n`);
        }
    }

    // 3) Mixed chaotic axes — flip mode, material, alpha all in quick
    //    succession to provoke ordering races.
    process.stdout.write('=== Phase 3: chaotic mixed axes ===\n');
    const seq = [
        { mat: 'pbr', mode: 'weighted', a: 1.0 },
        { mat: 'unlit', mode: 'sorted', a: 0.5 },
        { mat: 'lambert', mode: 'hash', a: 0.7 },
        { mat: 'pbr', mode: 'sorted', a: 1.0 },
        { mat: 'unlit', mode: 'weighted', a: 0.3 },
        { mat: 'lambert', mode: 'weighted', a: 1.0 },
        { mat: 'pbr', mode: 'hash', a: 0.5 },
        { mat: 'unlit', mode: 'hash', a: 1.0 },
        { mat: 'lambert', mode: 'sorted', a: 0.5 },
        { mat: 'pbr', mode: 'weighted', a: 0.0 },
        { mat: 'pbr', mode: 'weighted', a: 1.0 },
    ];
    for (let i = 0; i < seq.length; i++) {
        const { mat, mode, a } = seq[i];
        const finish = errorsAt(`p3_step${i}(${mat},${mode},${a})`);
        await driver(`
            w.__wboit.setMaterial('${mat}');
        `);
        await new Promise((r) => setTimeout(r, WAIT_REBUILD_MS));
        await driver(`
            w.__wboit.setMode('${mode}');
            w.__wboit.setAlpha(${a});
        `);
        finish();
        const sz = await shoot(`p3_step${i}_${mat}_${mode}_a${a.toFixed(2)}`);
        process.stdout.write(`  ${mat}/${mode}/α${a} → ${sz}b\n`);
        if (sz < 50_000 && a > 0.001) {
            process.stdout.write(`!! BLACK CANVAS at p3 step ${i}\n`);
        }
    }

    process.stdout.write('\n===== Summary =====\n');
    process.stdout.write(`total transitions: ${transitionIdx}\n`);
    process.stdout.write(`logs:${logs.length}  errors:${errors.length}  warnings:${warnings.length}\n`);

    const errCounts = {};
    for (const t of transitionLog) {
        if (t.errCount > 0) {
            errCounts[t.label] = t.errCount;
        }
    }
    if (Object.keys(errCounts).length > 0) {
        process.stdout.write('\nTransitions that produced errors:\n');
        for (const [label, count] of Object.entries(errCounts)) {
            process.stdout.write(`  ${label}: ${count}\n`);
        }
    }

    if (errors.length > 0) {
        process.stdout.write('\nFirst 30 errors:\n');
        for (const e of errors.slice(0, 30)) process.stdout.write(e + '\n');
    }
    if (warnings.length > 0) {
        process.stdout.write('\nFirst 20 unique warnings:\n');
        const seenW = new Set();
        for (const w of warnings) {
            if (seenW.has(w)) continue;
            seenW.add(w);
            process.stdout.write(w + '\n');
            if (seenW.size >= 20) break;
        }
    }

    process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
    process.stderr.write('probe exception: ' + (e.stack || e.message) + '\n');
    process.exit(2);
});
