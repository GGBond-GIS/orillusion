import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Object3D, Scene3D, Engine3D, AtmosphericComponent, CameraUtil, HoverCameraController, View3D, LitMaterial, MeshRenderer, SphereGeometry, Color, Vector3, DirectLight, KelvinUtil, Object3DUtil, AnimatorComponent, TwoBoneIK, PostProcessingComponent, FXAAPost } from "@orillusion/core";
import { GUIUtil } from "@samples/utils/GUIUtil";

/**
 * Skeleton IK demo — adds foot IK constraints to the walking CesiumMan.
 *
 * The base sample (Sample_Skeleton) just plays the skinned walk clip. Here we
 * pin each ankle to a world-space target with an analytic {@link TwoBoneIK}
 * solver, one per leg:
 *
 *   chain = [leg_joint_X_1 (hip), leg_joint_X_2 (knee), leg_joint_X_3 (ankle)]
 *
 * Each solver runs AFTER clip sampling (AnimatorComponent.onUpdate), so the
 * walk animation still drives the hips/torso while the legs are bent to keep
 * the feet at their targets. A "pole" hint placed in front of each knee fixes
 * the bend plane so knees never flip backward.
 *
 * By default the targets are frozen at the ankles' bind-pose positions, so the
 * feet stay planted on the floor while the body sways above them — the textbook
 * foot-lock constraint. The GUI exposes a per-foot weight (blend in/out the IK)
 * plus world X/Y/Z sliders to drag each foot target around live.
 */
class Sample_SkeletonIK {
    engine: Engine3D;
    lightObj3D: Object3D;
    scene: Scene3D;
    animator: AnimatorComponent;

    async run() {
        // Read the persisted shadow sampling type (if any) so the GUI dropdown
        // survives the required reload — see GUIUtil.renderShadowSetting.
        const storedType = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('shadowType') : null;
        const shadowType: 'HARD' | 'PCF' | 'SOFT' =
            storedType === 'PCF' || storedType === 'SOFT' ? storedType : 'HARD';

        const engine = this.engine = await Engine3D.init({
            setting: {
                shadow: {
                    type: shadowType,
                    autoUpdate: true,
                    updateFrameRate: 1,
                },
            },
        });

        this.scene = new Scene3D();
        let sky = this.scene.addComponent(AtmosphericComponent);

        let camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, engine.aspect, 0.01, 5000.0);

        let ctrl = camera.object3D.addComponent(HoverCameraController);
        ctrl.setCamera(-30, -45, 100);
        ctrl.maxDistance = 1000;

        let view = new View3D();
        view.scene = this.scene;
        view.camera = camera;

        engine.startRenderView(view);

        let postCom = this.scene.addComponent(PostProcessingComponent);
        postCom.addPost(FXAAPost);

