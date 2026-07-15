import {
    AtmosphericComponent, BitmapTexture2D, BoxGeometry, CameraUtil, Color, DecalComponent,
    DirectLight, Engine3D, HoverCameraController, KelvinUtil, LitMaterial, MeshRenderer,
    Object3D, PassType, Scene3D, SphereGeometry, Vector3, View3D,
} from "@orillusion/core";

/* ════════════════════════════════════════════════════════════════════
 * Sample_DecalShadowVolume —— Built-in projected decals
 *
 * Decals are a first-class engine feature:
 *   - `DecalComponent`: attach to an Object3D with
 *     `localScale = (footprintX, depth, footprintZ)` to define the
 *     projection volume.
 *   - `Engine3D.setting.render.decals = true`: enables
 *     `DecalShadowVolumePass` inside `ForwardRendererJob`, slotted
 *     between the opaque/transmission half and the transparent half.
 *
 * Decal occlusion for a mesh that shouldn't be painted (e.g. a
 * building standing in the footprint): use the engine's existing
 * "renderOrder ≥ 3000 → transparent bucket" rule. Bumping a building's
 * material renderOrder to 3001 reroutes it through SortedTransparentPass,
 * which runs AFTER the decal pass — buildings draw on top of the
 * decal-composited color buffer, naturally hiding any decal that would
 * have wrapped onto their walls.
 *
 * That is the "most convenient" order-control knob; see
 * `Sample_PassOrderControl.ts` for the alternatives (VisibleLayer-based
 * routing into a custom user pass with explicit topo dependencies).
 * ──────────────────────────────────────────────────────────────────── */

function sphericalDir(theta: number, phi: number): [number, number, number] {
    const cosT = Math.cos(theta);
    return [cosT * Math.cos(phi), Math.sin(theta), cosT * Math.sin(phi)];
}

export class Sample_DecalShadowVolume {
    engine!: Engine3D;
    scene!: Scene3D;

    async run() {
        this.engine = await Engine3D.init({
            setting: {
                shadow: { autoUpdate: true, updateFrameRate: 1 },
                // zPrePass: required (DecalShadowVolumePass reads _MainDepthTexture).
                // decals:   turns on the built-in stencil-volume decal pass.
                render: {
                    zPrePass: true,
                    decals: true,
                    useLogDepth: true,
                },
            },
        });

        this.scene = new Scene3D();
        this.scene.addComponent(AtmosphericComponent);

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, this.engine.aspect, 0.5, 5000);
        camera.object3D.addComponent(HoverCameraController).setCamera(90, -10, 72);

        const view = new View3D();
        view.scene = this.scene;
        view.camera = camera;
        this.engine.startRenderView(view);

