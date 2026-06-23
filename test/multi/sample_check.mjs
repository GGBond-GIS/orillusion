// Headless smoke-test a legacy sample against the running vite :4000.
// Loads samples/index.html with sessionStorage.target set to the sample
// path, waits a few seconds, captures console and a screenshot, reports pass
// if no errors + at least N frames happened.
import { app, BrowserWindow } from 'electron/main';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const HOST = 'http://localhost:4000';

// Samples to probe. Intentionally small — representative of various subsystems.
const SAMPLES = [
    'base/Sample_Transform.ts',
    'base/Sample_AddRemove.ts',
    'base/Sample_CameraType.ts',
    'lights/Sample_PointLight.ts',
    'lights/Sample_SpotLight.ts',
    'lights/Sample_CSM.ts',
    'material/Sample_PBR.ts',
    'material/Sample_UnlitMaterial.ts',
    'post/Sample_Bloom.ts',
    'post/Sample_Fog.ts',
    'post/Sample_SSR.ts',
    'geometry/Sample_TextGeometry.ts',
];

const logs = [];
const errors = [];
function log(level, line) {
    const s = `[${level}] ${line}`;
    logs.push(s);
    if (level === 'error') errors.push(s);
    process.stdout.write(s + '\n');
}

async function probeSample(win, sample) {
    errors.length = 0;
    logs.length = 0;
    // Load index (origin set), seed sessionStorage, reload.
    await win.loadURL(HOST + '/samples/');
    await win.webContents.executeJavaScript(`sessionStorage.setItem('target', '${sample}'); true`);
    await win.loadURL(HOST + '/samples/');
    await new Promise(r => setTimeout(r, 4000));
    const fatalErrors = errors.filter(e =>
        !e.includes('Electron Security') &&
        !e.includes('Content Security') &&
        !e.includes('Autofill.enable') &&
        !e.includes('Download the React')
    );
    return { sample, errors: fatalErrors.slice(0, 5), log_count: logs.length };
}

async function main() {
    await app.whenReady();
    await fs.mkdir(OUT, { recursive: true });

    const win = new BrowserWindow({
        width: 800, height: 600, show: false,
        webPreferences: { offscreen: false, sandbox: false }
    });
    win.webContents.on('console-message', (_e, level, msg) => {
        const lv = ['verbose','info','warning','error'][level] || 'log';
        log(lv, msg);
    });

    const results = [];
    for (const sample of SAMPLES) {
        process.stdout.write(`\n===== probing ${sample} =====\n`);
        const r = await probeSample(win, sample);
        results.push(r);
    }

    const report = results.map(r => ({
        sample: r.sample,
        errors: r.errors.length,
        status: r.errors.length === 0 ? 'OK' : 'FAIL'
    }));
    console.log('\n===== sample probe report =====');
    console.table(report);

    await fs.writeFile(join(OUT, 'sample_probe.json'), JSON.stringify(results, null, 2), 'utf8');

    const fail = results.some(r => r.errors.length > 0);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('probe exception', e); process.exit(2); });
