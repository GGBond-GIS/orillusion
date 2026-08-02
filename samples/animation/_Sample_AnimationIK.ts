/**
 * Skinned-mesh IK demo — CCD IK on a character arm chain targeting a
 * moving sphere.
 *
 * Loads `kira.glb` (Mixamo's Kira character + bedroom scene), runs CCD IK on
 * her left arm chain so `hand_l` reaches the world position of the moving
 * sphere.
 *
 * GUI layout (no folders, all root-level toggles):
 *   - followSphere : the orbit camera target snaps to the moving sphere
 *   - turnHead     : the `head` bone tracks (look-at) the sphere
 *   - ik_solver    : auto-update IK every frame
 *   - update       : button — manually solve IK once
 */
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    Object3D, Scene3D, Engine3D, AtmosphericComponent, CameraUtil,
    HoverCameraController, View3D, DirectLight, KelvinUtil, Time,
    AnimatorComponent, CCDIK, LitMaterial,
    PostProcessingComponent, FXAAPost, MeshRenderer, SphereGeometry,
    UnLitMaterial, Color, Vector3, Quaternion,
    AxisObject, Matrix4,
} from "@orillusion/core";
import { Graphic3D } from "@orillusion/graphic";

class Sample_AnimationIK {
    engine: Engine3D;
    scene: Scene3D;
    light: Object3D;
    animator: AnimatorComponent;
    sphere: Object3D;
    headBone: Object3D;
    kiraNode: Object3D;
    ikSolver: CCDIK;
    cameraCtrl: HoverCameraController;
    private _gfx: Graphic3D;
    private _boneNodes: Object3D[] = [];
    // Captured once at bind so the orbit doesn't feed back into IK
    private _orbitAnchor: { x: number; y: number; z: number } | null = null;

    followSphere = false;
    turnHead = false;
    ik_solver = true;
    /** Auto-orbit the IK target with cos/sin offsets in onTick. When off,
     *  target_hand_l.localPosition is driven directly from the GUI sliders. */
    autoOrbit = false;

    private _lookDir = new Vector3();
    private _lookQWorld = new Quaternion();
    private _lookQLocal = new Quaternion();
    private _lookParentInvW = new Quaternion();
    private _lookParentW = new Quaternion();
    private _lookComposeTmp = new Quaternion();

    // IK target bone (`target_hand_l`) — the dummy bone driven directly
    // by the gizmo / sliders.
    //
    // GUI sliders bind to `_targetWorldOffset` — a WORLD-space delta
    // applied on top of `_targetWorldBase` (the bind-pose worldPosition
    // of target_hand_l, captured once at init). Sliders show an offset
    // around 0 ⇒ no movement; +x = move target 1m right in world, etc.
    // Each frame we sum base + offset + (optional cos/sin orbit), then
    // project that world point into target_hand_l.parent's local frame
    // and write to localPosition; CCDIK reads back worldPosition.
    private _ikTargetBone: Object3D | null = null;
    private _targetWorldBase = new Vector3();      // bind-pose worldPos, fixed
    private _targetWorldOffset = new Vector3();    // GUI-controlled offset, default (0,0,0)
    private _invParentMat: Matrix4 | null = null;  // lazy: needs wasm
    private _tmpVec = new Vector3();
    /** Visualizer for the IK target world position (base + offset, no orbit). */
    private _targetMarker: Object3D | null = null;

    // Mouse trace recorder — toggle with Enter
    private _recording = false;
    private _recordStart = 0;
    private _records: { t: number; x: number; y: number }[] = [];

    async run() {
        const engine = this.engine = await Engine3D.init({
            renderLoop: () => this.onTick(),
            setting: { shadow: { autoUpdate: true, updateFrameRate: 1, shadowSize: 2048 } },
        });
        this.scene = new Scene3D();
        const sky = this.scene.addComponent(AtmosphericComponent);

        this.scene.addChild(new AxisObject(1, 0.005));

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(45, engine.aspect, 0.1, 100);
        this.cameraCtrl = camera.object3D.addComponent(HoverCameraController);
        // Wide view showing full body so detached skinned meshes are visible
        this.cameraCtrl.setCamera(0, -10, 4, new Vector3(2.14, 0.5, -0.24));
        this.cameraCtrl.maxDistance = 30;

        const view = new View3D();
        view.scene = this.scene;
        view.camera = camera;

        // Graphic3D must be in the scene BEFORE startRenderView so its
        // line-batch RenderNode is registered with the render queue.
        this._gfx = new Graphic3D();
        this.scene.addChild(this._gfx);

        engine.startRenderView(view);

        const post = this.scene.addComponent(PostProcessingComponent);
        post.addPost(FXAAPost);

        await this.initScene();
        sky.relativeTransform = this.light.transform;
    }

