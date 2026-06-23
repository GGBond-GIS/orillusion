/**
 * Skinned-mesh additive-blending demo — locomotion crossfade plus
 * additive pose-layer overlays.
 *
 * Loads `Xbot.glb` (Mixamo's Xbot — robot character with 7 baked animations:
 * idle, walk, run, sneak_pose, sad_pose, agree, headShake). The first three
 * are full-body locomotion clips that we cross-fade between; the last four
 * are "additive" pose clips that overlay on top of whatever locomotion is
 * playing.
 *
 * GUI layout:
 *
 *   Folder "Base Actions"
 *     buttons:  None | idle | walk | run
 *     Clicking a base action crossFades onto it from the current one.
 *
 *   Folder "Additive Action Weights"
 *     sliders [0, 1] for each:  sneak_pose, sad_pose, agree, headShake
 *
 *   Folder "General Speed"
 *     slider [0, 1.5] :  modify time scale
 *
 * Additive semantics are realized via the AnimationLayer mechanism in
 * `LayerBlendMode.Additive`: each pose clip lives on its own layer, and
 * the layer's `weight` is the slider value. The layer reads its clip's
 * curves and applies (clip - rest) × weight on top of the base layer.
 */
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    Object3D, Scene3D, Engine3D, AtmosphericComponent, CameraUtil,
    HoverCameraController, View3D, DirectLight, KelvinUtil,
    Object3DUtil, AnimatorComponent, AnimationLayer, LayerBlendMode,
    PostProcessingComponent, FXAAPost, Vector3,
} from "@orillusion/core";

const BASE_ACTIONS = ['None', 'idle', 'walk', 'run', 'sneak_pose', 'sad_pose', 'agree', 'headShake'];
const ADDITIVE_ACTIONS = ['sneak_pose', 'sad_pose', 'agree', 'headShake'];

class Sample_AnimationAdditiveBlending {
    engine: Engine3D;
    scene: Scene3D;
    light: Object3D;
    animator: AnimatorComponent;
    additiveLayers: Map<string, AnimationLayer> = new Map();

    // GUI-bound state
    activeBaseAction = 'idle';
    additiveWeights: { [name: string]: number } = {
        sneak_pose: 0,
        sad_pose: 0,
        agree: 0,
        headShake: 0,
    };
    timeScale = 1.0;

    async run() {
        const engine = this.engine = await Engine3D.init({
            setting: { shadow: { autoUpdate: true, updateFrameRate: 1, shadowSize: 2048 } },
        });
        this.scene = new Scene3D();
        const sky = this.scene.addComponent(AtmosphericComponent);

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(45, engine.aspect, 0.1, 100);
        const ctrl = camera.object3D.addComponent(HoverCameraController);
        ctrl.setCamera(-90, -10, 6, new Vector3(0, 1.0, 0));
        ctrl.maxDistance = 30;

        const view = new View3D();
        view.scene = this.scene;
        view.camera = camera;
        engine.startRenderView(view);

        const post = this.scene.addComponent(PostProcessingComponent);
        post.addPost(FXAAPost);

        await this.initScene();
        sky.relativeTransform = this.light.transform;
    }

    async initScene() {
        GUIHelp.init();

        // Floor — a thin cube stands in for a ground plane.
        this.scene.addChild(Object3DUtil.GetSingleCube(40, 0.2, 40, 0.6, 0.6, 0.6));

        // Light
        this.light = new Object3D();
        this.light.y = 8; this.light.z = 5;
        this.light.rotationX = 144;
        const dl = this.light.addComponent(DirectLight);
        dl.lightColor = KelvinUtil.color_temperature_to_rgb(5800);
        dl.castShadow = true; dl.intensity = 2.5;
        dl.shadowBoundFar = 30;
        dl.enableCSM = true;
        this.scene.addChild(this.light);

        // Xbot — Mixamo's "Y Bot" rig as the workhorse for additive blending.
        const xbotRoot = await this.engine.res.loadGltf('gltfs/glb/Xbot.glb');
        this.scene.addChild(xbotRoot);
        this.animator = xbotRoot.getComponentsInChild(AnimatorComponent)[0];

        // Initial state: all clips off, then activate `idle` as base.
        for (const cs of this.animator.clipsState) cs.weight = 0;
        this.animator.playAnim('idle');
        this.animator.timeScale = this.timeScale;

        // Each additive pose lives on its own layer, blend mode Additive.
        // The layer reads its clip's curves and applies (clip - rest) × weight
        // on top of whatever the base layer wrote — equivalent to the
        // makeClipAdditive() + setEffectiveWeight() pattern.
        for (const name of ADDITIVE_ACTIONS) {
            const layer = new AnimationLayer(
                `additive:${name}`,
                this.additiveWeights[name],
                LayerBlendMode.Additive,
                null, // full body — pose layers are not restricted to a region
            );
            layer.clipName = name;
            this.animator.addLayer(layer);
            this.additiveLayers.set(name, layer);
        }

        this._buildGUI();
        return true;
    }

    /** Top-centered overlay crediting the character model source. */
    private _addCredit(text: string) {
        const credit = document.createElement('div');
        credit.style.cssText = [
            'position:fixed', 'top:8px', 'left:50%', 'transform:translateX(-50%)',
            'padding:6px 14px', 'background:rgba(0,0,0,0.65)', 'color:#fff',
            'font:13px/1.4 monospace', 'border-radius:4px', 'pointer-events:none',
            'z-index:99999', 'user-select:none',
        ].join(';');
        credit.textContent = text;
        document.body.appendChild(credit);
    }

    private _buildGUI() {
        this._addCredit('Character model from mixamo.com');

        // ---- Base Actions ----
        GUIHelp.addFolder('Base Actions').open();
        for (const name of BASE_ACTIONS) {
            GUIHelp.addButton(name, () => this._activateBase(name));
        }
        GUIHelp.endFolder();

        // ---- Additive Action Weights ----
        GUIHelp.addFolder('Additive Action Weights').open();
        for (const name of ADDITIVE_ACTIONS) {
            GUIHelp.add(this.additiveWeights, name, 0.0, 1.0, 0.01).onChange((v: number) => {
                const l = this.additiveLayers.get(name);
                if (l) l.weight = v;
            });
        }
        GUIHelp.endFolder();

        // ---- General Speed ----
        GUIHelp.addFolder('General Speed').open();
        GUIHelp.add(this, 'timeScale', 0, 1.5, 0.01).name('modify time scale').onChange((v: number) => {
            this.animator.timeScale = v;
        });
        GUIHelp.endFolder();
    }

    private _activateBase(name: string) {
        // "None" zeros out every base clip — the additive layers still play
        // on top of whatever rest pose the rig settles into. Deactivates
        // all base actions when "None" is picked.
        if (name === 'None') {
            for (const cs of this.animator.clipsState) {
                if (BASE_ACTIONS.includes(cs.clip.clipName)) cs.weight = 0;
            }
            this.activeBaseAction = 'None';
            return;
        }
        // crossFade with a fixed half-second duration — the conventional
        // default for animation locomotion blends.
        this.animator.crossFade(name, 0.5);
        this.activeBaseAction = name;
    }
}

new Sample_AnimationAdditiveBlending().run();
