import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { UVMoveComponent } from "@samples/material/script/UVMoveComponent";
import { ProfilerDraw, PassType, OutlinePost, GBufferPost, Engine3D, AtmosphericComponent, GlobalFog, Transform, BloomPost, GodRayPost, Object3D, DirectLight, PointLight, SpotLight, GlobalIlluminationComponent, View3D, Color, LitMaterial, BlendMode, MorphTargetBlender, SkinnedMeshRenderer2, AnimatorComponent, GTAOPost, TAAPost, DepthOfFieldPost, Vector3, Vector4, Vector2 } from "@orillusion/core";
import { Graphic3D } from "@orillusion/graphic";

export class GUIUtil {

    static renderProfiler(arg0: ProfilerDraw, open: boolean = false) {
        let gui = GUIHelp._creatPanel();
        let cache = {};
        for (const key in PassType) {
            let i = parseInt(key);
            if (i >= 0) {
            } else {
                let fg = GUIHelp._addFolder(gui, key);
                open && fg.open();
                cache[key] = [
                    GUIHelp._addLabelValue(fg, `indicesCount`, arg0[key].indicesCount),
                    GUIHelp._addLabelValue(fg, `vertexCount`, arg0[key].vertexCount),
                    GUIHelp._addLabelValue(fg, `triCount`, arg0[key].triCount),
                    GUIHelp._addLabelValue(fg, `instanceCount`, arg0[key].instanceCount),
                    GUIHelp._addLabelValue(fg, `drawCount`, arg0[key].drawCount),
                    GUIHelp._addLabelValue(fg, `pipelineCount`, arg0[key].pipelineCount),
                ]
            }
        }
        open && gui.open();

        setInterval(() => {
            for (const key in PassType) {
                let i = parseInt(key);
                if (i >= 0) {
                } else {
                    cache[key][0].setValue(arg0[key].indicesCount);
                    cache[key][1].setValue(arg0[key].vertexCount);
                    cache[key][2].setValue(arg0[key].triCount);
                    cache[key][3].setValue(arg0[key].instanceCount);
                    cache[key][4].setValue(arg0[key].drawCount);
                    cache[key][5].setValue(arg0[key].pipelineCount);
                }
            }
        }, 2000);
    }


