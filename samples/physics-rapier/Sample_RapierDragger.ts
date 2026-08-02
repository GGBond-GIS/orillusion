import {
    Physics, Rigidbody, BodyType, CollisionShapeUtil,
} from "@orillusion/physics-rapier";
import { createExampleScene, createSceneParam } from "@samples/utils/ExampleScene";
import {
    Object3D, LitMaterial, Engine3D, BoxGeometry, MeshRenderer, Vector3,
    PlaneGeometry, Color, SphereGeometry,
} from "@orillusion/core";

class Sample_RapierDragger {
    async run() {
        await Physics.init();
        const engine = await Engine3D.init({ renderLoop: () => Physics.update() });
        const sp = createSceneParam(); sp.camera.distance = 30;
        const ex = createExampleScene(engine, sp);

        // Floor
        const floor = new Object3D();
        const fr = floor.addComponent(MeshRenderer);
        fr.geometry = new PlaneGeometry(40, 40);
        const fm = new LitMaterial(); fm.baseColor = new Color(0.45, 0.45, 0.5); fr.material = fm;
        const fb = floor.addComponent(Rigidbody);
        fb.bodyType = BodyType.Static; fb.shape = CollisionShapeUtil.createPlaneShape(20, 0.05);
        ex.scene.addChild(floor);

        // Some draggable bodies
        for (let i = 0; i < 12; i++) {
            const o = new Object3D();
            o.x = (Math.random() - 0.5) * 8;
            o.z = (Math.random() - 0.5) * 8;
            o.y = 1.5 + i * 1.5;
            const mr = o.addComponent(MeshRenderer);
            const isSphere = i % 2 === 0;
            mr.geometry = isSphere ? new SphereGeometry(0.5, 16, 16) : new BoxGeometry(1, 1, 1);
            const m = new LitMaterial();
            m.baseColor = new Color(Math.random(), Math.random(), Math.random()); mr.material = m;
            const rb = o.addComponent(Rigidbody);
            rb.bodyType = BodyType.Dynamic; rb.mass = 1;
            rb.shape = isSphere
                ? CollisionShapeUtil.createSphereShape(o, 0.5)
                : CollisionShapeUtil.createBoxShape(o, new Vector3(1, 1, 1));
            ex.scene.addChild(o);
        }

        Physics.enableDragger(ex.view);

        engine.startRenderView(ex.view);
    }
}

new Sample_RapierDragger().run();