    async initScene() {
        GUIHelp.init();

        const kiraRoot = await this.engine.res.loadGltf('gltfs/glb/kira.glb');
        this.scene.addChild(kiraRoot);

        // // Hide every top-level child of kiraRoot except the "Kira" node —
        // // disables all bedroom furniture renderers but leaves Kira (and
        // // her skeleton/IK target) intact.
        // for (const child of kiraRoot.entityChildren as Object3D[]) {
        //     if (child.name === 'Kira' || child.name === 'boule') continue;
        //     for (const r of child.getComponentsInChild(MeshRenderer)) r.enable = false;
        // }
        // Grab the Kira node for the GUI transform controls. Walk recursively
        // since getObjectByName is non-recursive and Kira sits inside the
        // gltf wrapper hierarchy.
        const findRecKira = (root: Object3D, name: string): Object3D | null => {
            if (root.name === name) return root;
            for (const c of (root.entityChildren ?? []) as Object3D[]) {
                const r = findRecKira(c, name);
                if (r) return r;
            }
            return null;
        };
        this.kiraNode = (findRecKira(kiraRoot, 'Kira') ?? kiraRoot) as Object3D;

        // Collect every bone Object3D under "Kira" — that's spine_03 and
        // its descendants (skeleton tree only; mesh-holder children of
        // Kira are skipped). We render parent→child line segments each
        // frame from these to visualize the live skeleton pose.
        // `getObjectByName` is non-recursive (calls `getChildByName(name, false)`)
        // and only scans direct entityChildren — spine_03 is nested deep
        // inside the Kira node, so we walk recursively.
        const findRec = (root: Object3D, name: string): Object3D | null => {
            if (root.name === name) return root;
            for (const c of (root.entityChildren ?? []) as Object3D[]) {
                const r = findRec(c, name);
                if (r) return r;
            }
            return null;
        };
        const spineRoot = findRec(kiraRoot, 'spine_03');
        if (spineRoot) {
            const collect = (o: Object3D) => {
                this._boneNodes.push(o);
                for (const c of (o.entityChildren ?? []) as Object3D[]) collect(c);
            };
            collect(spineRoot);
        }
        // (_gfx is already created in run() before startRenderView)

        this.light = new Object3D();
        this.light.y = 8; this.light.z = 5;
        this.light.rotationX = 144;
        const dl = this.light.addComponent(DirectLight);
        dl.lightColor = KelvinUtil.color_temperature_to_rgb(5800);
        dl.castShadow = true; dl.intensity = 2.5;
        dl.shadowBoundFar = 30;
        this.scene.addChild(this.light);

        const animators = kiraRoot.getComponentsInChild(AnimatorComponent);
        if (animators.length > 0) this.animator = animators[0];

        // PROBE Kira_Shirt.0020 vertex joint usage histogram —
        // does any vertex reference target_hand_l (index 22 in skin.joints)?
        const findShirt = (root: Object3D, name: string): Object3D | null => {
            if (root.name === name) return root;
            for (const c of (root.entityChildren ?? []) as Object3D[]) {
                const r = findShirt(c, name);
                if (r) return r;
            }
            return null;
        };
        const shirtNode = findShirt(kiraRoot, 'Kira_Shirt.0020');
        if (shirtNode) {
            const stack = [shirtNode];
            let smr: any = null;
            while (stack.length) {
                const cur = stack.pop()!;
                const comps = (cur as any).components;
                if (comps?.values) {
                    for (const c of comps.values()) {
                        if ((c as any)?.constructor?.name === 'SkinnedMeshRenderer2') { smr = c; break; }
                    }
                }
                if (smr) break;
                for (const ch of (cur.entityChildren ?? []) as Object3D[]) stack.push(ch);
            }
            if (smr) {
                const skinNames: string[] = smr.skinJointsName ?? [];
                console.log(`[shirt-probe] '${shirtNode.name}' skinJointsName count=${skinNames.length}`);
                console.log(`  joint[22]='${skinNames[22] ?? '<oob>'}'  joint[0]='${skinNames[0]}'`);
                const geom = smr.geometry;
                const j0Attr = geom?.getAttribute?.('joints0');
                const w0Attr = geom?.getAttribute?.('weights0');
                if (j0Attr?.data && w0Attr?.data) {
                    const j = j0Attr.data;
                    const w = w0Attr.data;
                    const vCount = j.length / 4;
                    // 1) per-vertex weight-sum sanity check
                    let nFar = 0, nZero = 0;
                    let minSum = Infinity, maxSum = -Infinity;
                    let firstFar: number = -1;
                    const farSample: { v: number; sum: number; j: number[]; w: number[] }[] = [];
                    for (let v = 0; v < vCount; v++) {
                        let s = 0;
                        for (let k = 0; k < 4; k++) s += w[v * 4 + k];
                        if (s < minSum) minSum = s;
                        if (s > maxSum) maxSum = s;
                        if (s === 0) nZero++;
                        if (Math.abs(s - 1) > 0.01 && s !== 0) {
                            nFar++;
                            if (firstFar < 0) firstFar = v;
                            if (farSample.length < 5) farSample.push({
                                v, sum: s,
                                j: [j[v*4]|0, j[v*4+1]|0, j[v*4+2]|0, j[v*4+3]|0],
                                w: [w[v*4], w[v*4+1], w[v*4+2], w[v*4+3]],
                            });
                        }
                    }
                    // Bucket the remaining farFromOne by sum range
                    let near0 = 0, between = 0;
                    for (let v = 0; v < vCount; v++) {
                        let s = 0;
                        for (let k = 0; k < 4; k++) s += w[v * 4 + k];
                        if (Math.abs(s - 1) > 0.01 && s !== 0) {
                            if (s < 1e-3) near0++; else between++;
                        }
                    }
                    console.log(`[shirt-probe] vCount=${vCount} weightSum range=[${minSum.toFixed(4)}, ${maxSum.toFixed(4)}] zeroSum=${nZero} farFromOne=${nFar} (sum<1e-3: ${near0}, otherwise: ${between})`);
                    for (const fs of farSample) {
                        console.log(`  v=${fs.v} sum=${fs.sum.toFixed(4)} j=[${fs.j.join(',')}] w=[${fs.w.map(x=>x.toFixed(3)).join(',')}]`);
                    }
                }
            }
        }


        this.sphere = kiraRoot.getObjectByName('boule') as Object3D;
        if (!this.sphere) {
            console.error('Kira GLTF is missing the boule mesh (IK target sphere) — falling back to a local one');
        } else {
            // The boule-mesh node ("Sphere.0030") gets `enable = false`
            // from the GLTF converter for skin-referencing primitives
            // without joints attributes (see GLTFSubParserConverter line
            // ~456). Mixamo authored boule under the same skin as
            // Kira's body but it has no per-vertex joint weights, so
            // the loader silently disables it (the standard
            // skinned-mesh-collapse behaviour). For the IK demo we need
            // it visible, so re-enable here AND replace the GLB-default
            // material with a fresh LitMaterial set to a bright orange
            // emissive — the GLB default material is white PBR, almost
            // invisible against the busy bedroom backdrop. Use a freshly
            // constructed LitMaterial (not a clone of the loaded one)
            // so the full PBR uniform set is guaranteed present —
            // PassGenerate.castGBufferPass requires baseColor /
            // envIntensity / emissiveColor / ..., and a missing one
            // crashes (see UnLitMaterial regression earlier in this file).
            const sphereMat = new LitMaterial();
            sphereMat.baseColor = new Color(1.0, 0.35, 0.1, 1);
            sphereMat.emissiveColor = new Color(1.0, 0.35, 0.1, 1);
            sphereMat.emissiveIntensity = 1.5;
            for (const r of this.sphere.getComponentsInChild(MeshRenderer)) {
                r.enable = true;
                r.material = sphereMat;
            }
        }

        if (this.animator) {
            this.headBone = this.animator.getJointObject('head') as Object3D;
            const handBone = this.animator.getJointObject('hand_l');
            if (handBone) {
                const wp = handBone.transform.worldPosition;
                this._orbitAnchor = { x: wp.x, y: wp.y, z: wp.z };
                // Park the IK target sphere AT the bind-pose hand
                // position so the rest pose is anatomically natural —
                // arm hangs at the side instead of resting at chair
                // armrest's authored mesh location.
                // this.sphere.x = wp.x;
                // this.sphere.y = wp.y;
                // this.sphere.z = wp.z;
            }
            // IK chain config:
            //   target   = target_hand_l   (a dummy bone parented at the
            //                                wrist; we drag this around to
            //                                tell IK where the hand should
            //                                go — it does NOT participate
            //                                in skinning)
            //   effector = hand_l           (the bone we measure distance
            //                                from; CCD never rotates it)
            //   links    = [lowerarm_l, Upperarm_l]   (tip→root order,
            //                                the common IK convention; only
            //                                these two bones get rotated)
            const targetHandL = this.animator.getJointObject('target_hand_l');
            this._ikTargetBone = targetHandL;
            if (targetHandL) {
                // Capture the bind-pose WORLD position as the immovable
                // base — GUI sliders modify the offset around it.
                const wp = targetHandL.transform.worldPosition;
                this._targetWorldBase.set(wp.x, wp.y, wp.z);
                this._targetWorldOffset.set(0, 0, 0);
                this._invParentMat = new Matrix4();   // wasm-backed; needs Engine3D inited

                // Spawn a small marker sphere at the IK target world
                // position (base + offset, NOT including the cos/sin
                // orbit). It's parented to the scene root so its
                // worldPosition equals what we write to .x/.y/.z each
                // frame in onTick. Distinct cyan emissive so it's
                // unmistakable next to the orange `boule`.
                this._targetMarker = new Object3D();
                this._targetMarker.name = 'ik-target-marker';
                const mr = this._targetMarker.addComponent(MeshRenderer);
                mr.geometry = new SphereGeometry(0.04, 16, 16);
                const markerMat = new LitMaterial();
                markerMat.baseColor = new Color(0.1, 0.7, 1.0, 1);
                markerMat.emissiveColor = new Color(0.1, 0.7, 1.0, 1);
                markerMat.emissiveIntensity = 1.5;
                mr.material = markerMat;
                this.scene.addChild(this._targetMarker);
                // Place at initial base position (offset = 0).
                this._targetMarker.x = this._targetWorldBase.x;
                this._targetMarker.y = this._targetWorldBase.y;
                this._targetMarker.z = this._targetWorldBase.z;
            }

            // Attach sphere under hand_l so it tracks the solved hand pose.
            // We must preserve sphere's worldPosition across the reparent —
            // Orillusion's addChild is a plain hierarchy splice that leaves
            // localPos unchanged, so we compute the new local from the
            // current worldPos in hand_l's frame and write it back.
            if (handBone && this.sphere) {
                const sphereWp = this.sphere.transform.worldPosition;
                const invHandWorld = new Matrix4();
                invHandWorld.copy(handBone.transform.worldMatrix);
                invHandWorld.invert();
                Matrix4.multiplyPoint3(invHandWorld, sphereWp, this._tmpVec);
                handBone.addChild(this.sphere);
                this.sphere.localPosition = this._tmpVec;
            }
            this.ikSolver = new CCDIK({
                name: 'leftArm',
                effector: 'hand_l',
                target: targetHandL,
                links: [
                    {
                        boneName: 'lowerarm_l',
                        rotationMin: new Vector3(1.2, -1.8, -0.4),
                        rotationMax: new Vector3(1.7, -1.1, 0.3),
                        radians: true,
                    },
                    {
                        boneName: 'Upperarm_l',
                        rotationMin: new Vector3(0.1, -0.7, -1.8),
                        rotationMax: new Vector3(1.1, 0.0, -1.4),
                        radians: true,
                    },
                ],
                iterations: 10,
                damping: 1.0,
                threshold: 0.005,
                weight: this.ik_solver ? 1.0 : 0.0,
            });
            this.animator.addIK(this.ikSolver);
            // DEBUG: log first few solve() calls
            (this.ikSolver as any)._dbg = true;
            setTimeout(() => { (this.ikSolver as any)._dbg = false; }, 250);
        }

        this._buildGUI();
        this._installMouseRecorder();
        // Expose for external replay/automation harnesses.
        (window as any).__sample = this;
        return true;
    }