    static renderOutlinePost(post: OutlinePost, open: boolean = false) {
        GUIHelp.addFolder('OutlinePost');
        GUIHelp.add(post, 'outlinePixel', 0, 2048, 1);
        GUIHelp.add(post, 'fadeOutlinePixel', 0.0001, 0.2, 0.00001);
        GUIHelp.add(post, 'strength', 0.0001, 0.2, 0.00001);
        GUIHelp.add(post, 'useAddMode');
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    public static renderShadowSetting(engine: Engine3D, open: boolean = false) {
        GUIHelp.addFolder('ShadowSetting');
        let setting = engine.setting.shadow;

        GUIHelp.add(setting, 'shadowSize', 256, 4096, 1);

        // Shadow sampling type dropdown. The type is baked into shader defines
        // at preCompile (RenderShaderPass.ts USE_PCF/HARD/SOFT_SHADOW), so
        // changing it live won't rebuild pipelines. Persist the choice in
        // sessionStorage and reload so Engine3D.init picks it up next boot.
        const picker = { type: setting.type as 'HARD' | 'PCF' | 'SOFT' };
        GUIHelp.add(picker, 'type', ['HARD', 'PCF', 'SOFT']).onChange((v: string) => {
            try { sessionStorage.setItem('shadowType', v); } catch {}
            location.reload();
        });

        // Live-tunable penumbra knob for PCSS (SOFT mode). shadowSoft is a
        // plain uniform — GlobalUniformGroup rewrites it every frame — so
        // the slider takes effect next frame without a reload. Units are
        // the PCSS light-size multiplier: 1.0 ~ 4 shadow texels of max
        // penumbra for directional, 4/512 rad for cube.
        GUIHelp.add(setting, 'shadowSoft', 0.1, 8.0, 0.01);
        // Live-tunable PCF kernel scale (affects PCF mode only). 1.0 =
        // standard 3x3 spacing, 2-3 softens edges, 0.5 tightens.
        // Initialize if undefined (optional field) so the slider binds.
        if ((setting as any).pcfKernelScale === undefined) (setting as any).pcfKernelScale = 1.0;
        GUIHelp.add(setting, 'pcfKernelScale', 0.1, 4.0, 0.01);

        open && GUIHelp.open();
        GUIHelp.endFolder();
    }


    static renderGBufferPost(post: GBufferPost, open: boolean = false) {
        GUIHelp.addFolder('GBufferPost&Reflection');
        let bufferState = {
            current: 0,
            abldeo: 1,
            viewNormal: 2,
            worldNormal: 3,
            roughness: 4,
            metallic: 5,
            alpha: 6,
            modelID: 7,
        }
        GUIHelp.add(post, 'state', bufferState);
        GUIHelp.add(post, 'size1', 64.0, 1024, 1.0);
        GUIHelp.add(post, 'size2', 64.0, 1024, 1.0);
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }


    //render AtmosphericComponent
    public static renderAtmosphericSky(component: AtmosphericComponent, open: boolean = false, name?: string) {
        name ||= 'AtmosphericSky';
        GUIHelp.addFolder(name);
        GUIHelp.add(component, 'sunX', 0, 1, 0.01);
        GUIHelp.add(component, 'sunY', 0.4, 1.6, 0.01);
        GUIHelp.add(component, 'eyePos', 0, 5000, 1);
        GUIHelp.add(component, 'sunRadius', 0, 1000, 0.01);
        GUIHelp.add(component, 'sunRadiance', 0, 100, 0.01);
        GUIHelp.add(component, 'sunBrightness', 0, 10, 0.01);
        GUIHelp.add(component, 'exposure', 0, 2, 0.01);
        GUIHelp.add(component, 'displaySun', 0, 1, 0.01);
        GUIHelp.add(component, 'enable');

        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    public static renderGlobalFog(fog: GlobalFog, open: boolean = false, name?: string) {
        name ||= 'GlobalFog';
        GUIHelp.addFolder(name);
        GUIHelp.add(fog, 'fogType', {
            Liner: 0,
            Exp: 1,
            Exp2: 2,
        });
        GUIHelp.add(fog, 'start', -0.0, 1000.0, 0.0001);
        GUIHelp.add(fog, 'end', -0.0, 1000.0, 0.0001);
        GUIHelp.add(fog, 'fogHeightScale', 0.0001, 1.0, 0.0001);
        GUIHelp.add(fog, 'density', 0.0, 1.0, 0.0001);
        GUIHelp.add(fog, 'ins', 0.0, 5.0, 0.0001);
        GUIHelp.add(fog, 'skyFactor', 0.0, 1.0, 0.0001);
        GUIHelp.add(fog, 'skyRoughness', 0.0, 1.0, 0.0001);
        GUIHelp.add(fog, 'overrideSkyFactor', 0.0, 1.0, 0.0001);
        GUIHelp.add(fog, 'falloff', 0.0, 100.0, 0.01);
        GUIHelp.add(fog, 'rayLength', 0.01, 2000.0, 0.01);
        GUIHelp.add(fog, 'scatteringExponent', 1, 40.0, 0.001);
        GUIHelp.add(fog, 'dirHeightLine', 0.0, 20.0, 0.01);
        GUIHelp.addColor(fog, 'fogColor');
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    //render transform
    public static renderTransform(transform: Transform, open: boolean = false, name?: string, scale?: number) {
        name ||= 'Transform';
        GUIHelp.addFolder(name);
        GUIHelp.add(transform, 'x', -scale, scale, 0.01);
        GUIHelp.add(transform, 'y', -scale, scale, 0.01);
        GUIHelp.add(transform, 'z', -scale, scale, 0.01);
        GUIHelp.add(transform, 'rotationX', 0.0, 360.0, 0.01);
        GUIHelp.add(transform, 'rotationY', 0.0, 360.0, 0.01);
        GUIHelp.add(transform, 'rotationZ', 0.0, 360.0, 0.01);
        GUIHelp.add(transform, 'scaleX', -2.0, 2.0, 0.01);
        GUIHelp.add(transform, 'scaleY', -2.0, 2.0, 0.01);
        GUIHelp.add(transform, 'scaleZ', -2.0, 2.0, 0.01);

        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    public static renderBloom(bloom: BloomPost, open: boolean = false, name?: string) {
        name ||= 'Bloom';
        GUIHelp.addFolder(name);
        GUIHelp.add(bloom, 'downSampleBlurSize', 3, 15, 1);
        GUIHelp.add(bloom, 'downSampleBlurSigma', 0.01, 500, 0.001);
        GUIHelp.add(bloom, 'upSampleBlurSize', 3, 15, 1);
        GUIHelp.add(bloom, 'upSampleBlurSigma', 0.01, 500, 0.001);
        GUIHelp.add(bloom, 'luminanceThreshole', 0.001, 10.0, 0.001);
        GUIHelp.add(bloom, 'bloomIntensity', 0.001, 10.0, 0.001);
        GUIHelp.add(bloom, 'hdr', 0.001, 10.0, 0.001);
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    static renderGodRay(godRay: GodRayPost, open: boolean = false, name?: string) {
        name ||= 'GodRay';
        GUIHelp.addFolder(name);
        GUIHelp.add(godRay, 'blendColor');
        GUIHelp.add(godRay, 'rayMarchCount', 8, 20, 1);
        GUIHelp.add(godRay, 'scatteringExponent', 1, 40, 1);
        GUIHelp.add(godRay, 'intensity', 0.01, 5, 0.001);
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    public static renderVector3(obj: Object3D, open: boolean = false, name?: string) {
        name ||= 'Vector3';
        GUIHelp.addFolder(name);
        GUIHelp.add(obj, 'x', -10.0, 10.0, 0.01);
        GUIHelp.add(obj, 'y', -10.0, 10.0, 0.01);
        GUIHelp.add(obj, 'z', -10.0, 10.0, 0.01);

        GUIHelp.add(obj.transform, 'rotationX', 0.0, 360.0, 0.01);
        GUIHelp.add(obj.transform, 'rotationY', 0.0, 360.0, 0.01);
        GUIHelp.add(obj.transform, 'rotationZ', 0.0, 360.0, 0.01);
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    //render direct light gui panel
    public static renderDirLight(light: DirectLight, open: boolean = false, name?: string) {
        name ||= `DirectLight-${light.name || light.object3D.name}`;
        GUIHelp.addFolder(name);
        GUIHelp.add(light, 'enable');
        GUIHelp.add(light.transform, 'x', -500, 500, 0.01);
        GUIHelp.add(light.transform, 'y', -500, 500, 0.01);
        GUIHelp.add(light.transform, 'z', -500, 500, 0.01);
        GUIHelp.add(light.transform, 'rotationX', 0.0, 360.0, 0.01);
        GUIHelp.add(light.transform, 'rotationY', 0.0, 360.0, 0.01);
        GUIHelp.add(light.transform, 'rotationZ', 0.0, 360.0, 0.01);

        // shadowBias / normalBias default to 'auto' (RFC-003) — explicit GUI
        // controls omitted; samples can override directly if needed.
        GUIHelp.add(light, 'shadowBoundWidth', 0, 1000, 0.1).listen();
        GUIHelp.add(light, 'shadowBoundHeight', 0, 1000, 0.1).listen();
        GUIHelp.add(light, 'shadowBoundNear', 0, 1000).listen();
        GUIHelp.add(light, 'shadowBoundFar', 1, 1000).listen();

        GUIHelp.addColor(light, 'lightColor');
        GUIHelp.add(light, 'intensity', 0.0, 50.0, 0.01);
        GUIHelp.add(light, 'indirect', 0.0, 1.0, 0.01);
        GUIHelp.add(light, 'castShadow');
        // Per-light PCSS softness knob. -1 = use global shadowSoft.
        GUIHelp.add(light, 'softness', -1, 32, 0.01);

        GUIHelp.add(light, 'enableCSM');
        GUIHelp.add(light, 'csmAutoUpdate');
        GUIHelp.add(light, 'debugCSM').onChange(() => this.refreshDirectLightDebug(light));
        GUIHelp.add(light, 'debugShadowBound').onChange(() => this.refreshDirectLightDebug(light));

        // Shadow-map debug overlay: when toggled on, render each CSM
        // cascade's depth texture into a stacked column of canvases at
        // the top-left corner of the screen. Off by default — pure
        // diagnostic, costs a per-frame readback per cascade.
        const shadowmapState = { showShadowmap: !!GUIUtil._shadowOverlays.get(light)?.show };
        GUIHelp.add(shadowmapState, 'showShadowmap').onChange((v: boolean) => {
            if (v) GUIUtil._enableShadowmapOverlay(light);
            else GUIUtil._disableShadowmapOverlay(light);
        });

        GUIUtil._addBiasReadout(light);

        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    /**
     * Per-light state for the optional shadow-map debug overlay.
     * `WeakMap` so canvases get GC'd if the light is destroyed.
     */
    private static _shadowOverlays = new WeakMap<DirectLight, {
        show: boolean;
        canvases: HTMLCanvasElement[];
        intervalId: number | null;
    }>();

    private static _enableShadowmapOverlay(light: DirectLight) {
        const existing = GUIUtil._shadowOverlays.get(light);
        if (existing && existing.show) return;

        // Cascade count comes from the engine setting; fall back to the
        // light's own cascadeNum if the setting isn't reachable yet
        // (GUI built before startRenderView).
        const view: View3D | undefined = light.transform?.view3D;
        const engineCascades = view?.engine3D?.setting?.shadow?.maxCascades ?? 4;
        const cascadeCount = Math.min(engineCascades, 4);
        const tile = 192;

        const canvases: HTMLCanvasElement[] = [];
        for (let i = 0; i < cascadeCount; i++) {
            const canvas = document.createElement('canvas');
            canvas.style.position = 'fixed';
            canvas.style.left = '8px';
            canvas.style.top = (8 + i * (tile + 4)) + 'px';
            canvas.style.width = tile + 'px';
            canvas.style.height = tile + 'px';
            canvas.style.zIndex = '999999';
            canvas.style.border = '1px solid #ffd400';
            canvas.style.background = '#222';
            canvas.style.imageRendering = 'pixelated';
            canvas.title = `Directional-light shadow map cascade ${i} (depth, contrast-stretched)`;
            document.body.appendChild(canvas);
            canvases.push(canvas);
        }

        let busy = false;
        const tick = async () => {
            if (busy) return;
            const v: View3D | undefined = light.transform?.view3D;
            const shadowPass: any = v?.renderGraph?.getPass('ShadowPass');
            const states = shadowPass?._rendererPassStates;
            if (!states || !v) return;
            busy = true;
            try {
                const ctx3D = v.engine3D.context3D as any;
                const device: GPUDevice = ctx3D.device;
                const gpu = ctx3D.gpuContext;
                // Cascade slots for this directional light start at
                // `light.shadowIndex`; CSM uses `cascadeNum` slots.
                const baseSlot = (light as any).shadowIndex ?? 0;
                for (let c = 0; c < cascadeCount; c++) {
                    const tex: any = states[baseSlot + c]?.depthTexture;
                    if (!tex || !tex.getGPUTexture) continue;
                    const w: number = tex.width;
                    const h: number = tex.height;
                    const bytesPerRow = Math.ceil((w * 4) / 256) * 256;
                    const buf = device.createBuffer({
                        size: bytesPerRow * h,
                        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                    });
                    const cmd = gpu.beginCommandEncoder();
                    cmd.copyTextureToBuffer(
                        { texture: tex.getGPUTexture(), aspect: 'depth-only', origin: { x: 0, y: 0, z: 0 } },
                        { buffer: buf, bytesPerRow, rowsPerImage: h },
                        { width: w, height: h, depthOrArrayLayers: 1 },
                    );
                    gpu.endCommandEncoder(cmd);
                    await buf.mapAsync(GPUMapMode.READ);
                    const src = new Float32Array(buf.getMappedRange().slice(0));
                    buf.unmap();
                    buf.destroy();

                    // Per-cascade contrast stretch on the non-cleared
                    // range, so caster shapes show up regardless of
                    // absolute depth scale (cascades far from the camera
                    // sit near 1.0, the near cascade near 0).
                    let mn = Infinity, mx = -Infinity;
                    const stride = bytesPerRow / 4;
                    for (let y = 0; y < h; y++) {
                        for (let x = 0; x < w; x++) {
                            const d = src[y * stride + x];
                            if (d < 1.0) {
                                if (d < mn) mn = d;
                                if (d > mx) mx = d;
                            }
                        }
                    }
                    if (mn === Infinity) { mn = 0; mx = 1; }
                    const range = (mx - mn) || 1;

                    const canvas = canvases[c];
                    if (!canvas.isConnected) continue; // disabled mid-readback
                    if (canvas.width !== w) canvas.width = w;
                    if (canvas.height !== h) canvas.height = h;
                    const ctx2d = canvas.getContext('2d')!;
                    const img = ctx2d.createImageData(w, h);
                    for (let y = 0; y < h; y++) {
                        for (let x = 0; x < w; x++) {
                            const d = src[y * stride + x];
                            const v = d >= 1.0 ? 0 : Math.max(0, Math.min(255, Math.floor(((d - mn) / range) * 255)));
                            const i = (y * w + x) * 4;
                            img.data[i] = v;
                            img.data[i + 1] = v;
                            img.data[i + 2] = v;
                            img.data[i + 3] = 255;
                        }
                    }
                    ctx2d.putImageData(img, 0, 0);
                }
            } catch {
                // best-effort debug — swallow transient GPU errors
            } finally {
                busy = false;
            }
        };
        // ~5 fps is plenty for visual debugging; readback every frame
        // would stall the main queue.
        const intervalId = window.setInterval(tick, 200);
        GUIUtil._shadowOverlays.set(light, { show: true, canvases, intervalId });
    }

    private static _disableShadowmapOverlay(light: DirectLight) {
        const state = GUIUtil._shadowOverlays.get(light);
        if (!state) return;
        state.show = false;
        if (state.intervalId !== null) {
            clearInterval(state.intervalId);
            state.intervalId = null;
        }
        for (const c of state.canvases) c.remove();
        state.canvases = [];
    }

    /**
     * Live readout of the per-frame auto-resolved shadowBias / normalBias
     * (RFC-003 ShadowBiasCalculator output). Values live in
     * `light.lightData.shadowBias[i]` / `light.lightData.normalBias[i]` and are
     * rewritten every frame in GlobalUniformGroup.setCamera, so we expose
     * getters and mark the dat.gui control `.listen()` to poll.
     *
     * Calling `.step()` is required: when bias starts at 0, dat.gui derives
     * `__impliedStep = 1` from the initial value and rounds everything to
     * whole numbers — the display would stay stuck at "0". Explicit step
     * fixes the display precision so sub-unit values render correctly.
     */
    private static _addBiasReadout(light: DirectLight | PointLight | SpotLight) {
        const isDirect = light instanceof DirectLight;
        const cascadeNum = isDirect && (light as DirectLight).enableCSM
            ? (light.transform.view3D?.engine3D?.setting.shadow.maxCascades ?? 4)
            : 1;
        const readout: any = {};
        const rows: { sKey: string; nKey: string; idx: number }[] = [];
        const addRow = (suffix: string, idx: number) => {
            const sKey = `shadowBias${suffix}`;
            const nKey = `normalBias${suffix}`;
            Object.defineProperty(readout, sKey, {
                enumerable: true,
                // `shadowBias`/`normalBias` are sized in LightBase.start() once the
                // owning engine's setting is reachable; when GUI is built before
                // startRenderView (see Sample_Outline) the arrays are still
                // undefined, so guard with optional chaining so dat.gui probes
                // a real number (not a throw) and creates a NumberController.
                get: () => light.lightData.shadowBias?.[idx] ?? 0,
                set: () => { /* read-only: next frame's listen() poll resets the input */ },
            });
            Object.defineProperty(readout, nKey, {
                enumerable: true,
                get: () => light.lightData.normalBias?.[idx] ?? 0,
                set: () => { /* read-only */ },
            });
            rows.push({ sKey, nKey, idx });
        };
        for (let i = 0; i < cascadeNum; i++) {
            addRow(cascadeNum > 1 ? `[${i}]` : '', i);
        }
        // 1e-6 covers the shadowBias (NDC) scale of ~1e-5..1e-3; normalBias
        // (world units) is larger but still prints cleanly at this precision.
        for (const row of rows) {
            GUIHelp.add(readout, row.sKey).step(1e-6).listen();
            GUIHelp.add(readout, row.nKey).step(1e-6).listen();
        }
    }

    private static _clearDebugDirectLight(light: DirectLight) {
        if (light.object3D && light.transform.view3D && light.transform.view3D.scene) {
            let g = light.transform.view3D.scene.getChildByName('graphic3D') as Graphic3D;
            if (!g) { g = new Graphic3D(); light.transform.view3D.scene.addChild(g); }
            const debugId = `DirectLight_${light.object3D.instanceID}`;
            g.Clear(debugId);
            g.Clear(`CameraFrustum_${light.shadowCamera.object3D.instanceID}`);
            g.Clear(`CameraFrustum_${light.object3D.transform.scene3D.view.camera.object3D.instanceID}`);
            for (let i = 0; i < light.cascadeNum; i++) {
                g.Clear(`${debugId}_cms${i}`);
                g.Clear(`CameraFrustum_${light.csmShadowCamera[i].object3D.instanceID}`);
                g.Clear(`${debugId}_cms${i}_corners`);
            }
        }
    }

    /**
     * Refresh the light's debug visualization based on the two independent toggles
     * (debugCSM, debugShadowBound). Either flag installs a single bindOnChange
     * closure that redraws on light transform / shadow bound changes.
     */
    public static refreshDirectLightDebug(light: DirectLight, open: boolean = true) {
        const debugId = `DirectLight_${light.object3D.instanceID}`;
        this._clearDebugDirectLight(light);
        if (!light.debugCSM && !light.debugShadowBound) {
            light.bindOnChange = null;
            return;
        }
        light.bindOnChange = () => {
            // csmAutoUpdate gate only matters in CSM mode (frustum follows render
            // camera). Non-CSM shadow camera follows the light alone.
            if (light.enableCSM && !light.csmAutoUpdate) return;
            if (!(light.object3D && light.transform.view3D && light.transform.view3D.scene)) return;
            let g = light.transform.view3D.scene.getChildByName('graphic3D') as Graphic3D;
            if (!g) { g = new Graphic3D(); light.transform.view3D.scene.addChild(g); }
            this._clearDebugDirectLight(light);
            g.drawAxis(debugId, light.transform.worldPosition, 10);
            if (light.debugCSM && light.enableCSM) {
                g.drawCameraFrustum(light.object3D.transform.scene3D.view.camera, new Color(1, 1, 0));
                for (let i = 0; i < light.cascadeNum; i++) {
                    g.drawBoundingBox(`${debugId}_cms${i}`, light.frustumCSM.children[i].bound);
                    g.drawCameraFrustum(light.csmShadowCamera[i], light.lightColor);

                    const corners = light.frustumCSM.sections[i + 1].corners;
                    g.drawLines(`${debugId}_cms${i}_corners`, [
                        corners[0], corners[2], corners[1], corners[3]
                    ], Color.COLOR_GREEN);
                }
            }
            if (light.debugShadowBound && !light.enableCSM) {
                // Pose the shadow camera from the light's current transform so the
                // rectangle tracks xyz / rotation changes immediately. poseShadowCamera
                // in the render pass only runs at frame time, which would lag behind
                // a GUI slider drag.
                const eye = light.transform.worldPosition;
                const target = new Vector3().copy(light.direction).add(eye);
                light.shadowCamera.transform.lookAt(eye, target);
                g.drawCameraFrustum(light.shadowCamera, light.lightColor);
            }
        };
        light.bindOnChange();
    }

    //show point light gui controller
    public static showPointLightGUI(light: PointLight, open: boolean = true) {
        GUIHelp.addFolder('PointLight');
        GUIHelp.add(light, 'enable');
        GUIHelp.addColor(light, 'lightColor');
        GUIHelp.add(light.transform, 'x', -1000, 1000.0, 0.01);
        GUIHelp.add(light.transform, 'y', -1000, 1000.0, 0.01);
        GUIHelp.add(light.transform, 'z', -1000, 1000.0, 0.01);

        GUIHelp.add(light, 'r', 0.0, 1.0, 0.001);
        GUIHelp.add(light, 'g', 0.0, 1.0, 0.001);
        GUIHelp.add(light, 'b', 0.0, 1.0, 0.001);
        GUIHelp.add(light, 'intensity', 0.0, 100.0, 0.001);
        GUIHelp.add(light, 'at', 0.0, 100.0, 0.001);
        GUIHelp.add(light, 'radius', 0.0, 1.0, 0.001);
        GUIHelp.add(light, 'range', 0.0, 1000.0, 0.001);
        GUIHelp.add(light, 'quadratic', 0.0, 2.0, 0.001);
        GUIHelp.add(light, 'castShadow');
        GUIHelp.add(light, 'softness', -1, 32, 0.01);
        GUIHelp.add(light, 'debugShadowRange').onChange(() => this.refreshPointLightDebug(light));

        // Cube shadow camera controls: shadowCameraFar=0 means auto=range.
        // Changing these directly affects the shadow-map depth normalization
        // (via lightData.shadowFar) — lets you tighten depth precision by
        // shrinking far to just cover your scene.
        // Slider range intentionally wide: shadowCameraNear only affects
        // geometry closer than `near` to the light; for large scenes that
        // value may need to be hundreds of world units. shadowCameraFar = 0
        // means auto (use range).
        GUIHelp.add(light, 'shadowCameraNear', 0.001, 1000, 0.01)
            .onChange(() => this.refreshPointLightDebug(light));
        GUIHelp.add(light, 'shadowCameraFar', 0, 2000, 0.1)
            .onChange(() => this.refreshPointLightDebug(light));

        GUIUtil._addShadowCalcReadout(light);
        GUIUtil._addBiasReadout(light);

        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    public static showSpotLightGUI(light: SpotLight, open: boolean = true) {
        GUIHelp.addFolder('SpotLight');
        GUIHelp.add(light, 'enable');
        GUIHelp.add(light.transform, 'x', -1000, 1000.0, 0.01);
        GUIHelp.add(light.transform, 'y', -1000, 1000.0, 0.01);
        GUIHelp.add(light.transform, 'z', -1000, 1000.0, 0.01);

        GUIHelp.add(light.transform, 'rotationX', -360, 360.0, 0.01);
        GUIHelp.add(light.transform, 'rotationY', -360, 360.0, 0.01);
        GUIHelp.add(light.transform, 'rotationZ', -360, 360.0, 0.01);

        GUIHelp.addColor(light, 'lightColor');
        GUIHelp.add(light, 'intensity', 0.0, 100.0, 0.001);
        GUIHelp.add(light, 'at', 0.0, 100.0, 0.001);
        GUIHelp.add(light, 'radius', 0.0, 10.0, 0.001);
        GUIHelp.add(light, 'range', 0.0, 1000.0, 0.001);
        GUIHelp.add(light, 'outerAngle', 0.0, 180.0, 0.001);
        GUIHelp.add(light, 'innerAngle', 0.0, 100.0, 0.001);
        GUIHelp.add(light, 'castShadow');
        GUIHelp.add(light, 'softness', -1, 32, 0.01);
        GUIHelp.add(light, 'debugShadowRange').onChange(() => this.refreshPointLightDebug(light));

        // Slider range intentionally wide: shadowCameraNear only affects
        // geometry closer than `near` to the light; for large scenes that
        // value may need to be hundreds of world units. shadowCameraFar = 0
        // means auto (use range).
        GUIHelp.add(light, 'shadowCameraNear', 0.001, 1000, 0.01)
            .onChange(() => this.refreshPointLightDebug(light));
        GUIHelp.add(light, 'shadowCameraFar', 0, 2000, 0.1)
            .onChange(() => this.refreshPointLightDebug(light));

        GUIUtil._addShadowCalcReadout(light);
        GUIUtil._addBiasReadout(light);

        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    /**
     * Live readout of the inputs that feed the host ShadowBiasCalculator, plus
     * what the formula *would* produce if it ran. Useful for comparing against
     * what `lightData.shadowBias[0]` actually contains (see _addBiasReadout)
     * — if the formula-output row shows a sensible value but lightData.shadowBias
     * shows 0, the host writeback path is broken.
     */
    private static _addShadowCalcReadout(light: DirectLight | PointLight | SpotLight) {
        const isDirect = light instanceof DirectLight;
        const readout: any = {};
        const rows: { key: string; step: number }[] = [];
        const addRO = (key: string, getter: () => number, step = 1e-6) => {
            Object.defineProperty(readout, key, {
                enumerable: true,
                get: getter,
                set: () => { /* read-only: next frame's listen() poll resets the input */ },
            });
            rows.push({ key, step });
        };
        if (isDirect) {
            const dl = light as DirectLight;
            addRO('calc_mapWidth', () => dl.shadowMapWidth, 1);
            addRO('calc_extent', () => {
                const cam = (dl.enableCSM && dl.csmShadowCamera?.length ? dl.csmShadowCamera[0] : dl.shadowCamera);
                return cam ? (cam.right - cam.left) : 0;
            }, 0.001);
            addRO('calc_depthRange', () => {
                const cam = (dl.enableCSM && dl.csmShadowCamera?.length ? dl.csmShadowCamera[0] : dl.shadowCamera);
                return cam ? (cam.far - cam.near) : 0;
            }, 0.001);
            addRO('calc_texelSize', () => {
                const cam = (dl.enableCSM && dl.csmShadowCamera?.length ? dl.csmShadowCamera[0] : dl.shadowCamera);
                if (!cam) return 0;
                return (cam.right - cam.left) / Math.max(dl.shadowMapWidth || 1, 1);
            });
            addRO('calc_formulaBias', () => {
                const cam = (dl.enableCSM && dl.csmShadowCamera?.length ? dl.csmShadowCamera[0] : dl.shadowCamera);
                if (!cam) return 0;
                const extent = cam.right - cam.left;
                const depth = Math.max(cam.far - cam.near, 1e-6);
                const texel = extent / Math.max(dl.shadowMapWidth || 1, 1);
                return (texel * 1.5) / depth;
            });
        } else {
            const pl = light as PointLight | SpotLight;
            addRO('calc_mapSize', () => {
                return pl.transform.view3D?.engine3D?.setting.shadow.pointShadowSize ?? 0;
            }, 1);
            addRO('calc_range', () => pl.lightData.range ?? 0, 0.001);
            // Live view of the shadowFar actually sent to the GPU — reflects
            // the shadowCameraFar override (or range if 0 = auto). Lets the
            // user confirm their GUI slider change took effect.
            addRO('calc_shadowFar', () => pl.lightData.shadowFar ?? 0, 0.001);
            addRO('calc_texelSize', () => {
                const size = pl.transform.view3D?.engine3D?.setting.shadow.pointShadowSize ?? 1;
                return (2 * (pl.lightData.range || 1)) / Math.max(size, 1);
            });
            addRO('calc_formulaBias', () => {
                const size = pl.transform.view3D?.engine3D?.setting.shadow.pointShadowSize ?? 1;
                const texel = (2 * (pl.lightData.range || 1)) / Math.max(size, 1);
                return texel * 0.25;
            });
        }
        for (const row of rows) GUIHelp.add(readout, row.key).step(row.step).listen();
    }

    /**
     * Draw a wireframe representation of a point / spot light's shadow-affected
     * volume. Installed via light.bindOnChange so it tracks position changes.
     * Cleared when `debugShadowRange` is toggled off.
     */
    public static refreshPointLightDebug(light: PointLight | SpotLight, open: boolean = true) {
        const debugId = `PointLight_${light.object3D.instanceID}`;
        this._clearDebugPointLight(light, debugId);
        if (!light.debugShadowRange) {
            light.bindOnChange = null;
            return;
        }
        light.bindOnChange = () => {
            if (!(light.object3D && light.transform.view3D && light.transform.view3D.scene)) return;
            let g = light.transform.view3D.scene.getChildByName('graphic3D') as Graphic3D;
            if (!g) { g = new Graphic3D(); light.transform.view3D.scene.addChild(g); }
            this._clearDebugPointLight(light, debugId);
            const pos = light.transform.worldPosition;
            g.drawAxis(debugId, pos, 10);
            if (light instanceof SpotLight) {
                // Cone: apex at light pos, axis along light.direction, opening
                // at half of outerAngle, extending `range` as the slant length.
                const axis = new Vector3().copy(light.lightData.direction);
                axis.normalize();
                const slant = light.lightData.range;
                const halfRad = (light.outerAngle * 0.5) * Math.PI / 180;
                const baseDist = slant * Math.cos(halfRad);
                const baseR = slant * Math.sin(halfRad);
                const baseCenter = new Vector3(pos.x + axis.x * baseDist, pos.y + axis.y * baseDist, pos.z + axis.z * baseDist);
                // Two axes in the plane perpendicular to `axis` for radial rays.
                const helper = Math.abs(axis.y) > 0.9 ? Vector3.X_AXIS : Vector3.Y_AXIS;
                const perpA = new Vector3();
                const perpB = new Vector3();
                Vector3.cross(axis, helper, perpA); perpA.normalize();
                Vector3.cross(axis, perpA, perpB); perpB.normalize();
                const p = (a: number, b: number) => new Vector3(
                    baseCenter.x + perpA.x * baseR * a + perpB.x * baseR * b,
                    baseCenter.y + perpA.y * baseR * a + perpB.y * baseR * b,
                    baseCenter.z + perpA.z * baseR * a + perpB.z * baseR * b,
                );
                g.drawCircle(`${debugId}_base`, baseCenter, baseR, 48, axis, light.lightColor);
                g.drawLines(`${debugId}_ray0`, [pos, p(1, 0)], light.lightColor);
                g.drawLines(`${debugId}_ray1`, [pos, p(-1, 0)], light.lightColor);
                g.drawLines(`${debugId}_ray2`, [pos, p(0, 1)], light.lightColor);
                g.drawLines(`${debugId}_ray3`, [pos, p(0, -1)], light.lightColor);
            } else {
                // PointLight: three orthogonal great circles approximate the range sphere.
                g.drawCircle(`${debugId}_cx`, pos, light.lightData.range, 48, Vector3.X_AXIS, light.lightColor);
                g.drawCircle(`${debugId}_cy`, pos, light.lightData.range, 48, Vector3.Y_AXIS, light.lightColor);
                g.drawCircle(`${debugId}_cz`, pos, light.lightData.range, 48, Vector3.Z_AXIS, light.lightColor);
            }

            // Cube-shadow near/far cross-sections. The cube camera's depth is
            // `length(worldPos - lightPos) / shadowFar`, so radially the
            // clip volume is a sphere of radius `near` (clipped inward) and
            // `shadowCameraFar || range` (clipped outward). Draw three
            // orthogonal great circles for each — green=near, red=far —
            // so dragging the sliders in dat.gui gives a live bound.
            const lAny = light as any;
            const near: number = lAny.shadowCameraNear;
            const farOverride: number = lAny.shadowCameraFar;
            const farActual = (farOverride && farOverride > 0) ? farOverride : light.lightData.range;
            const nearColor = new Color(0, 1, 1, 1);  // cyan
            const farColor = new Color(1, 0, 0, 1);   // red
            if (near && near > 0.01) {
                g.drawCircle(`${debugId}_near_x`, pos, near, 48, Vector3.X_AXIS, nearColor);
                g.drawCircle(`${debugId}_near_y`, pos, near, 48, Vector3.Y_AXIS, nearColor);
                g.drawCircle(`${debugId}_near_z`, pos, near, 48, Vector3.Z_AXIS, nearColor);
            }
            if (farActual && farActual > 0) {
                g.drawCircle(`${debugId}_far_x`, pos, farActual, 48, Vector3.X_AXIS, farColor);
                g.drawCircle(`${debugId}_far_y`, pos, farActual, 48, Vector3.Y_AXIS, farColor);
                g.drawCircle(`${debugId}_far_z`, pos, farActual, 48, Vector3.Z_AXIS, farColor);
            }
        };
        light.bindOnChange();
    }

    private static _clearDebugPointLight(light: PointLight | SpotLight, debugId: string) {
        if (!(light.object3D && light.transform.view3D && light.transform.view3D.scene)) return;
        const g = light.transform.view3D.scene.getChildByName('graphic3D') as Graphic3D;
        if (!g) return;
        g.Clear(debugId);
        // Point light shapes
        g.Clear(`${debugId}_cx`);
        g.Clear(`${debugId}_cy`);
        g.Clear(`${debugId}_cz`);
        // Spot cone shapes
        g.Clear(`${debugId}_base`);
        g.Clear(`${debugId}_ray0`);
        g.Clear(`${debugId}_ray1`);
        g.Clear(`${debugId}_ray2`);
        g.Clear(`${debugId}_ray3`);
        // Cube shadow near/far spheres (3 great circles each)
        g.Clear(`${debugId}_near_x`);
        g.Clear(`${debugId}_near_y`);
        g.Clear(`${debugId}_near_z`);
        g.Clear(`${debugId}_far_x`);
        g.Clear(`${debugId}_far_y`);
        g.Clear(`${debugId}_far_z`);
    }

    public static renderGIComponent(component: GlobalIlluminationComponent, view: View3D, open: boolean = false): void {
        let volume = component['_volume'];
        let giSetting = volume.setting;
        let renderJob = view.engine3D.getRenderJob(view);
        let engine = view.engine3D;

        function onProbesChange(): void {
            component['changeProbesPosition']();
        }

        function debugProbeRay(probeIndex: number, array: Float32Array): void {
            component['debugProbeRay'](probeIndex, array);
        }

        GUIHelp.addFolder('GI');
        GUIHelp.add(giSetting, `lerpHysteresis`, 0.001, 10, 0.0001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(giSetting, `depthSharpness`, 1.0, 100.0, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(giSetting, `normalBias`, -100.0, 100.0, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(giSetting, `irradianceChebyshevBias`, -100.0, 100.0, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(giSetting, `rayNumber`, 0, 512, 1).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(giSetting, `irradianceDistanceBias`, 0.0, 200.0, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(giSetting, `indirectIntensity`, 0.0, 100.0, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(giSetting, `bounceIntensity`, 0.0, 1.0, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(giSetting, `probeRoughness`, 0.0, 1.0, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(giSetting, `ddgiGamma`, 0.0, 4.0, 0.001).onChange(() => {
            onProbesChange();
        });

        GUIHelp.add(giSetting, 'autoRenderProbe');
        open && GUIHelp.open();
        GUIHelp.endFolder();

        GUIHelp.addFolder('probe volume');
        GUIHelp.add(volume.setting, 'probeSpace', 0.1, volume.setting.probeSpace * 5, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(volume.setting, 'offsetX', -100, 100, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(volume.setting, 'offsetY', -100, 100, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.add(volume.setting, 'offsetZ', -100, 100, 0.001).onChange(() => {
            onProbesChange();
        });
        GUIHelp.addButton('show', () => {
            component.object3D.transform.enable = true;
        });
        GUIHelp.addButton('hide', () => {
            component.object3D.transform.enable = false;
        });

        let giPass = view.renderGraph?.getPass<any>('GIPass');
        GUIHelp.addButton('showRays', () => {
            if (!giPass?.irradianceComputePass) return;
            let array = giPass.irradianceComputePass['depthRaysBuffer'].readBuffer();
            let count = engine.setting.gi.probeXCount * engine.setting.gi.probeYCount * engine.setting.gi.probeZCount
            for (let j = 0; j < count; j++) {
                let probeIndex = j;
                debugProbeRay(probeIndex, array);
            }
            debugProbeRay(0, array);
        });

        GUIHelp.addButton('hideRays', () => {
            let count = engine.setting.gi.probeXCount * engine.setting.gi.probeYCount * engine.setting.gi.probeZCount
            for (let j = 0; j < count; j++) {
                let probeIndex = j;
                const rayNumber = engine.setting.gi.rayNumber;
                for (let i = 0; i < rayNumber; i++) {
                    let id = `showRays${probeIndex}${i}`;
                    (view as any).graphic3D?.Clear(id);
                }
            }
        });
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    //render uv move component
    public static renderUVMove(component: UVMoveComponent, open: boolean = false, name?: string) {
        name ||= 'UV Move';
        GUIHelp.addFolder(name);
        GUIHelp.add(component.speed, 'x', -1, 1, 0.01);
        GUIHelp.add(component.speed, 'y', -1, 1, 0.01);
        GUIHelp.add(component.speed, 'z', 0.1, 10, 0.01);
        GUIHelp.add(component.speed, 'w', 0.1, 10, 0.01);
        GUIHelp.add(component, 'enable');

        open && GUIHelp.open();
        GUIHelp.endFolder();
    }


    static renderDebug(view: View3D, open: boolean = false) {
        GUIHelp.removeFolder(`RenderPerformance`);
        //debug
        let f = GUIHelp.addFolder('RenderPerformance');
        let renderJob = view.engine3D.getRenderJob(view);
        let engine = view.engine3D;
        let debugChanel = {
            PositionView: 0,
            ColorView: 1,
            normalView: 2,
            IrradianceView: 3,
            tangentView: 4,
            FinalView: 5,
            EmissiveView: 6,
            specularRadiance: 7,
            AO: 8,
            Roughness: 9,
            Metallic: 10,
            diffuse: 11,
            ambient: 12,
            meshID: 13,
            debugCluster: 14,
            debugClusterBox: 15,
            debugClusterLightCount: 16,
        }
        GUIHelp.add(engine.setting.render, 'renderState_left', debugChanel);
        GUIHelp.add(engine.setting.render, 'renderState_right', debugChanel);
        GUIHelp.add(engine.setting.render, 'renderState_split', 0.0, 2048, 0.001);
        GUIHelp.add(engine.setting.render, 'drawOpMin', 0.0, 10000, 1);
        GUIHelp.add(engine.setting.render, 'drawOpMax', 0.0, 10000, 1);
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    static renderLitMaterial(mat: LitMaterial, open: boolean = false) {
        GUIHelp.addFolder(mat.name);
        GUIHelp.addColor(mat, 'baseColor').onChange((c) => {
            mat.baseColor = c;
        });

        GUIHelp.add(mat.baseColor, 'a').onChange((v) => {
            let color = mat.baseColor;
            color.a = v;
            mat.baseColor = color;
        });

        let blendMode = {
            NONE: BlendMode.NONE,
            NORMAL: BlendMode.NORMAL,
            ADD: BlendMode.ADD,
            ALPHA: BlendMode.ALPHA,
        }
        // change blend mode by click dropdown box
        GUIHelp.add({ blendMode: mat.blendMode }, 'blendMode', blendMode).onChange((v) => {
            mat.blendMode = BlendMode[BlendMode[parseInt(v)]];
        });

        GUIHelp.add(mat, 'alphaCutoff', 0.0, 1.0, 0.0001).onChange((v) => {
            mat.alphaCutoff = v;
        });

        GUIHelp.add(mat, 'doubleSide').onChange((v) => {
            mat.doubleSide = v;
        });

        GUIHelp.add(mat, 'roughness', 0.0, 1.0, 0.0001).onChange((v) => {
            mat.roughness = v;
        });

        GUIHelp.add(mat, 'metallic', 0.0, 1.0, 0.0001).onChange((v) => {
            mat.metallic = v;
        });

        GUIHelp.addColor(mat, 'clearcoatColor').onChange((c) => {
            mat.clearcoatColor = c;
        });

        GUIHelp.add(mat, 'clearcoatFactor', 0.0, 1.0, 0.0001).onChange((v) => {
            mat.clearcoatFactor = v;
        });

        GUIHelp.add(mat, 'clearcoatRoughnessFactor', 0.0, 1.0, 0.0001).onChange((v) => {
            mat.clearcoatRoughnessFactor = v;
        });

        GUIHelp.add(mat, 'ior', 1.0, 4.0, 0.0001).onChange((v) => {
            mat.ior = v;
        });

        GUIHelp.add(mat, 'castShadow');
        GUIHelp.add(mat, 'acceptShadow');
        open && GUIHelp.open();

        GUIHelp.endFolder();
    }

    public static blendShape(obj: Object3D) {
        GUIHelp.addFolder('morph controller');
        // register MorphTargetBlender component
        let blendShapeComponent = obj.addComponent(MorphTargetBlender);
        let targetRenderers = blendShapeComponent.cloneMorphRenderers();

        let influenceData = {};
        // bind influenceData to gui
        for (let key in targetRenderers) {
            influenceData[key] = 0.0;
            GUIHelp.add(influenceData, key, 0, 1, 0.01).onChange((v) => {
                influenceData[key] = v;
                let list = blendShapeComponent.getMorphRenderersByKey(key);
                for (let renderer of list) {
                    renderer.setMorphInfluence(key, v);
                }
            });
        }

        GUIHelp.open();
        GUIHelp.endFolder();
    }

    public static renderBlendShape(obj: Object3D, open: boolean = false) {
        GUIHelp.addFolder('morph controller');
        // register MorphTargetBlender component
        let blendShapeComponents = obj.getComponents(SkinnedMeshRenderer2);
        let targetRenderers = null;
        for (let ii = 0; ii < blendShapeComponents.length; ii++) {
            if (blendShapeComponents[ii].geometry.blendShapeData) {
                targetRenderers = blendShapeComponents[ii].geometry.blendShapeData.shapeNames;
            }
        }

        if (targetRenderers) {
            let influenceData = {};
            // bind influenceData to gui
            for (let i in targetRenderers) {
                let key = targetRenderers[i];
                influenceData[key] = 0.0;
                GUIHelp.add(influenceData, key, 0, 1, 0.01).onChange((v) => {
                    influenceData[key] = v;
                    for (let index = 0; index < blendShapeComponents.length; index++) {
                        for (let renderer of blendShapeComponents) {
                            renderer.setMorphInfluence(key, v);
                        }
                    }
                });
            }
        }

        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    static renderAnimator(com: AnimatorComponent, open: boolean = false) {
        let anim = {}
        for (let i = 0; i < com.clips.length; i++) {
            const clip = com.clips[i];
            anim[clip.clipName] = clip.clipName;
        }

        GUIHelp.addFolder('morph controller');

        GUIHelp.add({ anim: anim }, 'anim', anim).onChange((v) => {
            com.playAnim(v);
            com.playBlendShape(v);
        });
        open && GUIHelp.open();
        GUIHelp.endFolder();

    }


    public static renderGTAO(post: GTAOPost, open: boolean = false) {
        GUIHelp.addFolder("GTAO");
        GUIHelp.add(post, "maxDistance", 0.0, 149, 1);
        GUIHelp.add(post, "maxPixel", 0.0, 150, 1);
        GUIHelp.add(post, "rayMarchSegment", 0.0, 50, 0.001);
        GUIHelp.add(post, "darkFactor", 0.0, 5, 0.001);
        GUIHelp.add(post, "blendColor");
        GUIHelp.add(post, "multiBounce");
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    public static renderTAA(post: TAAPost, open: boolean = false) {
        GUIHelp.addFolder("TAA");
        GUIHelp.add(post, "jitterSeedCount", 2, 8, 1);
        GUIHelp.add(post, "blendFactor", 0.0, 1.0, 0.01);
        GUIHelp.add(post, "sharpFactor", 0.1, 0.9, 0.01);
        GUIHelp.add(post, "sharpPreBlurFactor", 0.1, 0.9, 0.01);
        GUIHelp.add(post, "temporalJitterScale", 0.0, 1.0, 0.01);
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    static renderDepthOfField(post: DepthOfFieldPost, open: boolean = false) {
        GUIHelp.addFolder("DOFPost");
        GUIHelp.add(post, 'near', 0, 100, 1)
        GUIHelp.add(post, 'far', 150, 300, 1)
        GUIHelp.add(post, 'pixelOffset', 0.0, 15, 1)
        open && GUIHelp.open();
        GUIHelp.endFolder();
    }

    static RenderColor(target: Object, name: string) {
        GUIHelp.addColor(target, name).onChange(c => {
            target[name] = c;
        })
    }

    static RenderVector4(label: string, target: Object, key: string, min: number, max: number, step: number = 0.01) {
        let components = ['x', 'y', 'z', 'w'];
        let data = {};
        let vec4: Vector4 = target[key];
        for (let component of components) {
            data[label + component] = vec4[component];
            GUIHelp.add(data, label + component, min, max, step).onChange(v => {
                vec4[component] = v;
                target[key] = vec4;
            });

        }
    }

    static RenderVector2(label: string, target: Object, key: string, min: number, max: number, step: number = 0.01) {
        let keys = ['x', 'y'];
        let data = {};
        let vec2: Vector2 = target[key];
        for (let component of keys) {
            data[label + component] = vec2[component];
            GUIHelp.add(data, label + component, min, max, step).onChange(v => {
                vec2[component] = v;
                target[key] = vec2;
            });

        }
    }
}