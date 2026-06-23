import {
    AtmosphericComponent,
    BoxGeometry,
    Camera3D,
    CameraUtil,
    Color,
    ColliderComponent,
    DEGREES_TO_RADIANS,
    DirectLight,
    Engine3D,
    HoverCameraController,
    KelvinUtil,
    LitMaterial,
    MeshRenderer,
    Object3D,
    PointerEvent3D,
    Scene3D,
    SphereGeometry,
    Vector3,
    View3D,
} from "@orillusion/core";
import { GUIHelp } from "@orillusion/debug/GUIHelp";
import { Graphic3D } from "@orillusion/graphic";
import { MaterialStateComponent } from "@samples/pick/MaterialStateComponent";

// WGS84 ECEF reference values.
const EARTH_RADIUS = 6378137;
const E2 = 2 * (1 / 298.257223563) - Math.pow(1 / 298.257223563, 2);

// Same axis swap as Sample_RTE so the rendered "up" direction matches
// the engine's Y-up convention.
function latLonAltToECEF(lonDeg: number, latDeg: number, altMeters: number, target = new Vector3()): Vector3 {
    const phi = latDeg * DEGREES_TO_RADIANS;
    const lambda = lonDeg * DEGREES_TO_RADIANS;
    const N = EARTH_RADIUS / Math.sqrt(1 - E2 * Math.sin(phi) * Math.sin(phi));
    const x = (N + altMeters) * Math.cos(phi) * Math.cos(lambda);
    const y = (N + altMeters) * Math.cos(phi) * Math.sin(lambda);
    const z = (N * (1 - E2) + altMeters) * Math.sin(phi);
    target.set(y, z, x);
    return target;
}

class Sample_PixelPick_ECEF {
    private hud: HTMLDivElement;
    private g: Graphic3D;
    private anchor: Object3D;
    private camera: Camera3D;

    async run() {
        const engine = await Engine3D.init({
            setting: {
                useRTE: true,
                doublePrecision: true,
                render: {
                    useLogDepth: true,
                },
                pick: {
                    enable: true,
                    mode: `pixel`,
                },
            },
        });

        const scene = new Scene3D();
        scene.exposure = 1;
        const sky = scene.addComponent(AtmosphericComponent);

        // Camera with a huge far-plane to cover the ECEF magnitude — log
        // depth is required to keep z-precision meaningful across this
        // range, and RTE+doublePrecision is required so the mesh world
        // matrices don't fall apart at ~6.4e6 m translations.
        const camera = CameraUtil.createCamera3DObject(scene);
        camera.perspective(45, engine.aspect, 0.1, EARTH_RADIUS * 4);
        this.camera = camera;

        // Anchor the pickable group on an ECEF point (Shanghai-ish, +50 m).
        const anchorPos = latLonAltToECEF(121.4737, 31.2304, 50);
        this.anchor = new Object3D();
        this.anchor.localPosition = anchorPos;
        scene.addChild(this.anchor);

        // Orbit camera around the ECEF anchor.
        const hoverCtrl = camera.object3D.addComponent(HoverCameraController);
        hoverCtrl.setCamera(45, -25, 100, anchorPos);

        // Sun + atmospheric sky tied to the light direction.
        const lightObj = new Object3D();
        lightObj.rotationX = 30;
        lightObj.rotationY = 160;
        const dir = lightObj.addComponent(DirectLight);
        dir.lightColor = KelvinUtil.color_temperature_to_rgb(5355);
        dir.intensity = 3;
        dir.castShadow = false;
        scene.addChild(lightObj);
        sky.relativeTransform = dir.transform;

        // Pickable cluster: spheres + a box, all attached under the ECEF
        // anchor so their world positions live at ~6.4e6 m.
        const sphereGeo = new SphereGeometry(4, 20, 20);
        for (let i = 0; i < 10; i++) {
            const obj = new Object3D();
            obj.name = `sphere_${i}`;
            obj.x = (i - 5) * 10;
            const mat = new LitMaterial();
            mat.roughness = i / 10;
            mat.metallic = 0.3;
            const mr = obj.addComponent(MeshRenderer);
            mr.geometry = sphereGeo;
            mr.material = mat;
            obj.addComponent(MaterialStateComponent);
            obj.addComponent(ColliderComponent);
            this.anchor.addChild(obj);
        }
        const box = new Object3D();
        box.name = `box`;
        box.y = 10;
        const boxMr = box.addComponent(MeshRenderer);
        boxMr.geometry = new BoxGeometry(20, 8, 12);
        boxMr.material = new LitMaterial();
        box.addComponent(MaterialStateComponent);
        box.addComponent(ColliderComponent);
        this.anchor.addChild(box);

        const view = new View3D();
        view.scene = scene;
        view.camera = camera;
        engine.startRenderView(view);

        // Debug overlay graphics. Parented under the ECEF anchor (not
        // the scene root) so that endpoints can be supplied in anchor-
        // local space. Graphic3D stores vertex positions as raw float32
        // and only RTE-corrects the model matrix translation, so feeding
        // world-space ECEF endpoints (~6.4e6 m) collapses precision and
        // makes the lines jitter when the camera zooms in. Local coords
        // keep the float32 math in the safe range while the anchor's
        // big world translation rides the double-precision matrix path.
        this.g = new Graphic3D();
        this.anchor.addChild(this.g);

        // Three local-axis probe lines through the anchor. Under
        // logDepth they should occlude correctly against the spheres /
        // box; if Graphic3DShader still skipped its log-depth branch
        // they would either always-pass or always-fail the depth test
        // and the lines would render fully on top or be invisible.
        const axes: [Vector3, Color][] = [
            [new Vector3(1, 0, 0), Color.COLOR_RED],
            [new Vector3(0, 1, 0), Color.COLOR_GREEN],
            [new Vector3(0, 0, 1), Color.COLOR_BLUE],
        ];
        for (const [dir, c] of axes) {
            const a = new Vector3().addScaledVector(dir, -60);
            const b = new Vector3().addScaledVector(dir, 60);
            this.g.drawLines(`probe_${c.r}${c.g}${c.b}`, [a, b], c);
        }

        // HUD that shows the anchor position and the last pick result.
        this.installHUD(anchorPos);

        view.pickFire.addEventListener(PointerEvent3D.PICK_CLICK, this.onPick, this);

        GUIHelp.init();
        GUIHelp.add({ distance: 200 }, 'distance', 10, 2000, 1).onChange(v => (hoverCtrl as any).distance = v);
        GUIHelp.open();
    }

