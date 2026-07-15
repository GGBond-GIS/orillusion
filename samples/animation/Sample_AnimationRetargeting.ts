/**
 * Loads two Mixamo characters from `models/gltf/`:
 *
 *   Source : `Michelle.glb`  — comes with a baked SambaDance + TPose.
 *   Target : `Soldier.glb`   — same Mixamo bone names, but a different mesh
 *                              (and slightly different rest pose).
 *
 * Each frame, the source's bone rotations are copied onto the target's
 * skeleton via `Retargeter`. Both rigs share the `mixamorig:` prefix on
 * every bone, so the retargeter's exact-name pass resolves all 67 bones
 * without needing an explicit name map.
 *
 * The ground plane is a PlaneGeometry rendered with a custom mirror
 * material. A second camera below the plane (mirror image of the main
 * camera) renders the scene every frame into a SceneCapture RT; the
 * floor's shader samples that RT in screen space, producing a true
 * planar reflection of both characters.
 */
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    Object3D, Scene3D, Engine3D, AtmosphericComponent, CameraUtil,
    HoverCameraController, View3D, DirectLight, KelvinUtil,
    AnimatorComponent, MeshRenderer,
    PostProcessingComponent, FXAAPost, Vector3,
    Color, PlaneGeometry,
    MirrorMaterial, MirrorComponent,
} from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";

class Sample_AnimationRetargeting {
    engine: Engine3D;
    scene: Scene3D;
    light: Object3D;

    sourceRoot: Object3D;
    sourceAnimator: AnimatorComponent;
    targetAnimator: AnimatorComponent;

    helpers = { visible: true };

    async run() {
        const engine = this.engine = await Engine3D.init({
            setting: { shadow: { autoUpdate: true, updateFrameRate: 1, shadowSize: 2048 } },
        });
        this.scene = new Scene3D();
        const sky = this.scene.addComponent(AtmosphericComponent);

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(45, engine.aspect, 0.1, 100);
        const ctrl = camera.object3D.addComponent(HoverCameraController);
        // Frame both characters: 3.5 m gap on X, ~1.8 m tall — pull
        // camera back to ~7 m so both fit, target at the midpoint.
        ctrl.setCamera(0, -10, 7, new Vector3(0, 1.0, 0));
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

        // Light first — we want shadows in the mirror reflection too.
        this.light = new Object3D();
        this.light.y = 8; this.light.z = 5;
        this.light.rotationX = 144;
        const dl = this.light.addComponent(DirectLight);
        dl.lightColor = KelvinUtil.color_temperature_to_rgb(5800);
        dl.castShadow = true;
        dl.intensity = 2.5;
        dl.shadowBoundFar = 30;
        dl.enableCSM = true;
        this.scene.addChild(this.light);
        GUIUtil.renderDirLight(dl);

        // Ground plane as a planar mirror. MirrorComponent handles the
        // SceneCaptureCameraComponent, the mirror-camera tracking, the
        // self-mask (so the floor doesn't capture itself), and the
        // late-binding of the capture RT into MirrorMaterial.mirrorMap.
        // We just provide the geometry, the material, and the look-at
        // pivot the main camera orbits around.
        {
            const floor = new Object3D();
            const mr = floor.addComponent(MeshRenderer);
            mr.geometry = new PlaneGeometry(40, 40);
            const mat = new MirrorMaterial();
            mat.baseColor = new Color(0.85, 0.9, 1.0, 1);
            mr.material = mat;

            floor.addComponent(MirrorComponent);

            this.scene.addChild(floor);
        }

        // ---------- Source: Michelle (plays SambaDance) ----------
        // Michelle's glTF Character holds rotationX = +90°, Soldier's
        // holds -90°, so their TPose hip worlds face opposite world
        // directions. The Retargeter's `alignTPoseFacing` (default on)
        // pre-multiplies a one-shot rotation into Soldier's Character
        // node so his bind hip world matches Michelle's, then runs
        // naive world-copy retargeting so Soldier's bones overlay
        // Michelle's at every frame.
        this.sourceRoot = await this.engine.res.loadGltf('gltfs/glb/Michelle.glb');
        this.scene.addChild(this.sourceRoot);
        this.sourceRoot.x = -1.0;
        this.sourceRoot.rotationY = 90;
        this.sourceAnimator = this.sourceRoot.getComponentsInChild(AnimatorComponent)[0];
        this.sourceAnimator.playAnim('SambaDance');

        // ---------- Target: Soldier (no own animation; driven by retargeter) ----------
        const targetRoot = await this.engine.res.loadGltf('gltfs/glb/Soldier.glb');
        this.scene.addChild(targetRoot);
        targetRoot.x = 1.0;
        targetRoot.rotationY = -90;
        this.targetAnimator = targetRoot.getComponentsInChild(AnimatorComponent)[0];

        this.sourceAnimator.retargetTo(this.targetAnimator);

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
        this._addCredit('Character models from mixamo.com');

        // one toggle, "show helpers".
        GUIHelp.add(this.helpers, 'visible').name('show helpers').onChange((v: boolean) => {
            // Toggle the source mesh visibility — gives the same "isolate the
            // retargeted character" UX helper toggle.
            const renderers = this.sourceRoot.getComponentsInChild(MeshRenderer);
            for (const r of renderers) r.enable = v;
        });
    }
}

new Sample_AnimationRetargeting().run();
