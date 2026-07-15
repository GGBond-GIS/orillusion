import {
    Physics, Rigidbody, BodyType, CollisionShapeUtil,
} from "@orillusion/physics-rapier";
import { createExampleScene, createSceneParam } from "@samples/utils/ExampleScene";
import {
    Object3D, LitMaterial, Engine3D, BoxGeometry, MeshRenderer, Vector3,
    PlaneGeometry, Color, SphereGeometry,
} from "@orillusion/core";

class Sample_RapierDominoes {
    async run() {
        await Physics.init();
        const engine = await Engine3D.init({ renderLoop: () => Physics.update() });
        const sp = createSceneParam(); sp.camera.distance = 60;
        const ex = createExampleScene(engine, sp);

        // Floor
        const floor = new Object3D();
        const fr = floor.addComponent(MeshRenderer);
        fr.geometry = new PlaneGeometry(120, 120);
        const fm = new LitMaterial(); fm.baseColor = new Color(0.5, 0.5, 0.55); fr.material = fm;
        const fb = floor.addComponent(Rigidbody);
        fb.bodyType = BodyType.Static; fb.shape = CollisionShapeUtil.createPlaneShape(60, 0.05);
        fb.friction = 1;
        ex.scene.addChild(floor);

        // Dominoes in an arc
        const N = 80;
        const radius = 25;
        const w = 0.3, h = 3, d = 1.4;
        for (let i = 0; i < N; i++) {
            const t = i / N;
            const angle = t * Math.PI * 1.6 - Math.PI * 0.8;
            const o = new Object3D();
            o.x = Math.cos(angle) * radius;
            o.z = Math.sin(angle) * radius;
            o.y = h / 2;
            o.localRotation = new Vector3(0, -angle * 180 / Math.PI - 90, 0);

            const mr = o.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(w, h, d);
            const m = new LitMaterial();
            m.baseColor = new Color(0.5 + 0.5 * Math.cos(t * 6), 0.5 + 0.5 * Math.sin(t * 5), 0.5);
            mr.material = m;

            const rb = o.addComponent(Rigidbody);
            rb.bodyType = BodyType.Dynamic; rb.mass = 0.5;
            rb.shape = CollisionShapeUtil.createBoxShape(o, new Vector3(w, h, d));
            rb.friction = 0.6;
            rb.restitution = 0.05;
            ex.scene.addChild(o);
        }

        // Roller — heavy ball nudges the first domino. Each domino's local +X
        // is the chain tangent (= toppling direction); placing the ball a few
        // units along -tangent and impulsing it along +tangent lines the ball
        // up with the first domino's back face for a square strike.
        const ang0 = -Math.PI * 0.8;
        const tanX = -Math.sin(ang0), tanZ = Math.cos(ang0);
        const ballRadius = 0.6;
        const ball = new Object3D();
        ball.x = Math.cos(ang0) * radius - tanX * 3;
        ball.z = Math.sin(ang0) * radius - tanZ * 3;
        ball.y = ballRadius;
        const bmr = ball.addComponent(MeshRenderer);
        bmr.geometry = new SphereGeometry(ballRadius, 24, 24);
        const bm = new LitMaterial(); bm.baseColor = new Color(0.9, 0.7, 0.2); bmr.material = bm;
        const brb = ball.addComponent(Rigidbody);
        brb.bodyType = BodyType.Dynamic; brb.mass = 5;
        brb.shape = CollisionShapeUtil.createSphereShape(ball, ballRadius);
        ex.scene.addChild(ball);

        brb.wait().then(() => {
            brb.applyImpulse(new Vector3(tanX * 30, 0, tanZ * 30));
        });

        engine.startRenderView(ex.view);
    }
}

new Sample_RapierDominoes().run();