    private installHUD(anchor: Vector3) {
        const div = document.createElement('div');
        div.id = 'pick-ecef-hud';
        div.style.cssText = [
            'position:fixed', 'top:10px', 'left:10px',
            'padding:8px 12px', 'background:rgba(0,0,0,0.65)', 'color:#fff',
            'font:12px/1.5 ui-monospace,Menlo,monospace', 'z-index:10000',
            'pointer-events:none', 'white-space:pre', 'border-radius:4px',
        ].join(';');
        div.textContent = [
            `Sample_PixelPick_ECEF`,
            `ECEF anchor : ${this.fmt(anchor)}`,
            `Click any sphere or the box to pick.`,
        ].join('\n');
        document.body.appendChild(div);
        this.hud = div;
    }

    private onPick(e: PointerEvent3D) {
        const target = e.target as Object3D;
        if (!target) return;
        const pickedWorld = e.data.worldPos as Vector3;
        const expectedCentre = target.transform.worldPosition;

        // For a sphere the picked point lies on the surface, so the
        // distance from object centre should be ~ radius. For the box
        // it should be within ~half-extent. If reconstruction is wrong
        // (e.g. log-depth not inverted) this delta blows up by orders
        // of magnitude or jumps to the camera-mirrored side of the
        // scene.
        const delta = Vector3.distance(pickedWorld, expectedCentre);
        const camDist = Vector3.distance(pickedWorld, this.camera.transform.worldPosition);

        const text = [
            `Sample_PixelPick_ECEF`,
            `Target      : ${target.name}`,
            `Picked world: ${this.fmt(pickedWorld)}`,
            `Obj centre  : ${this.fmt(expectedCentre)}`,
            `|pick-obj|  : ${delta.toFixed(3)} m   (sphere r = 4, box half-ext ≤ 10)`,
            `|pick-cam|  : ${camDist.toFixed(3)} m`,
        ].join('\n');
        this.hud.textContent = text;
        console.log('[PixelPick_ECEF]', { target: target.name, pickedWorld: pickedWorld.clone(), expectedCentre: expectedCentre.clone(), delta });

        // Draw a short normal stub at the pick point so the surface
        // location can be eyeballed against the geometry. Convert the
        // world-space pick point into anchor-local space first — see
        // the Graphic3D parenting note above for why local coords are
        // required to avoid jitter.
        const anchorWorld = this.anchor.transform.worldPosition;
        const localPicked = pickedWorld.clone().sub(anchorWorld);
        const localTip = localPicked.clone().addScaledVector(e.data.worldNormal, 5);
        this.g.drawLines('pickNormal', [localPicked, localTip], Color.COLOR_BLUE);

        // Visual feedback: brief emissive pulse on the target. changeColor
        // only animates one direction (toward Color.a as target intensity),
        // so we schedule a down-pulse with the same hue and alpha=0 to
        // fade it back out — switching hue mid-pulse would just snap the
        // emissive to the new colour and skip the fade.
        const msc = target.getComponent(MaterialStateComponent);
        const flashColor = new Color(0.5, 1.5, 0.5, 1.2);
        msc?.changeColor(flashColor, 120);
        setTimeout(() => msc?.changeColor(new Color(flashColor.r, flashColor.g, flashColor.b, 0), 200), 120);
    }

    private fmt(v: Vector3): string {
        return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
    }
}

new Sample_PixelPick_ECEF().run();
