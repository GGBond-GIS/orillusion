// 4-way OIT independence probe. Verifies all four modes
// (sorted / weighted / depth-peel / hash) produce visually distinct
// renders at every (material, alpha) combination, AND each mode shows
// alpha sensitivity. 36 cells (4 modes × 3 materials × 3 alphas).

import { app, BrowserWindow } from 'electron/main';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const HOST = 'http://localhost:4000';
const WAIT_BOOT_MS = 5500;
const WAIT_RENDER_MS = 600;
const SAMPLE = './alpha/Sample_WBOIT.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out', 'wboit_4way');

const ALPHAS = [1.0, 0.5, 0.0];
const MODES = ['sorted', 'weighted', 'depth-peel', 'hash'];
const MATERIALS = ['pbr', 'unlit', 'lambert'];

const errors = [];
const logs = [];
function log(level, line) {
    const s = `[${level}] ${line}`;
    logs.push(s);
    if (level === 'error') errors.push(s);
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

    const driver = (script) =>
        win.webContents.executeJavaScript(`
            (async () => { const w = document.querySelector('iframe').contentWindow; ${script} })()
        `);

    const shoot = async (name) => {
        await new Promise((r) => setTimeout(r, WAIT_RENDER_MS));
        const png = await win.webContents.capturePage();
        const buf = png.toPNG();
        const path = join(OUT, name + '.png');
        await fs.writeFile(path, buf);
        const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16);
        return { size: buf.length, hash };
    };

    process.stdout.write('=== Mode independence at fixed (material, alpha) ===\n');
    let collisions = 0;
    for (const mat of MATERIALS) {
        await driver(`w.__wboit.setMaterial('${mat}');`);
        await new Promise((r) => setTimeout(r, 1500));

        for (const alpha of ALPHAS) {
            const group = [];
            for (const mode of MODES) {
                await driver(`w.__wboit.setMode('${mode}'); w.__wboit.setAlpha(${alpha});`);
                const { size, hash } = await shoot(`${mat}_a${alpha.toFixed(2)}_${mode}`);
                group.push({ mode, size, hash });
                process.stdout.write(`  ${mat}/α=${alpha}/${mode}: ${size}b hash=${hash}\n`);
            }
            // At α=0 every mode looks like an empty canvas (32414b) —
            // that's expected, not a collision.
            if (alpha > 0.001) {
                for (let i = 0; i < group.length; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        if (group[i].hash === group[j].hash) {
                            collisions++;
                            process.stdout.write(`  !! COLLISION: ${mat}/α=${alpha}: ${group[i].mode} == ${group[j].mode}\n`);
                        }
                    }
                }
            }
        }
    }

    process.stdout.write('\n=== Alpha independence at fixed (material, mode) ===\n');
    let alphaFails = 0;
    for (const mat of MATERIALS) {
        await driver(`w.__wboit.setMaterial('${mat}');`);
        await new Promise((r) => setTimeout(r, 1500));

        for (const mode of MODES) {
            const group = [];
            for (const alpha of [1.0, 0.7, 0.3]) {
                await driver(`w.__wboit.setMode('${mode}'); w.__wboit.setAlpha(${alpha});`);
                const { size, hash } = await shoot(`alpha_${mat}_${mode}_a${alpha.toFixed(2)}`);
                group.push({ alpha, size, hash });
            }
            const distinct = new Set(group.map((g) => g.hash)).size;
            const tag = distinct === group.length ? 'OK' : '!!';
            if (distinct !== group.length) alphaFails++;
            process.stdout.write(`  ${tag} ${mat}/${mode}: ${distinct}/${group.length} distinct\n`);
        }
    }

    process.stdout.write('\n===== Summary =====\n');
    process.stdout.write(`mode collisions (α>0): ${collisions}\n`);
    process.stdout.write(`alpha-insensitive cells: ${alphaFails}\n`);
    process.stdout.write(`logs:${logs.length}  errors:${errors.length}\n`);
    if (errors.length > 0) {
        process.stdout.write('\nFirst 10 errors:\n');
        for (const e of errors.slice(0, 10)) process.stdout.write(e + '\n');
    }

    process.exit((errors.length || collisions || alphaFails) ? 1 : 0);
}

main().catch((e) => {
    process.stderr.write('probe exception: ' + (e.stack || e.message) + '\n');
    process.exit(2);
});
