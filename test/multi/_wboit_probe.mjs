// Drives Sample_WBOIT through alpha + mode permutations to verify the
// α=1 → OPAQUE / α<1 → BLEND round-trip actually renders correctly in
// both directions. Captures one screenshot per (mode, material, alpha)
// triple into test/multi/_out/wboit_round_trip/.
//
// Usage:
//   electron test/multi/_wboit_probe.mjs
//
// This probe is intentional, scoped, and disposable — when the WBOIT
// work is done, both this script and the __wboit hook in
// samples/alpha/Sample_WBOIT.ts can be removed.

import { app, BrowserWindow } from 'electron/main';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const HOST = 'http://localhost:4000';
const WAIT_BOOT_MS = 5500;
const WAIT_RENDER_MS = 800;
const SAMPLE = './alpha/Sample_WBOIT.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out', 'wboit_round_trip');

// Keep the matrix small but covering: each material type × each mode ×
// the round-trip critical alpha values (1 → 0.5 → 1 → 0.5 catches the
// OPAQUE→BLEND→OPAQUE→BLEND transition that earlier black-canvased).
const MATERIALS = ['pbr', 'unlit', 'lambert'];
const MODES = ['weighted', 'sorted'];
const ALPHA_SEQUENCE = [1.0, 0.5, 1.0, 0.99, 0.0, 0.5, 1.0];

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
        width: 800,
        height: 600,
        show: false,
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

    // Wait for the iframe's __wboit hook to be live.
    const ready = await win.webContents.executeJavaScript(`
        (() => {
            const ifr = document.querySelector('iframe');
            return !!(ifr && ifr.contentWindow && ifr.contentWindow.__wboit);
        })()
    `);
    if (!ready) {
        process.stderr.write('probe: __wboit hook not ready in iframe\n');
        // Dump a few logs so we can see what happened.
        for (const l of logs.slice(-50)) process.stdout.write(l + '\n');
        process.exit(2);
    }

    const driver = async (script) => {
        return win.webContents.executeJavaScript(`
            (async () => {
                const w = document.querySelector('iframe').contentWindow;
                ${script}
            })()
        `);
    };

    const shoot = async (name) => {
        await new Promise((r) => setTimeout(r, WAIT_RENDER_MS));
        const png = await win.webContents.capturePage();
        const path = join(OUT, name + '.png');
        await fs.writeFile(path, png.toPNG());
        const size = (await fs.stat(path)).size;
        process.stdout.write(`captured ${name}.png (${size} bytes)\n`);
        return size;
    };

    // Track image sizes — the chrome-only "no scene" baseline is ~36 KB,
    // any actual render is 100+ KB. Used as a quick sanity check.
    const sizes = {};

    for (const mat of MATERIALS) {
        await driver(`w.__wboit.setMaterial('${mat}');`);
        await new Promise((r) => setTimeout(r, 1500));   // material rebuild

        for (const mode of MODES) {
            await driver(`w.__wboit.setMode('${mode}');`);

            for (let i = 0; i < ALPHA_SEQUENCE.length; i++) {
                const a = ALPHA_SEQUENCE[i];
                await driver(`w.__wboit.setAlpha(${a});`);
                const tag = `${mat}_${mode}_step${i}_a${a.toFixed(2)}`;
                sizes[tag] = await shoot(tag);
            }
        }
    }

    process.stdout.write('\n===== Summary =====\n');
    for (const [tag, size] of Object.entries(sizes)) {
        const status = size < 50_000 ? 'BLACK?' : 'render';
        process.stdout.write(`${status} ${tag}: ${size} bytes\n`);
    }

    const fatals = errors.filter(
        (e) =>
            !e.includes('Electron Security') &&
            !e.includes('Content Security') &&
            !e.includes('Autofill') &&
            !e.includes('DevTools'),
    );
    process.stdout.write(`\nlogs:${logs.length}  errors:${fatals.length}\n`);
    for (const e of fatals.slice(0, 30)) process.stdout.write(e + '\n');

    process.exit(fatals.length ? 1 : 0);
}

main().catch((e) => {
    process.stderr.write('probe exception: ' + (e.stack || e.message) + '\n');
    process.exit(2);
});
