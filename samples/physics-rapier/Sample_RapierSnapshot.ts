import {
    Physics, Rigidbody, BodyType, CollisionShapeUtil,
} from "@orillusion/physics-rapier";
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { createExampleScene, createSceneParam } from "@samples/utils/ExampleScene";
import {
    Object3D, LitMaterial, Engine3D, BoxGeometry, MeshRenderer, Vector3,
    PlaneGeometry, Color, SphereGeometry,
} from "@orillusion/core";

/**
 * Demonstrates `Physics.snapshot()` / `Physics.restore()` for time-rewind /
 * replay. Press the buttons in the GUI: SAVE captures the current world,
 * REWIND restores to that capture (positions + velocities snap back).
 */
class Sample_RapierSnapshot {
    private savedSnapshot: Uint8Array | null = null;
    private rigidBodies: Rigidbody[] = [];

    async run() {
        // Deterministic flag pins solver iterations across runs.
        await Physics.init({ deterministic: true });

        const engine = await Engine3D.init({ renderLoop: () => Physics.update() });
        const sp = createSceneParam(); sp.camera.distance = 30;
        const ex = createExampleScene(engine, sp);

        // Floor
        const floor = new Object3D();
        const fr = floor.addComponent(MeshRenderer);
        fr.geometry = new PlaneGeometry(40, 40);
        const fm = new LitMaterial(); fm.baseColor = new Color(0.4, 0.4, 0.45); fr.material = fm;
        const fb = floor.addComponent(Rigidbody);
        fb.bodyType = BodyType.Static; fb.shape = CollisionShapeUtil.createPlaneShape(20, 0.05);
        ex.scene.addChild(floor);

        // Spawn a tower of boxes
        for (let i = 0; i < 10; i++) {
            const o = new Object3D();
            o.x = (i % 2 - 0.4) * 0.4;
            o.y = 1 + i * 1.00;
            const mr = o.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(1, 1, 1);
            const m = new LitMaterial();
            m.baseColor = new Color(0.5 + 0.05 * i, 0.5, 0.7 - 0.05 * i); mr.material = m;
            const rb = o.addComponent(Rigidbody);
            rb.bodyType = BodyType.Dynamic; rb.mass = 1;
            rb.shape = CollisionShapeUtil.createBoxShape(o, new Vector3(1, 1, 1));
            ex.scene.addChild(o);
            this.rigidBodies.push(rb);
        }

        // Cannonball
        const ball = new Object3D(); ball.x = -10; ball.y = 5;
        const bmr = ball.addComponent(MeshRenderer);
        bmr.geometry = new SphereGeometry(0.6, 24, 24);
        const bm = new LitMaterial(); bm.baseColor = new Color(0.95, 0.7, 0.2); bmr.material = bm;
        const brb = ball.addComponent(Rigidbody);
        brb.bodyType = BodyType.Dynamic; brb.mass = 8;
        brb.shape = CollisionShapeUtil.createSphereShape(ball, 0.6);
        ex.scene.addChild(ball);
        this.rigidBodies.push(brb);

        GUIHelp.init();
        GUIHelp.addButton('Save Snapshot', () => {
            this.savedSnapshot = Physics.snapshot();
            console.log('[snapshot] captured', this.savedSnapshot.byteLength, 'bytes');
        });
        GUIHelp.addButton('Fire Cannon', async () => {
            const b = await brb.wait();
            b.setLinvel({ x: 25, y: 8, z: 0 }, true);
        });
        GUIHelp.addButton('Rewind', () => {
            if (!this.savedSnapshot) { console.warn('No snapshot to rewind to.'); return; }
            const before = Physics.world.bodies.len();
            Physics.restore(this.savedSnapshot);
            const after = Physics.world.bodies.len();
            console.log(`[rewind] body count ${before} -> ${after}; Rigidbodies re-bound by handle.`);
        });
        GUIHelp.open();
        engine.startRenderView(ex.view);
    }
}

new Sample_RapierSnapshot().run();
