import {
    Physics, Rigidbody, BodyType, CollisionShapeUtil, CharacterController, RAPIER
} from "@orillusion/physics-rapier";
import { createExampleScene, createSceneParam } from "@samples/utils/ExampleScene";
import {
    Object3D, LitMaterial, Engine3D, BoxGeometry, MeshRenderer, Vector3,
    PlaneGeometry, Color, KeyEvent, KeyCode, ComponentBase, Time,
} from "@orillusion/core";

class CharacterDriver extends ComponentBase {
    public controller: CharacterController;
    private keys: Record<string, boolean> = {};
    public speed: number = 4;
    public gravity: number = -9.8;
    public jumpVel: number = 6;
    private vy: number = 0;

    public start() {
        const input = this.transform.scene3D.view.engine3D.inputSystem;
        input.addEventListener(KeyEvent.KEY_DOWN, (e: KeyEvent) => this.keys[e.keyCode] = true, this);
        input.addEventListener(KeyEvent.KEY_UP, (e: KeyEvent) => this.keys[e.keyCode] = false, this);
    }

    public onUpdate() {
        if (!this.controller) return;
        const dt = Time.delta * 0.001;
        let vx = 0, vz = 0;
        if (this.keys[KeyCode.Key_W]) vz -= 1;
        if (this.keys[KeyCode.Key_S]) vz += 1;
        if (this.keys[KeyCode.Key_A]) vx -= 1;
        if (this.keys[KeyCode.Key_D]) vx += 1;
        const len = Math.hypot(vx, vz);
        if (len > 0) { vx /= len; vz /= len; }

        // Apply gravity
        if (this.controller.isGrounded()) {
            this.vy = 0;
            if (this.keys[KeyCode.Key_Space]) this.vy = this.jumpVel;
        } else {
            this.vy += this.gravity * dt;
        }

        this.controller.move(new Vector3(vx * this.speed * dt, this.vy * dt, vz * this.speed * dt));
    }
}

class Sample_RapierCharacter {
    async run() {
        await Physics.init();
        const engine = await Engine3D.init({ renderLoop: () => Physics.update() });
        const sp = createSceneParam(); sp.camera.distance = 30;
        const ex = createExampleScene(engine, sp);

        // Floor
        const floor = new Object3D();
        const fr = floor.addComponent(MeshRenderer);
        fr.geometry = new PlaneGeometry(60, 60);
        const fm = new LitMaterial(); fm.baseColor = new Color(0.4, 0.4, 0.45); fm.roughness = 0.8; fr.material = fm;
        const fb = floor.addComponent(Rigidbody);
        fb.bodyType = BodyType.Static; fb.shape = CollisionShapeUtil.createPlaneShape(30, 0.05);
        ex.scene.addChild(floor);

        // Stairs
        for (let i = 0; i < 6; i++) {
            const step = new Object3D(); step.x = 8; step.y = 0.25 + i * 0.5; step.z = -i * 1.2;
            const mr = step.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(3, 0.5, 1.2);
            const mat = new LitMaterial(); mat.baseColor = new Color(0.6, 0.5, 0.4); mr.material = mat;
            const rb = step.addComponent(Rigidbody);
            rb.bodyType = BodyType.Static; rb.shape = CollisionShapeUtil.createBoxShape(step, new Vector3(3, 0.5, 1.2));
            ex.scene.addChild(step);
        }

        // Character: blue capsule (rendered as box)
        const player = new Object3D(); player.y = 2;
        const pmr = player.addComponent(MeshRenderer);
        pmr.geometry = new BoxGeometry(0.6, 1.6, 0.6);
        const pm = new LitMaterial(); pm.baseColor = new Color(0.3, 0.5, 0.9); pmr.material = pm;
        const cc = player.addComponent(CharacterController);
        cc.shape = RAPIER.ColliderDesc.capsule(0.6, 0.3);
        cc.maxSlopeClimbAngle = (50 * Math.PI) / 180;
        cc.snapToGround = 0.5;
        cc.autoStep = { maxHeight: 0.6, minWidth: 0.2, includeDynamic: true };
        const drv = player.addComponent(CharacterDriver);
        drv.controller = cc;
        ex.scene.addChild(player);

        engine.startRenderView(ex.view);
    }
}

new Sample_RapierCharacter().run();
