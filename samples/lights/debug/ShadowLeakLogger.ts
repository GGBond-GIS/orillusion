// ShadowLeakLogger — dumps an emoji grid of expected-vs-actual shadow state
// for each surface in Sample_SpotLight, so we can debug shadow leaks by
// reading _out/console.log instead of screenshots.
//
// Install after engine.startRenderView(view):
//   const logger = ShadowLeakLogger.install(engine, view, light, walls)
// and pass `lateRender: () => logger.tick()` to Engine3D.init(...).

import { Engine3D, View3D, SpotLight, Object3D, Vector3 } from "@orillusion/core";

type Expected = 'LIT' | 'OCCLUDED' | 'CONE_MISS' | 'OUT_OF_RANGE';
type Actual = 'LIT' | 'SHADOWED';

type WallAABB = {
    name: string;
    min: Vector3;
    max: Vector3;
};

type SurfaceGrid = {
    title: string;
    normal: Vector3;
    // map (col, row) -> world position
    sample: (col: number, row: number) => Vector3;
    cols: number;
    rows: number;
    // for the header line
    axes: string;
};

export class ShadowLeakLogger {
    private engine!: Engine3D;
    private view!: View3D;
    private light!: SpotLight;
    private wallAABBs: WallAABB[] = [];
    private frameCount = 0;
    private dumpAtFrame = 120;
    private done = false;
    private running = false;

    static install(
        engine: Engine3D,
        view: View3D,
        light: SpotLight,
        walls: Object3D[],
        opts?: { dumpAtFrame?: number },
    ): ShadowLeakLogger {
        const self = new ShadowLeakLogger();
        self.engine = engine;
        self.view = view;
        self.light = light;
        self.dumpAtFrame = opts?.dumpAtFrame ?? 120;
        self.wallAABBs = walls.map((w) => {
            // BoxGeometry(1,1,1) + identity rotation + localScale/localPosition:
            //   world AABB = pos ± scale/2.
            const p = w.localPosition;
            const s = w.localScale;
            return {
                name: w.name || 'wall',
                min: new Vector3(p.x - s.x * 0.5, p.y - s.y * 0.5, p.z - s.z * 0.5),
                max: new Vector3(p.x + s.x * 0.5, p.y + s.y * 0.5, p.z + s.z * 0.5),
            };
        });
        return self;
    }

    public async tick(): Promise<void> {
        if (this.done || this.running) return;
        this.frameCount++;
        if (this.frameCount < this.dumpAtFrame) return;
        this.running = true;
        try {
            await this.dump();
        } catch (e: any) {
            console.log('[ShadowLeakLogger] dump failed: ' + (e?.stack || e?.message || e));
        } finally {
            this.done = true;
            this.running = false;
        }
    }

    // ---------------- scene metadata ----------------

    private logScene(): void {
        const l = this.light;
        const pos = l.transform.worldPosition;
        // Dump shadow-caster count from the scene, to verify our caps are
        // actually picked up by the point-shadow render pass.
        try {
            const job: any = this.engine.getRenderJob(this.view);
            const psr = job?.pointLightShadowRenderer;
            const dic = psr?._shadowCameraDic as Map<any, any>;
            const info = dic?.get(this.light);
            if (info) {
                console.log(`[shadow-caster-check] depthTextures=${info.depthTexture?.length ?? '?'}  renderContexts=${info.renderContext?.length ?? '?'}`);
            }
            // also dump scene child count to verify objects added
            const sc = (this.view as any).scene;
            const n = sc?._children?.length ?? (sc?.entityChildren?.length ?? '?');
            console.log(`[scene] children.length=${n}`);
        } catch (e: any) { console.log('[shadow-caster-check] err: ' + e?.message); }
        const dir = l.direction;
        const ld = l.lightData;
        const sb = ld.shadowBias?.[0] ?? 0;
        const nb = ld.normalBias?.[0] ?? 0;
        const sFar = ld.shadowFar ?? 0;
        console.log('━━━ Scene ━━━');
        console.log(
            `light: SpotLight pos=(${f(pos.x)}, ${f(pos.y)}, ${f(pos.z)})` +
            ` dir=(${f(dir.x, 3)}, ${f(dir.y, 3)}, ${f(dir.z, 3)})` +
            ` range=${f(l.range)} outerAngle=${f(l.outerAngle)}°`,
        );
        for (const w of this.wallAABBs) {
            console.log(
                `wall: ${w.name}` +
                ` AABB=(${f(w.min.x)},${f(w.min.y)},${f(w.min.z)})→(${f(w.max.x)},${f(w.max.y)},${f(w.max.z)})`,
            );
        }
        console.log(`bias: shadowBias[0]=${f(sb, 5)}  normalBias[0]=${f(nb, 5)}  shadowFar=${f(sFar)}`);
    }

