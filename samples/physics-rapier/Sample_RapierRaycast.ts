import {
    Physics, Rigidbody, BodyType, CollisionShapeUtil, PhysicsQuery,
} from "@orillusion/physics-rapier";
import { createExampleScene, createSceneParam } from "@samples/utils/ExampleScene";
import {
    Object3D, LitMaterial, Engine3D, BoxGeometry, MeshRenderer, Vector3,
    PlaneGeometry, Color, ComponentBase, Time,
} from "@orillusion/core";
import { Graphic3D } from "@orillusion/graphic";

class RotatingScanner extends ComponentBase {
    public targetHitMaterial: LitMaterial;
    public defaultMaterial: LitMaterial;
    public boxes: Object3D[] = [];
    private elapsed = 0;
    public graphic3D: Graphic3D;

    public onUpdate() {
        this.elapsed += Time.delta * 0.001;
        const angle = this.elapsed;
        const origin = new Vector3(0, 5, 0);
        const dir = new Vector3(Math.cos(angle), 0, Math.sin(angle));

        // Reset all
        for (const b of this.boxes) b.getComponent(MeshRenderer).material = this.defaultMaterial;

        const hit = PhysicsQuery.raycast(origin, dir, { maxDistance: 30 });

        // Draw the ray
        this.graphic3D.Clear?.('scanRay');
        const end = hit ? hit.point : new Vector3(origin.x + dir.x * 30, origin.y + dir.y * 30, origin.z + dir.z * 30);
        this.graphic3D.drawLines('scanRay', [origin, end], hit ? new Color(1, 0.3, 0.3) : new Color(0.3, 1, 0.3));

        if (hit && hit.rigidbody) {
            const obj = hit.rigidbody.object3D;
            obj.getComponent(MeshRenderer).material = this.targetHitMaterial;
        }
    }
}

class Sample_RapierRaycast {
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

        const defaultMat = new LitMaterial(); defaultMat.baseColor = new Color(0.6, 0.6, 0.65);
        const hitMat = new LitMaterial(); hitMat.baseColor = new Color(1, 0.4, 0.2);

        // Ring of boxes around the scanner
        const boxes: Object3D[] = [];
        const N = 12;
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            const r = 8;
            const o = new Object3D(); o.x = Math.cos(a) * r; o.z = Math.sin(a) * r; o.y = 5;
            const mr = o.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(1.2, 1.2, 1.2);
            mr.material = defaultMat;
            const rb = o.addComponent(Rigidbody);
            rb.bodyType = BodyType.Static;
            rb.shape = CollisionShapeUtil.createBoxShape(o, new Vector3(1.2, 1.2, 1.2));
            ex.scene.addChild(o);
            boxes.push(o);
        }

        // Graphic3D for the ray line
        const graphic = new Graphic3D();
        ex.scene.addChild(graphic);

        // Scanner driver placed on the floor (any object will do)
        const scanner = floor.addComponent(RotatingScanner);
        scanner.boxes = boxes;
        scanner.defaultMaterial = defaultMat;
        scanner.targetHitMaterial = hitMat;
        scanner.graphic3D = graphic;

        engine.startRenderView(ex.view);
    }
}

new Sample_RapierRaycast().run();