        await this.initScene();
        await this.setupDecals();
    }

    private async initScene() {
        const light = new Object3D();
        light.rotationX = 55;
        light.rotationY = 320;
        const dl = light.addComponent(DirectLight);
        dl.lightColor = KelvinUtil.color_temperature_to_rgb(5500);
        dl.intensity = 3;
        dl.castShadow = true;
        dl.enableCSM = true;
        this.scene.addChild(light);

        const sphere = new Object3D();
        const sphereMat = new LitMaterial();
        sphereMat.baseColor = new Color(0.32, 0.38, 0.30, 1);
        sphereMat.roughness = 0.85;
        const sphereMr = sphere.addComponent(MeshRenderer);
        sphereMr.geometry = new SphereGeometry(30, 64, 64);
        sphereMr.material = sphereMat;
        sphereMr.receiveShadow = true;
        this.scene.addChild(sphere);

        const sphereR = 30;

        const bumpPositions: Array<[number, number, number, number]> = [
            [0.55, -0.15, 1.2, 0.10],
            [0.40, 0.45, 1.1, 0.55],
            [-0.45, 0.25, 1.2, 0.30],
            [-0.45, -0.30, 1.1, 0.78],
            [0.00, -0.42, 1.4, 0.05],
            [0.00, 0.45, 1.1, 0.92],
        ];
        for (let i = 0; i < bumpPositions.length; i++) {
            const [t, p, s, hue] = bumpPositions[i];
            const [nx, ny, nz] = sphericalDir(t, p);
            const bump = new Object3D();
            bump.x = nx * (sphereR + s * 0.4);
            bump.y = ny * (sphereR + s * 0.4);
            bump.z = nz * (sphereR + s * 0.4);
            const mr = bump.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(s * 2, s * 2, s * 2);
            const mat = new LitMaterial();
            const c = this._hueToRgb(hue);
            mat.baseColor = new Color(c[0], c[1], c[2], 1);
            mat.roughness = 0.65;
            mat.metallic = 0.05;
            mr.material = mat;
            mr.castShadow = true;
            mr.receiveShadow = true;
            this.scene.addChild(bump);
        }

        const buildings: Array<[number, number, number, number, number]> = [
            [0.50, -0.20, 1.4, 1.4, 12],
            [0.40, 0.50, 1.2, 1.2, 10],
            [-0.42, 0.30, 1.0, 1.6, 14],
            [0.00, -0.40, 1.6, 1.0, 11],
            [-0.10, 0.55, 1.0, 1.0, 3],
        ];
        for (let i = 0; i < buildings.length; i++) {
            const [t, p, fw, fd, h] = buildings[i];
            const [nx, ny, nz] = sphericalDir(t, p);
            const obj = new Object3D();
            obj.name = `Building_${i}`;
            obj.x = nx * (sphereR + h * 0.5);
            obj.y = ny * (sphereR + h * 0.5);
            obj.z = nz * (sphereR + h * 0.5);
            DecalComponent.alignTopToward(obj, new Vector3(nx, ny, nz));
            const mr = obj.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(fw, h, fd);
            const mat = new LitMaterial();
            mat.baseColor = new Color(0.85, 0.85, 0.88, 1);
            mat.roughness = 0.4;
            mat.metallic = 0.2;
            mr.material = mat;
            mr.castShadow = true;
            mr.receiveShadow = true;
            // Bump the material into the transparent bucket so
            // SortedTransparentPass — which runs AFTER the decal pass —
            // draws it. End effect: building overpaints any decal that
            // tried to wrap onto its walls.
            mat.getPass(PassType.COLOR)![0].renderOrder = 3001;
            mr.refreshRenderClassification();
            this.scene.addChild(obj);
        }
    }

    private async setupDecals(): Promise<void> {
        const sphereR = 30;

        type ProcDecal = {
            kind: 'proc'; name: string; theta: number; phi: number;
            width: number; depth: number;
            tint: [number, number, number, number];
            paint: (g: CanvasRenderingContext2D, S: number) => void;
        };
        type ImgDecal = {
            kind: 'img'; name: string; theta: number; phi: number;
            width: number; depth: number;
            tint: [number, number, number, number];
            url: string;
        };
        type AnyDecal = ProcDecal | ImgDecal;

        const decals: AnyDecal[] = [
            {
                kind: 'proc', name: 'crosshair', theta: 0.55, phi: -0.15,
                width: 8, depth: 10,
                tint: [1.0, 0.85, 0.20, 1.0],
                paint: (g, S) => {
                    g.strokeStyle = '#fff';
                    g.lineWidth = S * 0.06;
                    g.beginPath();
                    g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
                    g.stroke();
                    g.beginPath();
                    g.moveTo(S / 2, S * 0.08); g.lineTo(S / 2, S * 0.92);
                    g.moveTo(S * 0.08, S / 2); g.lineTo(S * 0.92, S / 2);
                    g.stroke();
                },
            },
            {
                kind: 'proc', name: 'pad', theta: 0.4, phi: 0.45,
                width: 9, depth: 12,
                tint: [0.25, 0.85, 0.95, 0.9],
                paint: (g, S) => {
                    const grad = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.48);
                    grad.addColorStop(0, 'rgba(255,255,255,1)');
                    grad.addColorStop(0.6, 'rgba(120,220,255,0.7)');
                    grad.addColorStop(1, 'rgba(40,40,80,0)');
                    g.fillStyle = grad;
                    g.fillRect(0, 0, S, S);
                    g.strokeStyle = 'rgba(255,255,255,0.8)';
                    g.lineWidth = S * 0.04;
                    for (let k = 0; k < 4; k++) {
                        g.beginPath();
                        g.arc(S / 2, S / 2, S * (0.15 + k * 0.08), 0, Math.PI * 2);
                        g.stroke();
                    }
                },
            },
            {
                kind: 'proc', name: 'stripes', theta: -0.45, phi: 0.25,
                width: 8, depth: 10,
                tint: [1.0, 0.35, 0.30, 1.0],
                paint: (g, S) => {
                    g.fillStyle = 'rgba(255,255,255,0.95)';
                    const bands = 6;
                    for (let k = 0; k < bands; k++) {
                        if ((k & 1) === 0) g.fillRect(0, (k / bands) * S, S, S / bands);
                    }
                },
            },
            {
                kind: 'proc', name: 'arrowProc', theta: -0.45, phi: -0.30,
                width: 7, depth: 10,
                tint: [0.95, 0.95, 0.95, 1.0],
                paint: (g, S) => {
                    g.fillStyle = 'rgba(40,160,80,1)';
                    g.beginPath();
                    g.moveTo(S * 0.5, S * 0.08);
                    g.lineTo(S * 0.85, S * 0.55);
                    g.lineTo(S * 0.6, S * 0.55);
                    g.lineTo(S * 0.6, S * 0.92);
                    g.lineTo(S * 0.4, S * 0.92);
                    g.lineTo(S * 0.4, S * 0.55);
                    g.lineTo(S * 0.15, S * 0.55);
                    g.closePath();
                    g.fill();
                },
            },
            {
                kind: 'img', name: 'grid', theta: 0.0, phi: -0.42,
                width: 12, depth: 14,
                tint: [1.0, 1.0, 1.0, 1.0],
                url: 'textures/grid.jpg',
            },
            {
                kind: 'img', name: 'arrowTex', theta: 0.0, phi: 0.45,
                width: 10, depth: 12,
                tint: [1.0, 1.0, 1.0, 1.0],
                url: 'textures/arrow.png',
            },
        ];

        await Promise.all(decals.map(async d => {
            const ny = Math.sin(d.theta);
            const cosT = Math.cos(d.theta);
            const nx = cosT * Math.cos(d.phi);
            const nz = cosT * Math.sin(d.phi);
            const normal = new Vector3(nx, ny, nz);

            const tex = d.kind === 'proc'
                ? this._paintCanvasTexture(256, d.paint)
                : await this.engine.res.loadTexture(d.url, null, false, 'srgb');

            const obj = new Object3D();
            obj.name = `Decal:${d.name}`;
            obj.localPosition = new Vector3(nx * sphereR, ny * sphereR, nz * sphereR);
            obj.localScale = new Vector3(d.width, d.depth, d.width);
            DecalComponent.alignTopToward(obj, normal);
            obj.addComponent(DecalComponent, {
                texture: tex,
                tint: new Color(d.tint[0], d.tint[1], d.tint[2], d.tint[3]),
            });
            this.scene.addChild(obj);
        }));
    }

    private _hueToRgb(h: number): [number, number, number] {
        const c = 1;
        const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
        let r = 0, g = 0, b = 0;
        if (h < 1 / 6) { r = c; g = x; }
        else if (h < 2 / 6) { r = x; g = c; }
        else if (h < 3 / 6) { g = c; b = x; }
        else if (h < 4 / 6) { g = x; b = c; }
        else if (h < 5 / 6) { r = x; b = c; }
        else { r = c; b = x; }
        return [r * 0.6 + 0.2, g * 0.6 + 0.2, b * 0.6 + 0.2];
    }

    private _paintCanvasTexture(size: number, draw: (g: CanvasRenderingContext2D, S: number) => void): BitmapTexture2D {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        draw(canvas.getContext('2d')!, size);
        const tex = new BitmapTexture2D(true, this.engine.context3D, 'srgb');
        tex.source = canvas;
        return tex;
    }
}
