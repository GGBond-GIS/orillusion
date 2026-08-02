import {
    Engine3D,
    Scene3D,
    View3D,
    CameraUtil,
    AtmosphericComponent,
    HoverCameraController,
    Object3D,
    DirectLight,
    PointLight,
    KelvinUtil,
    MeshRenderer,
    LitMaterial,
    BoxGeometry,
    SphereGeometry,
    Color,
} from '../../src';

class Sample_MultiInstance {
    async run() {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;background:#111;color:#ddd;font-family:monospace;font-size:12px';
        document.body.appendChild(host);

        const bar = document.createElement('div');
        bar.style.cssText = 'padding:6px 10px;background:#222;border-bottom:1px solid #333';
        bar.textContent = 'Multi-instance demo — two Engine3D with fully isolated GPU devices';
        host.appendChild(bar);

        const stage = document.createElement('div');
        stage.style.cssText = 'flex:1;display:flex;gap:4px;padding:4px;background:#000';
        host.appendChild(stage);

        const makePane = (label: string) => {
            const pane = document.createElement('div');
            pane.style.cssText = 'flex:1;display:flex;flex-direction:column;min-width:0';
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 8px;background:#1a1a1a;color:#9cf';
            const title = document.createElement('div');
            title.style.cssText = 'flex:1';
            title.textContent = label;
            const reinitBtn = document.createElement('button');
            reinitBtn.textContent = 'reinit()';
            reinitBtn.style.cssText = 'background:#223;border:1px solid #446;color:#9cf;padding:2px 8px;cursor:pointer;font-family:inherit;font-size:11px';
            header.appendChild(title);
            header.appendChild(reinitBtn);
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'flex:1;width:100%;height:100%;display:block';
            pane.appendChild(header);
            pane.appendChild(canvas);
            stage.appendChild(pane);
            return { pane, title, reinitBtn, canvas };
        };

        const a = makePane('Engine A — red box + direct light');
        const b = makePane('Engine B — blue sphere + point light');

        type Instance = { engine: Engine3D; scene: Scene3D };

        // ---------- Engine A builder ----------
        const buildEngineA = async (): Promise<Instance> => {
            const engine = await Engine3D.init({ canvasConfig: { canvas: a.canvas } });
            a.title.textContent = `Engine A (id=${engine.id}) — red box + direct light`;

            const scene = new Scene3D();
            scene.addComponent(AtmosphericComponent);

            const cam = CameraUtil.createCamera3D(null, scene);
            cam.perspective(60, engine.context3D.aspect, 1, 2000);
            cam.object3D.addComponent(HoverCameraController).setCamera(30, -15, 120);

            const lightObj = new Object3D();
            lightObj.rotationX = 45;
            lightObj.rotationY = 60;
            const dir = lightObj.addComponent(DirectLight);
            dir.lightColor = KelvinUtil.color_temperature_to_rgb(5500);
            dir.intensity = 3;
            scene.addChild(lightObj);

            const box = new Object3D();
            box.name = 'redBox';
            const mr = box.addComponent(MeshRenderer);
            mr.geometry = new BoxGeometry(40, 40, 40);
            const mat = new LitMaterial(engine.context3D);
            mat.baseColor = new Color(1, 0.15, 0.15, 1);
            mr.material = mat;
            scene.addChild(box);

            const view = new View3D();
            view.scene = scene;
            view.camera = cam;
            engine.startRenderView(view);
            return { engine, scene };
        };

        // ---------- Engine B builder ----------
        const buildEngineB = async (): Promise<Instance> => {
            const engine = await Engine3D.init({ canvasConfig: { canvas: b.canvas } });
            b.title.textContent = `Engine B (id=${engine.id}) — blue sphere + point light`;

            const scene = new Scene3D();
            scene.addComponent(AtmosphericComponent);

            const cam = CameraUtil.createCamera3D(null, scene);
            cam.perspective(45, engine.context3D.aspect, 1, 2000);
            cam.object3D.addComponent(HoverCameraController).setCamera(0, 0, 140);

            const ptLightObj = new Object3D();
            ptLightObj.transform.x = 40;
            ptLightObj.transform.y = 30;
            const ptLight = ptLightObj.addComponent(PointLight);
            ptLight.lightColor = new Color(1, 1, 1);
            ptLight.intensity = 30;
            ptLight.range = 300;
            scene.addChild(ptLightObj);

            const sph = new Object3D();
            sph.name = 'blueSphere';
            const mr = sph.addComponent(MeshRenderer);
            mr.geometry = new SphereGeometry(25, 32, 32);
            const mat = new LitMaterial(engine.context3D);
            mat.baseColor = new Color(0.1, 0.4, 1.0, 1);
            mr.material = mat;
            scene.addChild(sph);

            const view = new View3D();
            view.scene = scene;
            view.camera = cam;
            engine.startRenderView(view);
            return { engine, scene };
        };

        let instA = await buildEngineA();
        let instB = await buildEngineB();

        const wireReinit = (
            btn: HTMLButtonElement,
            getInst: () => Instance,
            setInst: (i: Instance) => void,
            builder: () => Promise<Instance>,
            label: string,
        ) => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                const prev = getInst();
                const prevId = prev.engine.id;
                console.log(`[multi-sample] reinit ${label}: destroying scene + disposing engine id=${prevId}`);
                // Tear down scene tree first so every Object3D/component/MeshRenderer/
                // LitMaterial/Geometry runs its destroy() hook, then drop the engine —
                // `context3D.dispose()` will `device.destroy()` to catch any GPU handles
                // still bound to this device.
                prev.scene.destroy(true);
                prev.engine.dispose();
                const next = await builder();
                setInst(next);
                console.log(`[multi-sample] reinit ${label}: new id=${next.engine.id} (was ${prevId})`);
                btn.disabled = false;
            });
        };

        wireReinit(a.reinitBtn, () => instA, (i) => (instA = i), buildEngineA, 'A');
        wireReinit(b.reinitBtn, () => instB, (i) => (instB = i), buildEngineB, 'B');

        const engineA = instA.engine;
        const engineB = instB.engine;

        console.log('[multi-sample] engineA.id =', engineA.id, 'engineB.id =', engineB.id);
        console.log('[multi-sample] isolated GPU devices =', engineA.context3D.device !== engineB.context3D.device);
        console.log('[multi-sample] isolated adapters =', engineA.context3D.adapter !== engineB.context3D.adapter);
        console.log('[multi-sample] distinct context3D =', engineA.context3D !== engineB.context3D);
    }
}

new Sample_MultiInstance().run();
