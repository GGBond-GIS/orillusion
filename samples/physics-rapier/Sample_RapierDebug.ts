import {
    Physics, Rigidbody, BodyType, CollisionShapeUtil,
} from "@orillusion/physics-rapier";
import { createExampleScene, createSceneParam } from "@samples/utils/ExampleScene";
import {
    Object3D, LitMaterial, Engine3D, BoxGeometry, MeshRenderer, Vector3,
    PlaneGeometry, Color, SphereGeometry, CylinderGeometry,
} from "@orillusion/core";
import { Graphic3D } from "@orillusion/graphic";

class Sample_RapierDebug {
    async run() {
        await Physics.init();
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

        // Mixed shapes
        const drop = (geo: any, shape: any, c: Color, x: number) => {
            const o = new Object3D(); o.x = x; o.y = 6;
            const mr = o.addComponent(MeshRenderer); mr.geometry = geo;
            const m = new LitMaterial(); m.baseColor = c; mr.material = m;
            const rb = o.addComponent(Rigidbody);
            rb.bodyType = BodyType.Dynamic; rb.mass = 1; rb.shape = shape;
            ex.scene.addChild(o);
            return o;
        };
        const a = drop(new BoxGeometry(1, 1, 1), null, new Color(0.7, 0.4, 0.4), -4);
        a.getComponent(Rigidbody).shape = CollisionShapeUtil.createBoxShape(a, new Vector3(1, 1, 1));
        const b = drop(new SphereGeometry(0.6, 24, 24), null, new Color(0.4, 0.7, 0.4), 0);
        b.getComponent(Rigidbody).shape = CollisionShapeUtil.createSphereShape(b, 0.6);
        const c = drop(new CylinderGeometry(0.5, 0.5, 1.2), null, new Color(0.4, 0.4, 0.7), 4);
        c.getComponent(Rigidbody).shape = CollisionShapeUtil.createCylinderShape(c, 0.5, 0.6);

        // Debug renderer
        const graphic = new Graphic3D();
        ex.scene.addChild(graphic);
        Physics.initDebugDrawer(graphic, { enable: true, updateFreq: 1 });

        engine.startRenderView(ex.view);
    }
}

new Sample_RapierDebug().run();
