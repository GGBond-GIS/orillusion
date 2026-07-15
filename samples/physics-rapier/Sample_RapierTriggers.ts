import {
    Physics, Rigidbody, BodyType, CollisionShapeUtil,
} from "@orillusion/physics-rapier";
import { createExampleScene, createSceneParam } from "@samples/utils/ExampleScene";
import {
    Object3D, LitMaterial, Engine3D, BoxGeometry, MeshRenderer, Vector3,
    PlaneGeometry, Color, SphereGeometry, BlendMode,
} from "@orillusion/core";

class Sample_RapierTriggers {
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

        // Trigger zone (transparent box)
        const zone = new Object3D(); zone.y = 2;
        const zmr = zone.addComponent(MeshRenderer);
        zmr.geometry = new BoxGeometry(6, 4, 6);
        const zmat = new LitMaterial();
        zmat.baseColor = new Color(0.2, 0.9, 0.4, 0.25);
        zmat.blendMode = BlendMode.NORMAL;
        zmat.transparent = true;
        zmr.material = zmat;
        const zrb = zone.addComponent(Rigidbody);
        zrb.bodyType = BodyType.Static;
        zrb.shape = CollisionShapeUtil.createBoxShape(zone, new Vector3(6, 4, 6));
        zrb.isSensor = true;
        zrb.enableEvents = true;

        let inside = 0;
        zrb.onTriggerEnter = (other) => {
            inside++;
            console.log('triggerEnter', other.object3D.name, 'count:', inside);
            zmat.baseColor = new Color(1.0, 0.4, 0.4, 0.35);
        };
        zrb.onTriggerExit = (other) => {
            inside--;
            console.log('triggerExit', other.object3D.name, 'count:', inside);
            if (inside <= 0) zmat.baseColor = new Color(0.2, 0.9, 0.4, 0.25);
        };
        ex.scene.addChild(zone);

        // Drop balls through the trigger
        let id = 0;
        const dropInterval = setInterval(() => {
            const o = new Object3D();
            o.name = 'ball_' + (id++);
            o.x = (Math.random() - 0.5) * 4;
            o.z = (Math.random() - 0.5) * 4;
            o.y = 12;
            const mr = o.addComponent(MeshRenderer);
            mr.geometry = new SphereGeometry(0.4, 16, 16);
            const m = new LitMaterial();
            m.baseColor = new Color(Math.random(), Math.random(), Math.random()); mr.material = m;
            const rb = o.addComponent(Rigidbody);
            rb.bodyType = BodyType.Dynamic; rb.mass = 1; rb.restitution = 0.3;
            rb.shape = CollisionShapeUtil.createSphereShape(o, 0.4);
            rb.enableEvents = true;
            ex.scene.addChild(o);
            if (id > 30) clearInterval(dropInterval);
        }, 250);

        engine.startRenderView(ex.view);
    }
}

new Sample_RapierTriggers().run();