    /**
     * Press Space to start recording mouse moves; press Space again to stop
     * and trigger a JSON file download. The file is named
     * `mouse-trace-<ts>.json` and contains `{ t, x, y }` per sample, where
     * `t` is ms since recording started and `x/y` are clientX/Y.
     */
    private _installMouseRecorder() {
        const hud = document.createElement('div');
        hud.style.cssText = [
            'position:fixed', 'top:8px', 'left:50%', 'transform:translateX(-50%)',
            'padding:6px 14px', 'background:rgba(0,0,0,0.65)', 'color:#fff',
            'font:13px/1.4 monospace', 'border-radius:4px', 'pointer-events:none',
            'z-index:99999', 'user-select:none',
        ].join(';');
        hud.textContent = 'Press [Space] to record mouse';
        document.body.appendChild(hud);

        window.addEventListener('mousemove', (e: MouseEvent) => {
            if (!this._recording) return;
            this._records.push({
                t: performance.now() - this._recordStart,
                x: e.clientX,
                y: e.clientY,
            });
        });

        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            // Don't intercept Space inside text inputs.
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            e.preventDefault();
            if (!this._recording) {
                this._records.length = 0;
                this._recordStart = performance.now();
                this._recording = true;
                hud.textContent = 'REC ●  (Space to stop)';
                hud.style.background = 'rgba(180,30,30,0.85)';
                console.log('[mouse-rec] started');
            } else {
                this._recording = false;
                const n = this._records.length;
                const dur = (performance.now() - this._recordStart) / 1000;
                hud.textContent = `exported ${n} samples / ${dur.toFixed(2)}s — Space to record again`;
                hud.style.background = 'rgba(0,0,0,0.65)';
                this._downloadJson(this._records, dur);
                console.log(`[mouse-rec] stopped — ${n} samples in ${dur.toFixed(2)}s — JSON downloaded`);
            }
        });
    }

    private _downloadJson(records: { t: number; x: number; y: number }[], durationSec: number) {
        const payload = {
            recordedAt: new Date().toISOString(),
            durationMs: Math.round(durationSec * 1000),
            sampleCount: records.length,
            samples: records,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const a = document.createElement('a');
        a.href = url;
        a.download = `mouse-trace-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke shortly after the click — the browser has already started
        // serving the blob, and holding the URL forever leaks memory.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    private _buildGUI() {
        GUIHelp.add(this, 'followSphere').name('follow sphere');
        GUIHelp.add(this, 'turnHead').name('turn head');
        GUIHelp.add(this, 'ik_solver').name('IK auto update').onChange((v: boolean) => {
            if (this.ikSolver) this.ikSolver.weight = v ? 1.0 : 0.0;
        });
        GUIHelp.addButton('update', () => {
            if (this.animator && this.ikSolver) this.ikSolver.solve(this.animator);
        });
        this._buildIKTargetGUI();
        this._buildLightGUI();
    }

    /**
     * Slider control for the IK target bone (`target_hand_l`).
     *
     * Sliders bind to `_targetWorldOffset` — a WORLD-space delta added
     * onto `_targetWorldBase` (the bind-pose worldPosition snapped at
     * init). Slider value 0 ⇒ target stays at bind position; +x = move
     * 1m right in world, etc. Each frame `onTick` sums base + offset
     * (+ optional cos/sin orbit), projects into target_hand_l.parent's
     * local frame, and writes as localPosition; CCDIK reads back
     * worldPosition.
     *
     * `auto orbit` toggle gates the cos/sin animation. When off, the
     * sliders alone determine target position relative to base.
     */
    private _buildIKTargetGUI() {
        if (!this._ikTargetBone) return;
        const off = this._targetWorldOffset;
        GUIHelp.addFolder('IK target (target_hand_l)');
        GUIHelp.add(this, 'autoOrbit').name('auto orbit');
        // Sliders are world-space *offsets* around the bind worldPos.
        // ±2 m gives ample reach for the half-arm.
        GUIHelp.add(off, 'x', -0.6, 0.6, 0.001).name('Δworld x');
        GUIHelp.add(off, 'y', -0.6, 0.6, 0.001).name('Δworld y');
        GUIHelp.add(off, 'z', -0.6, 0.6, 0.001).name('Δworld z');
        GUIHelp.endFolder();
    }

    private _buildLightGUI() {
        const dl = this.light.getComponent(DirectLight);
        const proxy = {
            intensity: dl.intensity,
            kelvin: 5800,
            castShadow: dl.castShadow,
            posY: this.light.y,
            posZ: this.light.z,
            rotX: this.light.rotationX,
            rotY: this.light.rotationY,
        };
        GUIHelp.addFolder('Light');
        GUIHelp.add(proxy, 'intensity', 0, 10, 0.1).onChange((v: number) => { dl.intensity = v; });
        GUIHelp.add(proxy, 'kelvin', 1500, 12000, 100).onChange((v: number) => {
            dl.lightColor = KelvinUtil.color_temperature_to_rgb(v);
        });
        GUIHelp.add(proxy, 'castShadow').onChange((v: boolean) => { dl.castShadow = v; });
        GUIHelp.add(proxy, 'posY', -5, 20, 0.1).onChange((v: number) => { this.light.y = v; });
        GUIHelp.add(proxy, 'posZ', -10, 10, 0.1).onChange((v: number) => { this.light.z = v; });
        GUIHelp.add(proxy, 'rotX', -180, 180, 1).onChange((v: number) => { this.light.rotationX = v; });
        GUIHelp.add(proxy, 'rotY', -180, 180, 1).onChange((v: number) => { this.light.rotationY = v; });
        GUIHelp.endFolder();
    }

    onTick() {
        // Draw skeleton lines every frame regardless of sphere/IK state.
        // this._drawBoneLines();
        if (!this.sphere) return;
        // FIXME: something inside the engine resets sphere MR.enable to
        // false after init (probably PassGenerate's gbuffer derived-pass
        // build path silently disables a renderer it can't fully wire).
        // Force-enable every frame as a temporary workaround.
        for (const r of this.sphere.getComponentsInChild(MeshRenderer)) r.enable = true;
        const t = Time.time * 0.001;

        // Drive `target_hand_l` from base + offset (+ orbit) in WORLD
        // space, then project into target_hand_l.parent's local frame
        // before writing localPosition. CCDIK reads worldPosition each
        // frame, so the round-trip is transparent — worldPosition will
        // equal (base + offset + orbit).
        if ((this.ik_solver || this.turnHead || this.followSphere) && this._ikTargetBone && this._invParentMat) {
            const base = this._targetWorldBase;
            const off = this._targetWorldOffset;
            let wx = base.x + off.x;
            let wy = base.y + off.y;
            let wz = base.z + off.z;
            // Marker tracks (base + offset) — exclude the autoOrbit
            // animation so the visualizer reflects the GUI-controlled
            // anchor, not the moment-to-moment orbital position.
            if (this._targetMarker) {
                this._targetMarker.x = wx;
                this._targetMarker.y = wy;
                this._targetMarker.z = wz;
            }
            if (this.autoOrbit) {
                wx += Math.cos(t * 0.7) * 0.025;
                wy += Math.cos(t * 0.5) * 0.18;
                wz += Math.sin(t * 0.7) * 0.25;
            }
            const parentObj = this._ikTargetBone.parent
                ? (this._ikTargetBone.parent.object3D as Object3D)
                : null;
            if (parentObj) {
                this._invParentMat.copy(parentObj.transform.worldMatrix);
                this._invParentMat.invert();
                this._tmpVec.set(wx, wy, wz);
                Matrix4.multiplyPoint3(this._invParentMat, this._tmpVec, this._tmpVec);
                this._ikTargetBone.localPosition = this._tmpVec;
            }
            if ((this as any)._dbgFrame === undefined) (this as any)._dbgFrame = 0;
            (this as any)._dbgFrame++;
            if ((this as any)._dbgFrame === 60) {
                const swp = this.sphere.transform.worldPosition;
                const hwp = this.animator.getJointObject('hand_l')?.transform.worldPosition;
                const sphereMrs = this.sphere.getComponentsInChild(MeshRenderer);
                console.log(`[sphere-debug] sphere wp=(${swp.x.toFixed(3)},${swp.y.toFixed(3)},${swp.z.toFixed(3)}) hand_l wp=(${hwp?.x.toFixed(3)},${hwp?.y.toFixed(3)},${hwp?.z.toFixed(3)})`);
                console.log(`  sphere parent='${(this.sphere.parent?.object3D as any)?.name ?? '<empty>'}' children=${(this.sphere.entityChildren ?? []).length}`);
                for (const mr of sphereMrs) {
                    console.log(`  mr on='${mr.object3D.name}' enable=${mr.enable} materials.len=${mr.materials?.length} mat[0]ctor=${mr.materials?.[0]?.constructor?.name} hasShader=${!!mr.materials?.[0]?.shader} hasGetUniform=${typeof (mr.materials?.[0] as any)?.getUniform === 'function'}`);
                }
            }
        }

        if (this.turnHead && this.headBone) {
            const headWp = this.headBone.transform.worldPosition;
            const sphWp = this.sphere.transform.worldPosition;
            this._lookDir.set(sphWp.x - headWp.x, sphWp.y - headWp.y, sphWp.z - headWp.z);
            const len = this._lookDir.length;
            if (len > 1e-4) {
                this._lookDir.set(this._lookDir.x / len, this._lookDir.y / len, this._lookDir.z / len);
                // Mixamo head bone's "face forward" is its local +Z, but
                // because of the 90° rotation Mixamo bakes into the upper
                // chain (Kira node has localQ = (0.5, -0.5, 0.5, 0.5)),
                // building yaw from atan2(x, z) and applying it as world
                // rotation makes the back of the head face the target.
                // Fix: build lookAt yaw, then flip by π so the face
                // (rather than the back of the head) leads.
                const ang = Math.atan2(this._lookDir.x, this._lookDir.z) + Math.PI;
                this._lookQWorld.set(0, Math.sin(ang * 0.5), 0, Math.cos(ang * 0.5));
                const parentObj = this.headBone.parent ? (this.headBone.parent.object3D as Object3D) : null;
                this._composeWorldQuat(parentObj, this._lookParentW);
                this._lookParentInvW.set(-this._lookParentW.x, -this._lookParentW.y, -this._lookParentW.z, this._lookParentW.w);
                this._lookQLocal.multiply(this._lookParentInvW, this._lookQWorld);
                this.headBone.localQuaternion = this._lookQLocal;
            }
        }

        if (this.followSphere && this.cameraCtrl) {
            this.cameraCtrl.target = this.sphere.transform.worldPosition;
        }
    }

    /**
     * Draw bones for both skeletons:
     *   set #1 — gltf-tree Object3Ds (collected into `_boneNodes`).
     *            Drawn as colored spindles (cyan/yellow/green/red).
     *   set #2 — `AnimatorComponent.skeltonPoseObject3D` (the shadow
     *            skeleton the GPU shader actually reads). Drawn as
     *            magenta circles + magenta thin lines, slightly offset
     *            so set #1 vs set #2 are distinguishable when they
     *            coincide. Also logs once whether each bone in set #2
     *            references the same Object3D instance as in set #1.
     */
    private _drawBoneLines() {
        if (!this._gfx || this._boneNodes.length === 0) return;
        const ikChain = new Set(['Upperarm_l', 'lowerarm_l', 'hand_l']);
        const headChain = new Set(['neck_01', 'head']);
        const R = 0.04;
        for (const bone of this._boneNodes) {
            const b = bone.transform.worldPosition;
            let jointColor: Color;
            if (bone.name === 'target_hand_l') jointColor = new Color(1, 0, 0, 1);
            else if (ikChain.has(bone.name)) jointColor = new Color(1, 1, 0, 1);
            else if (headChain.has(bone.name)) jointColor = new Color(0, 1, 1, 1);
            else jointColor = new Color(0.3, 1, 0.3, 1);
            const center = new Vector3(b.x, b.y, b.z);
            this._gfx.drawCircle(`joint-${bone.name}-y`, center, R, 16, Vector3.Y_AXIS, jointColor);
            this._gfx.drawCircle(`joint-${bone.name}-x`, center, R, 16, Vector3.X_AXIS, jointColor);
            this._gfx.drawCircle(`joint-${bone.name}-z`, center, R, 16, Vector3.Z_AXIS, jointColor);

            // Parent→child bone segment, drawn as a thin diamond (4 line
            // segments forming a quad in two planes) — Graphic3D's drawLines
            // produces 1-px-thin lines that wash out against bright
            // backgrounds, so we fatten each bone into a visible spindle.
            const parent = bone.parent ? (bone.parent.object3D as Object3D) : null;
            if (!parent || !this._boneNodes.includes(parent)) continue;
            const a = parent.transform.worldPosition;
            const ax = a.x, ay = a.y, az = a.z;
            const bx = b.x, by = b.y, bz = b.z;
            const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
            // length-aware mid-thickness so short bones stay readable
            const dx = bx - ax, dy = by - ay, dz = bz - az;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const t = Math.max(0.012, len * 0.12);
            this._gfx.drawLines(`bone-${bone.name}-xz1`,
                [new Vector3(ax, ay, az), new Vector3(mx + t, my, mz),
                 new Vector3(mx + t, my, mz), new Vector3(bx, by, bz),
                 new Vector3(ax, ay, az), new Vector3(mx - t, my, mz),
                 new Vector3(mx - t, my, mz), new Vector3(bx, by, bz),
                 new Vector3(ax, ay, az), new Vector3(mx, my, mz + t),
                 new Vector3(mx, my, mz + t), new Vector3(bx, by, bz),
                 new Vector3(ax, ay, az), new Vector3(mx, my, mz - t),
                 new Vector3(mx, my, mz - t), new Vector3(bx, by, bz)],
                jointColor);
        }

        // this._drawSet2BoneLines();
    }

    /** Has the set#1 vs set#2 identity check been logged yet. */
    private _set2IdentityLogged = false;

    /**
     * Draw the `AnimatorComponent.skeltonPoseObject3D` shadow skeleton —
     * the joint Object3Ds the GPU shader actually reads via
     * `models.matrix[joint.worldMatrix.index]`. On the first call, also
     * checks whether each set#2 entry is the SAME Object3D instance as
     * the gltf-tree entry of the same name (almost certainly not — they
     * are independently `new Object3D()`'d in `buildSkeletonPose`).
     */
    private _drawSet2BoneLines() {
        if (!this.animator) return;
        const map: { [k: string]: Object3D } | undefined =
            (this.animator as any).skeltonPoseObject3D;
        if (!map) return;

        const magenta = new Color(1, 0, 1, 1);
        const R2 = 0.025;

        if (!this._set2IdentityLogged) {
            this._set2IdentityLogged = true;
            const set1ByName = new Map<string, Object3D>();
            for (const b of this._boneNodes) set1ByName.set(b.name, b);
            let same = 0, diff = 0, missing = 0, posDiffMax = 0;
            for (const name in map) {
                const s2 = map[name];
                const s1 = set1ByName.get(name);
                if (!s1) { missing++; continue; }
                if (s1 === s2) same++; else diff++;
                const p1 = s1.transform.worldPosition;
                const p2 = s2.transform.worldPosition;
                const d = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
                if (d > posDiffMax) posDiffMax = d;
            }
            console.log(`[set#1 vs set#2] sameRef=${same} diffRef=${diff} missingInSet1=${missing} maxWorldPosDiff=${posDiffMax.toFixed(6)}`);
        }

        for (const name in map) {
            const bone = map[name];
            const b = bone.transform.worldPosition;
            const center = new Vector3(b.x, b.y, b.z);
            this._gfx.drawCircle(`s2joint-${name}-y`, center, R2, 12, Vector3.Y_AXIS, magenta);
            this._gfx.drawCircle(`s2joint-${name}-x`, center, R2, 12, Vector3.X_AXIS, magenta);
            this._gfx.drawCircle(`s2joint-${name}-z`, center, R2, 12, Vector3.Z_AXIS, magenta);

            const parentName = this._set2ParentName(name);
            const parentBone = parentName ? map[parentName] : null;
            if (!parentBone) continue;
            const a = parentBone.transform.worldPosition;
            this._gfx.drawLines(`s2bone-${name}`,
                [new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z)],
                magenta);
        }
    }

    /**
     * Look up the parent bone name for a set#2 entry. The avatar's
     * `boneData[i].parentBoneName` holds this, so we cache a name→parent
     * map on first use.
     */
    private _set2ParentMap: Map<string, string> | null = null;
    private _set2ParentName(name: string): string | null {
        if (!this._set2ParentMap) {
            this._set2ParentMap = new Map();
            const avatar = (this.animator as any)?._avatar;
            const boneData = avatar?.boneData;
            if (boneData) {
                for (const j of boneData) {
                    if (j.parentBoneName) this._set2ParentMap.set(j.boneName, j.parentBoneName);
                }
            }
        }
        return this._set2ParentMap.get(name) ?? null;
    }

    private _composeWorldQuat(obj: Object3D | null, out: Quaternion): Quaternion {
        if (!obj) { out.set(0, 0, 0, 1); return out; }
        const stack: Object3D[] = [];
        let cur: Object3D | null = obj;
        while (cur) {
            stack.push(cur);
            cur = cur.parent ? (cur.parent.object3D as Object3D) : null;
        }
        out.copy(stack[stack.length - 1].localQuaternion);
        for (let i = stack.length - 2; i >= 0; i--) {
            this._lookComposeTmp.multiply(out, stack[i].localQuaternion);
            out.copy(this._lookComposeTmp);
        }
        return out;
    }
}

new Sample_AnimationIK().run();
