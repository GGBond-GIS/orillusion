// Attach to an already-running Chrome (started with _chrome_shot.mjs
// SHOT_KEEP_ALIVE=1), reload the page, blit the WebGPU canvas, save PNG.
//
// Usage: PORT=9231 SAMPLE=post/Sample_SSR.ts node test/multi/_chrome_attach_shot.mjs [out_name]

import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '_out');
const PORT = Number(process.env.PORT || 9231);
const NAME = process.argv[2] || 'attach_shot';

async function fetchJson(url) { return (await fetch(url)).json(); }

class CDP {
    constructor(ws) {
        this.ws = ws; this.id = 0; this.pending = new Map(); this.eventListeners = new Set();
        ws.addEventListener('message', (e) => {
            const msg = JSON.parse(e.data);
            if (msg.id != null && this.pending.has(msg.id)) {
                const { res, rej } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) rej(new Error(msg.error.message));
                else res(msg.result);
            } else if (msg.method) {
                for (const fn of this.eventListeners) fn(msg);
            }
        });
    }
    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((res, rej) => {
            this.pending.set(id, { res, rej });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    onEvent(fn) { this.eventListeners.add(fn); return () => this.eventListeners.delete(fn); }
}

function waitFor(cdp, method, ms) {
    return new Promise((res, rej) => {
        const to = setTimeout(() => { off(); rej(new Error('timeout: ' + method)); }, ms);
        const off = cdp.onEvent((m) => { if (m.method === method) { clearTimeout(to); off(); res(m.params); } });
    });
}

async function main() {
    await fs.mkdir(OUT, { recursive: true });
    const tabs = await fetchJson(`http://localhost:${PORT}/json`);
    const tab = tabs.find(t => t.type === 'page') || tabs[0];
    if (!tab) throw new Error('no page tab found on port ' + PORT);

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const cdp = new CDP(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Re-seed sessionStorage in case the page was navigated away or the
    // target was cleared; required for the index.html sample selector
    // to inject the iframe with our sample on next load.
    const SAMPLE = process.env.SAMPLE || 'post/Sample_SSR.ts';
    const seed = `(() => { sessionStorage.setItem('target', './${SAMPLE}'); return true; })()`;
    await cdp.send('Runtime.evaluate', { expression: seed });

    process.stderr.write('[attach] reloading...\n');
    await cdp.send('Page.reload');
    await waitFor(cdp, 'Page.loadEventFired', 15000);

    process.stderr.write('[attach] settling 8000ms...\n');
    await new Promise(r => setTimeout(r, 8000));

    const blit = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {
            const f = document.querySelector('iframe');
            const d = f.contentDocument, w = f.contentWindow;
            const src = d.querySelector('canvas');
            if (!src) return { err: 'no canvas' };
            const c = d.createElement('canvas');
            c.width = src.width; c.height = src.height;
            const ctx = c.getContext('2d');
            await new Promise(r => w.requestAnimationFrame(r));
            ctx.drawImage(src, 0, 0);
            return { dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height };
        })()`,
        awaitPromise: true,
        returnByValue: true,
    });
    if (blit.result.value?.err) throw new Error('blit: ' + blit.result.value.err);
    process.stderr.write(`[blit] ${blit.result.value.w}x${blit.result.value.h}\n`);
    const data = blit.result.value.dataUrl.replace(/^data:image\/png;base64,/, '');
    const out = join(OUT, `${NAME}.png`);
    await fs.writeFile(out, Buffer.from(data, 'base64'));
    process.stdout.write(out + '\n');

    ws.close();
    process.exit(0);
}

main().catch((e) => { process.stderr.write('err: ' + (e.stack || e.message) + '\n'); process.exit(2); });