        await this.initScene(this.scene);
        sky.relativeTransform = this.lightObj3D.transform;
    }


    async initScene(scene: Scene3D) {
        GUIHelp.init();
        GUIUtil.renderShadowSetting(this.engine);
        {
            // load model with skeleton animation
            let man = await this.engine.res.loadGltf('gltfs/CesiumMan/CesiumMan_compress.gltf');
            man.scaleX = 30;
            man.scaleY = 30;
            man.scaleZ = 30;
            // man.rotationZ = 90;
            scene.addChild(man);

            let animator = this.animator = man.getComponentsInChild(AnimatorComponent)[0];
            animator.playAnim(animator.clips[0].clipName);

            GUIUtil.renderTransform(man.transform);

            // Add foot IK once the skeleton joints exist. The walk clip is
            // only sampled on the first onUpdate (after this returns), so the
            // joints are still at bind pose here — exactly what we want to
            // capture as the planted-foot targets.
            this.setupFootIK('R');
            this.setupFootIK('L');
        }

        /******** floor *******/
        this.scene.addChild(Object3DUtil.GetSingleCube(3000, 1, 3000, 0.5, 0.5, 0.5));

        /******** light *******/
        {
            this.lightObj3D = new Object3D();
            this.lightObj3D.y = 100;
            this.lightObj3D.rotationX = 144;
            this.lightObj3D.rotationY = 0;
            this.lightObj3D.rotationZ = 0;
            let directLight = this.lightObj3D.addComponent(DirectLight);
            directLight.lightColor = KelvinUtil.color_temperature_to_rgb(5355);
            directLight.castShadow = true;
            directLight.intensity = 3;
            directLight.shadowBoundFar = 200;
            directLight.enableCSM = true;
            GUIUtil.renderDirLight(directLight);
            scene.addChild(this.lightObj3D);
        }

        return true;
    }

    /**
     * Build a TwoBoneIK solver for one leg and wire its GUI.
     *
     * @param side 'R' or 'L' — selects the `leg_joint_<side>_{1,2,3}` chain.
     */
    private setupFootIK(side: 'R' | 'L') {
        const hipName = `leg_joint_${side}_1`;
        const kneeName = `leg_joint_${side}_2`;
        const ankleName = `leg_joint_${side}_3`;

        const hip = this.animator.getJointObject(hipName);
        const knee = this.animator.getJointObject(kneeName);
        const ankle = this.animator.getJointObject(ankleName);
        if (!hip || !knee || !ankle) {
            console.warn(`[FootIK] missing bone(s) for side ${side} — IK skipped`);
            return;
        }

        // Capture bind-pose world positions of the chain.
        const hipP = this.clonePos(hip);
        const kneeP = this.clonePos(knee);
        const ankleP = this.clonePos(ankle);

        // Pole hint: push out from the knee along its natural bend direction
        // (knee offset from the hip→ankle line). This preserves the bind-pose
        // bend plane so the knee keeps pointing the same way it already does,
        // instead of the solver picking an arbitrary (possibly flipped) plane.
        const mid = new Vector3((hipP.x + ankleP.x) * 0.5, (hipP.y + ankleP.y) * 0.5, (hipP.z + ankleP.z) * 0.5);
        const poleDir = new Vector3(kneeP.x - mid.x, kneeP.y - mid.y, kneeP.z - mid.z);
        const legLen = Vector3.distance(hipP, ankleP);
        if (poleDir.length < 1e-4) poleDir.set(0, 0, 1); else poleDir.normalize();
        const poleP = new Vector3(
            kneeP.x + poleDir.x * legLen,
            kneeP.y + poleDir.y * legLen,
            kneeP.z + poleDir.z * legLen,
        );

        // Visible markers: orange = foot target, cyan = pole hint. Both live
        // under the scene root so their localPosition equals worldPosition,
        // which is what the solver reads each frame.
        const target = this.makeMarker(ankleP, new Color(1.0, 0.4, 0.1, 1), 2.0);
        const pole = this.makeMarker(poleP, new Color(0.1, 0.7, 1.0, 1), 1.4);

        this.scene.addChild(target);
        // this.scene.addChild(pole);

        const solver = new TwoBoneIK({
            name: `foot_${side}`,
            chain: [hipName, kneeName, ankleName],
            target,
            pole,
            weight: 1.0,
        });
        this.animator.addIK(solver);

        // GUI: weight blend + world-space target drag sliders. Slider ranges
        // span a generous box around the captured bind position (the model is
        // scaled 30x, so foot targets sit at ~tens of world units).
        GUIHelp.addFolder(`Foot IK (${side})`);
        GUIHelp.add(solver, 'weight', 0, 1, 0.01).name('weight');
        const range = legLen;
        GUIHelp.add(target, 'x', ankleP.x - range, ankleP.x + range, 0.1).name('target x');
        GUIHelp.add(target, 'y', ankleP.y - range, ankleP.y + range, 0.1).name('target y');
        GUIHelp.add(target, 'z', ankleP.z - range, ankleP.z + range, 0.1).name('target z');
        GUIHelp.endFolder();
    }

    /** Snapshot a joint's current world position into a fresh Vector3. */
    private clonePos(obj: Object3D): Vector3 {
        const wp = obj.transform.worldPosition;
        return new Vector3(wp.x, wp.y, wp.z);
    }

    /** Spawn an emissive sphere marker at `pos` and return its Object3D. */
    private makeMarker(pos: Vector3, color: Color, radius: number): Object3D {
        const o = new Object3D();
        const mr = o.addComponent(MeshRenderer);
        mr.geometry = new SphereGeometry(radius, 16, 16);
        const mat = new LitMaterial();
        mat.baseColor = color;
        mat.emissiveColor = color;
        mat.emissiveIntensity = 1.5;
        mr.material = mat;
        o.x = pos.x;
        o.y = pos.y;
        o.z = pos.z;
        return o;
    }

}

new Sample_SkeletonIK().run();