    // ---------------- cube shadow readback ----------------

    private async readShadowCube(): Promise<Float32Array[] | null> {
        const job: any = this.engine.getRenderJob(this.view);
        const psr = job?.pointLightShadowRenderer;
        if (!psr) {
            console.log('[ShadowLeakLogger] no pointLightShadowRenderer on renderJob');
            return null;
        }
        // _shadowCameraDic is private; reach in.
        const dic: Map<any, any> = psr._shadowCameraDic;
        const info = dic?.get(this.light);
        if (!info) {
            console.log('[ShadowLeakLogger] no shadow camera dic entry for light (not yet rendered?)');
            return null;
        }
        const depthTextures: any[] = info.depthTexture;
        const size = psr.shadowSize as number;
        const ctx = this.view.engine3D.context3D;
        const device: GPUDevice = ctx.device;
        const gpu = ctx.gpuContext;

        const bytesPerRow = size * 4; // depth32float = 4 bytes per texel; 1024*4=4096 (aligned)
        const bufSize = bytesPerRow * size;

        const faceArrays: Float32Array[] = [];
        for (let face = 0; face < 6; face++) {
            const srcTex: GPUTexture = depthTextures[face].getGPUTexture();
            const buf = device.createBuffer({
                size: bufSize,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const cmd = gpu.beginCommandEncoder();
            cmd.copyTextureToBuffer(
                { texture: srcTex, aspect: 'depth-only' },
                { buffer: buf, bytesPerRow, rowsPerImage: size },
                { width: size, height: size, depthOrArrayLayers: 1 },
            );
            gpu.endCommandEncoder(cmd);
            await buf.mapAsync(GPUMapMode.READ);
            const copy = new Float32Array(buf.getMappedRange().slice(0));
            buf.unmap();
            buf.destroy();
            faceArrays[face] = copy;
        }
        return faceArrays;
    }

    // ---------------- analytical + actual ----------------

    private inCone(P: Vector3): boolean {
        const L = this.light.transform.worldPosition;
        const D = this.light.direction;
        const dx = P.x - L.x, dy = P.y - L.y, dz = P.z - L.z;
        const dlen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dlen < 1e-5) return true;
        const cosAng = (dx * D.x + dy * D.y + dz * D.z) / dlen;
        const halfAngle = (this.light.outerAngle * 0.5) * Math.PI / 180;
        return cosAng >= Math.cos(halfAngle);
    }

    private inRange(P: Vector3): boolean {
        const L = this.light.transform.worldPosition;
        const dx = P.x - L.x, dy = P.y - L.y, dz = P.z - L.z;
        return (dx * dx + dy * dy + dz * dz) <= this.light.range * this.light.range;
    }

    // Does any wall intersect the open segment P→L? Works for both the "wall
    // strictly between" case (tMin > 0, tMax < 1) and "probe inside wall"
    // (tMin < 0, tMax > 0): we clip the slab [tMin,tMax] to [0,1] and ask
    // whether a positive overlap remains, with 1e-5 slack to ignore grazing.
    private occluded(P: Vector3): boolean {
        const L = this.light.transform.worldPosition;
        const dx = L.x - P.x, dy = L.y - P.y, dz = L.z - P.z;
        for (const w of this.wallAABBs) {
            let tMin = -Infinity, tMax = Infinity;
            let ok = true;
            for (const ax of [0, 1, 2] as const) {
                const o = ax === 0 ? P.x : ax === 1 ? P.y : P.z;
                const d = ax === 0 ? dx : ax === 1 ? dy : dz;
                const mn = ax === 0 ? w.min.x : ax === 1 ? w.min.y : w.min.z;
                const mx = ax === 0 ? w.max.x : ax === 1 ? w.max.y : w.max.z;
                if (Math.abs(d) < 1e-8) {
                    if (o < mn || o > mx) { ok = false; break; }
                } else {
                    let t1 = (mn - o) / d;
                    let t2 = (mx - o) / d;
                    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
                    if (t1 > tMin) tMin = t1;
                    if (t2 < tMax) tMax = t2;
                    if (tMin > tMax) { ok = false; break; }
                }
            }
            if (!ok) continue;
            const tStart = Math.max(tMin, 0);
            const tEnd = Math.min(tMax, 1);
            if (tEnd - tStart > 1e-5) return true;
        }
        return false;
    }

    private expected(P: Vector3): Expected {
        if (!this.inCone(P)) return 'CONE_MISS';
        if (!this.inRange(P)) return 'OUT_OF_RANGE';
        if (this.occluded(P)) return 'OCCLUDED';
        return 'LIT';
    }

    // Replicates PointShadow_frag: direction = receiverPos - lightPos, len,
    // NoL floor 0.1, bias = shadowBias*lengthScale / NoL, compareZ.
    private actual(
        P: Vector3,
        N: Vector3,
        faces: Float32Array[],
        size: number,
    ): { result: Actual; stored: number; compareZ: number } {
        const L = this.light.transform.worldPosition;
        const ld = this.light.lightData;
        const sb = ld.shadowBias?.[0] ?? 0;
        const nb = ld.normalBias?.[0] ?? 0;
        const sFar = ld.shadowFar > 0 ? ld.shadowFar : this.view.camera.far;
        const range = Math.max(this.light.range, 1);

        const unshiftedLen = Math.hypot(P.x - L.x, P.y - L.y, P.z - L.z);
        const lengthScale = Math.min(unshiftedLen / range, 1.0);
        const Rx = P.x + N.x * nb * lengthScale;
        const Ry = P.y + N.y * nb * lengthScale;
        const Rz = P.z + N.z * nb * lengthScale;
        const dx = Rx - L.x, dy = Ry - L.y, dz = Rz - L.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const dnx = dx / len, dny = dy / len, dnz = dz / len;
        // NoL with direction toward-light = -d
        const NoLraw = N.x * -dnx + N.y * -dny + N.z * -dnz;
        const NoL = Math.max(NoLraw, 0.1);
        const bias = (sb * lengthScale) / NoL;
        const compareZ = (len - bias) / sFar;

        const { face, u, v } = this.cubeLookup(dnx, dny, dnz);
        const tx = clamp(Math.floor(u * size), 0, size - 1);
        const ty = clamp(Math.floor(v * size), 0, size - 1);
        const stored = faces[face][ty * size + tx];
        const result: Actual = compareZ > stored ? 'SHADOWED' : 'LIT';
        return { result, stored, compareZ };
    }

    // WebGPU/D3D cube convention. `d` is a non-zero direction vector.
    private cubeLookup(x: number, y: number, z: number): { face: number; u: number; v: number } {
        const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
        let face: number, sc: number, tc: number, ma: number;
        if (ax >= ay && ax >= az) {
            if (x > 0) { face = 0; sc = -z; tc = -y; ma = ax; }   // +X right
            else       { face = 1; sc = +z; tc = -y; ma = ax; }   // -X left
        } else if (ay >= ax && ay >= az) {
            if (y > 0) { face = 2; sc = +x; tc = +z; ma = ay; }   // +Y up
            else       { face = 3; sc = +x; tc = -z; ma = ay; }   // -Y down
        } else {
            if (z > 0) { face = 4; sc = +x; tc = -y; ma = az; }   // +Z front
            else       { face = 5; sc = -x; tc = -y; ma = az; }   // -Z back
        }
        const u = (sc / ma + 1) * 0.5;
        const v = (tc / ma + 1) * 0.5;
        return { face, u, v };
    }

    // ---------------- per-surface render ----------------

    private surfaceGrids(): SurfaceGrid[] {
        // Ranges cover the interesting region of the Sample_SpotLight scene.
        const COLS = 21, ROWS = 11;
        const FCOLS = 21, FROWS = 21;
        return [
            // FLOOR: Y=0.5. Row 0 = Z=-250 (toward light), Row 20 = Z=+250.
            {
                title: 'FLOOR (Y=0.5,  X→[-250,250]  Z↓[-250,250])',
                normal: new Vector3(0, 1, 0),
                cols: FCOLS, rows: FROWS,
                axes: 'X→, Z↓',
                sample: (c, r) => new Vector3(
                    lerp(-250, 250, c / (FCOLS - 1)),
                    0.5,
                    lerp(-250, 250, r / (FROWS - 1)),
                ),
            },
            // WALL_W inside face at Z=+5 (the face looking INTO the room).
            {
                title: 'WALL_W inside (Z=+5,  X→[-250,250]  Y↑[100,0])',
                normal: new Vector3(0, 0, 1),
                cols: COLS, rows: ROWS,
                axes: 'X→, Y↑',
                sample: (c, r) => new Vector3(
                    lerp(-250, 250, c / (COLS - 1)),
                    lerp(100, 0, r / (ROWS - 1)),
                    5.01,
                ),
            },
            // WALL_A inside face at X=250.
            {
                title: 'WALL_A inside (X=250,  Z→[-250,250]  Y↑[100,0])',
                normal: new Vector3(-1, 0, 0),
                cols: COLS, rows: ROWS,
                axes: 'Z→, Y↑',
                sample: (c, r) => new Vector3(
                    249.99,
                    lerp(100, 0, r / (ROWS - 1)),
                    lerp(-250, 250, c / (COLS - 1)),
                ),
            },
            // WALL_D inside face at X=-250.
            {
                title: 'WALL_D inside (X=-250,  Z→[-250,250]  Y↑[100,0])',
                normal: new Vector3(1, 0, 0),
                cols: COLS, rows: ROWS,
                axes: 'Z→, Y↑',
                sample: (c, r) => new Vector3(
                    -249.99,
                    lerp(100, 0, r / (ROWS - 1)),
                    lerp(-250, 250, c / (COLS - 1)),
                ),
            },
            // Dense L-corner probe: floor at (X=200..260, Z=0..60). This is
            // where image 1 showed the diagonal bright line we're hunting for.
            // Step 3 world-units → catches sub-texel seam effects the coarse
            // 25-unit floor grid misses.
            {
                title: 'LCORNER+X floor (Y=0.5,  X→[200,260]  Z↓[0,60])',
                normal: new Vector3(0, 1, 0),
                cols: 21, rows: 21,
                axes: 'X→, Z↓',
                sample: (c, r) => new Vector3(
                    lerp(200, 260, c / 20),
                    0.5,
                    lerp(0, 60, r / 20),
                ),
            },
            {
                title: 'LCORNER-X floor (Y=0.5,  X→[-260,-200]  Z↓[0,60])',
                normal: new Vector3(0, 1, 0),
                cols: 21, rows: 21,
                axes: 'X→, Z↓',
                sample: (c, r) => new Vector3(
                    lerp(-260, -200, c / 20),
                    0.5,
                    lerp(0, 60, r / 20),
                ),
            },
        ];
    }

    private glyph(exp: Expected, act: Actual | null): string {
        if (exp === 'CONE_MISS' || exp === 'OUT_OF_RANGE') return '⚪';
        if (exp === 'LIT') {
            if (act === 'LIT') return '🟡';
            return '🟣'; // over-dark
        }
        // exp === 'OCCLUDED'
        if (act === 'SHADOWED') return '⚫';
        return '🔴'; // LEAK
    }

    private logSurface(
        grid: SurfaceGrid,
        faces: Float32Array[] | null,
        size: number,
        summary: {
            leaks: number;
            overdark: number;
            firstLeak: string | null;
            minMargin: number;  // min (stored - compareZ) among OCCLUDED-ok probes; small = near-leak
            minMarginAt: string | null;
        },
    ): void {
        console.log('━━━ ' + grid.title + ' ━━━');
        for (let r = 0; r < grid.rows; r++) {
            let line = '';
            for (let c = 0; c < grid.cols; c++) {
                const P = grid.sample(c, r);
                const exp = this.expected(P);
                let act: Actual | null = null;
                let stored = 0, compareZ = 0;
                if (faces && (exp === 'LIT' || exp === 'OCCLUDED')) {
                    const r2 = this.actual(P, grid.normal, faces, size);
                    act = r2.result; stored = r2.stored; compareZ = r2.compareZ;
                }
                const g = this.glyph(exp, act);
                line += g;
                const tag = grid.title.split(' ')[0];
                if (g === '🔴') {
                    summary.leaks++;
                    if (!summary.firstLeak) {
                        summary.firstLeak = `${tag}@(${f(P.x)},${f(P.y)},${f(P.z)})` +
                            ` stored=${f(stored, 4)} compareZ=${f(compareZ, 4)} diff=${f(compareZ - stored, 4)}`;
                    }
                } else if (g === '🟣') {
                    summary.overdark++;
                } else if (g === '⚫') {
                    // OCCLUDED and actual SHADOWED. How close to leaking?
                    // compareZ > stored means shadowed. margin = compareZ - stored > 0.
                    // Smaller margin = closer to flipping into a LEAK.
                    const margin = compareZ - stored;
                    if (margin < summary.minMargin) {
                        summary.minMargin = margin;
                        summary.minMarginAt = `${tag}@(${f(P.x)},${f(P.y)},${f(P.z)})` +
                            ` stored=${f(stored, 4)} compareZ=${f(compareZ, 4)} margin=${f(margin, 5)}`;
                    }
                }
            }
            console.log(line);
        }
    }

    // ---------------- entry ----------------

    private async dump(): Promise<void> {
        console.log(`\n[ShadowLeakLogger] ━━━ DUMP BEGIN (frame ${this.frameCount}) ━━━`);
        this.logScene();
        const faces = await this.readShadowCube();
        const job: any = this.engine.getRenderJob(this.view);
        const size: number = job?.pointLightShadowRenderer?.shadowSize ?? 1024;
        if (faces) this.logUVSanity(faces, size);
        if (faces) this.logFaceMap(faces, size, 3);  // -Y face
        const summary = {
            leaks: 0, overdark: 0,
            firstLeak: null as string | null,
            minMargin: Infinity,
            minMarginAt: null as string | null,
        };
        for (const g of this.surfaceGrids()) {
            this.logSurface(g, faces, size, summary);
        }
        if (faces) this.logSeamScanline(faces, size);
        console.log('━━━ SUMMARY ━━━');
        console.log(`leaks=${summary.leaks}  over-dark=${summary.overdark}`);
        if (summary.firstLeak) console.log('firstLeak: ' + summary.firstLeak);
        if (summary.minMarginAt) console.log('closestToLeak: ' + summary.minMarginAt);
        console.log('legend: 🟡 lit-ok  ⚫ shadow-ok  🔴 LEAK  🟣 over-dark  ⚪ cone-miss');
        console.log('[ShadowLeakLogger] ━━━ DUMP END ━━━\n');
    }

    // Sanity check: for six canonical axis directions from the light, read
    // the shadow cube and compare against the distance to the closest
    // geometry along that axis in the scene. If my cube-face UV lookup
    // matches the engine's per-face camera orientation, stored should be
    // close to the expected distance. Large mismatches → my cubeLookup() is
    // returning the wrong (face,u,v).
    private logUVSanity(faces: Float32Array[], size: number): void {
        console.log('━━━ UV SANITY (reads stored at 6 canonical directions) ━━━');
        const L = this.light.transform.worldPosition;
        const sFar = this.light.lightData.shadowFar > 0
            ? this.light.lightData.shadowFar
            : this.view.camera.far;
        // For each canonical direction from the light, compute the
        // expected closest-hit distance by shooting a ray from the light
        // in that direction and intersecting with floor top (Y=0.5) + walls.
        // For asymmetric probes, compute expected floor-hit analytically.
        const askFloor = (dir: [number, number, number]) => {
            const len = Math.hypot(...dir);
            const ny = dir[1] / len;
            if (ny >= 0) return null; // ray going up, never hits floor
            const tToFloor = (0.5 - L.y) / (dir[1] / len);
            return tToFloor / sFar;
        };
        const f4 = (v: number | null) => v == null ? 'N/A' : f(v, 4);
        const probes: { name: string; dir: [number, number, number]; expected: string }[] = [
            { name: '+X', dir: [1, 0, 0], expected: 'grazing (no floor hit)' },
            { name: '-X', dir: [-1, 0, 0], expected: 'grazing (no floor hit)' },
            { name: '+Y (up into sky)', dir: [0, 1, 0], expected: 'far-plane (no hit)' },
            { name: '-Y (center)', dir: [0, -1, 0], expected: `floor → stored=${f4(askFloor([0, -1, 0]))}` },
            { name: '+Z', dir: [0, 0, 1], expected: 'grazing' },
            { name: '-Z', dir: [0, 0, -1], expected: 'grazing' },
            // Asymmetric — disambiguate UV flips.
            { name: '-Y +X (east of center)', dir: [1, -2, 0], expected: `floor → stored=${f4(askFloor([1, -2, 0]))}` },
            { name: '-Y +Z (south of center)', dir: [0, -2, 1], expected: `floor → stored=${f4(askFloor([0, -2, 1]))}` },
            { name: '-Y -X (west)', dir: [-1, -2, 0], expected: `floor → stored=${f4(askFloor([-1, -2, 0]))}` },
            { name: '-Y -Z (north)', dir: [0, -2, -1], expected: `floor → stored=${f4(askFloor([0, -2, -1]))}` },
        ];
        for (const p of probes) {
            const { face, u, v } = this.cubeLookup(p.dir[0], p.dir[1], p.dir[2]);
            const tx = clamp(Math.floor(u * size), 0, size - 1);
            const ty = clamp(Math.floor(v * size), 0, size - 1);
            const stored = faces[face][ty * size + tx];
            console.log(
                `  ${pad(p.name, 18)}  face=${face} u=${f(u, 3)} v=${f(v, 3)}  stored=${f(stored, 4)}   expect: ${p.expected}`,
            );
        }
    }

    // Print a coarse ASCII map of a cube face. 32x16 sampled texels. Uses
    // 10 shades from '.' (near) to '#' (far) for depth values. Clearly shows
    // whether my UV indexing produces geometry-shaped patterns or noise.
    private logFaceMap(faces: Float32Array[], size: number, face: number): void {
        const faceName = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'][face];
        console.log(`━━━ FACE ${face} (${faceName}) RAW MAP (32 cols × 16 rows, u→, v↓) ━━━`);
        const shades = '.-:=+*xX#@';
        const CW = 32, RW = 16;
        for (let r = 0; r < RW; r++) {
            let line = '';
            for (let c = 0; c < CW; c++) {
                const u = (c + 0.5) / CW;
                const v = (r + 0.5) / RW;
                const tx = Math.min(Math.floor(u * size), size - 1);
                const ty = Math.min(Math.floor(v * size), size - 1);
                const d = faces[face][ty * size + tx];
                // d in [0,1]; map to shade index
                const si = clamp(Math.floor(d * shades.length), 0, shades.length - 1);
                line += shades[si];
            }
            console.log('  ' + line);
        }
    }

    // Scans across the expected +X / +Z cube-face seam on the floor near the
    // L-corner. For each X, print: face, stored depth, compareZ, margin. A
    // sudden jump in `stored` between adjacent X's that cross a face boundary
    // is the classic cube-edge filtering signature — the hardware sampler
    // bilinear-mixes across the seam, producing a smoothed stored value the
    // compare test can flip on.
    private logSeamScanline(faces: Float32Array[], size: number): void {
        console.log('━━━ SEAM SCAN (floor Y=0.5, Z=20, X=200..260 step 2) ━━━');
        console.log('  X       face   stored   compareZ  margin');
        const N = new Vector3(0, 1, 0);
        for (let x = 200; x <= 260; x += 2) {
            const P = new Vector3(x, 0.5, 20);
            const L = this.light.transform.worldPosition;
            const dx = P.x - L.x, dy = P.y - L.y, dz = P.z - L.z;
            const dlen = Math.hypot(dx, dy, dz);
            const face = this.cubeLookup(dx / dlen, dy / dlen, dz / dlen).face;
            const r = this.actual(P, N, faces, size);
            console.log(
                `  ${pad(f(x, 0), 6)}  ${face}      ${pad(f(r.stored, 4), 7)}  ${pad(f(r.compareZ, 4), 8)}  ${f(r.compareZ - r.stored, 5)}`,
            );
        }
    }
}

function f(n: number | undefined, digits = 1): string {
    if (n === undefined || Number.isNaN(n)) return '?';
    if (digits === 0) return `${Math.round(n)}`;
    const k = Math.pow(10, digits);
    return `${Math.round(n * k) / k}`;
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function clamp(n: number, lo: number, hi: number): number {
    return n < lo ? lo : n > hi ? hi : n;
}

function pad(s: string, w: number): string {
    while (s.length < w) s = ' ' + s;
    return s;
}
