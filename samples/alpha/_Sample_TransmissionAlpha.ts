import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    AtmosphericComponent,
    CameraUtil,
    Color,
    DirectLight,
    Engine3D,
    HoverCameraController,
    KelvinUtil,
    LitMaterial,
    MeshRenderer,
    Object3D,
    Scene3D,
    Vector3,
    View3D,
} from "@orillusion/core";

/**
 * Physical-transmission demo with canvas-alpha composite.
 *
 * A CSS table with four colored cells (#ff0000 / #00ff00 / #0000ff /
 * #000000) sits *behind* the canvas; the canvas is created with
 * `alpha: true` and never draws a background of its own, so the page
 * shows through wherever the scene leaves coverage — including through
 * the dragon's glass via `transmissionAlphaMode`.
 *
 * The dragon material is rendered exactly as authored in
 * DragonAttenuation.glb: the asset ships with KHR_materials_ior /
 * KHR_materials_transmission / KHR_materials_volume, the gltf parser
 * populates the LitMaterial from them, and this sample applies NO
 * overrides. The GUI below reads its initial values from the loaded
 * material and writes the user's edits back.
 */
class Sample_TransmissionAlpha {
    engine!: Engine3D;
    scene!: Scene3D;
    view!: View3D;

    private dragonMat!: LitMaterial;

    async run() {
        // Inject the colored cells *before* Engine3D creates the
        // canvas, so they're already in the DOM when the canvas is
        // appended on top with z-index 1.
        this.injectHTMLBackdrop();

        this.engine = await Engine3D.init({
            canvasConfig: {
                alpha: true,
                zIndex: 1,
            },
            setting: {
                shadow: { enable: false },
                render: { msaa: 0 } as any,
            },
        });

        GUIHelp.init();

        this.scene = new Scene3D();
        // AtmosphericComponent stays disabled — a visible sky would
        // cover the HTML backdrop. We still attach one so the shadow
        // / IBL pipelines have a sun-direction reference.
        const atmos = this.scene.addComponent(AtmosphericComponent);
        atmos.enable = false;

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(40, this.engine.aspect, 1, 2000);
        camera.object3D
            .addComponent(HoverCameraController)
            .setCamera(90, 0, 5, new Vector3(0, 0.5, 0));

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;
        this.engine.startRenderView(this.view);

        // Single directional key light; the glass shading itself is
        // dominated by the IBL environment.
        const lightPivot = new Object3D();
        lightPivot.rotationX = 30;
        lightPivot.rotationY = 200;
        const directLight = lightPivot.addComponent(DirectLight);
        directLight.lightColor = KelvinUtil.color_temperature_to_rgb(6500);
        directLight.intensity = 6.0;
        directLight.castShadow = false;
        this.scene.addChild(lightPivot);

        // IBL only — bind HDR to scene.envMap without spawning a
        // SkyRenderer (which would draw the cube as a background and
        // hide the HTML cells).
        const hdr = await this.engine.res.loadHDRTextureCube('/hdri/sunset.hdr');
        this.scene.envMap = hdr;

        await this.loadDragon();
        this.initGUI();
    }

    private injectHTMLBackdrop() {
        // Mimics the inline <style> + <table> from
        // examples/webgl_materials_physical_transmission_alpha.html.
        const style = document.createElement('style');
        style.textContent = `
            html,body { margin:0; padding:0; overflow:hidden; }
            body { background-color: #888888; }
            #table {
                margin-top: 100px;
                border-collapse: collapse;
                width: 100%;
            }
            #table td {
                margin: 0; padding: 0;
                font-size: 16px;
                text-align: center;
                vertical-align: middle;
                font-family: Avenir, Helvetica, Arial, sans-serif;
            }
            #table tr { height: 250px; }
            #block-ff0000 { background-color: #ff0000; color: white; }
            #block-00ff00 { background-color: #00ff00; color: black; }
            #block-0000ff { background-color: #0000ff; color: white; }
            #block-000000 { background-color: #000000; color: black; }
        `;
        document.head.appendChild(style);

        const table = document.createElement('table');
        table.id = 'table';
        table.innerHTML = `
            <tbody><tr>
                <td id="block-ff0000">ff0000</td>
                <td id="block-00ff00">00ff00</td>
                <td id="block-0000ff">0000ff</td>
                <td id="block-000000">000000</td>
            </tr></tbody>`;
        document.body.appendChild(table);
    }

    private async loadDragon() {
        const model = (await this.engine.res.loadGltf('gltfs/DragonAttenuation/DragonAttenuation.glb')) as Object3D;
        this.scene.addChild(model);

        // The asset is two parts: a checkerboard cloth pedestal that
        // stays as authored (opaque MR), and the dragon itself which
        // ships with KHR_materials_transmission already enabled. Pick
        // the LitMaterial whose `transmissionFactor` was set by the
        // gltf parser — the parser only touches it on materials that
        // declare the extension, so this discriminates the dragon from
        // the cloth without name lookups.
        const meshes = model.getComponentsInChild(MeshRenderer);
        for (const mr of meshes) {
            for (const m of mr.materials) {
                if (m instanceof LitMaterial && m.transmissionFactor > 0) {
                    this.dragonMat = m;
                }
            }
        }
        if (this.dragonMat) {
            // The single engine-specific flag this sample needs: with
            // it on, the transmission shader lowers the canvas alpha
            // wherever the glass transmits into page-backed pixels, so
            // the HTML backdrop composites through the dragon. Every
            // material parameter stays exactly as authored in the glb.
            this.dragonMat.transmissionAlphaMode = true;
        }
    }

    private initGUI() {
        if (!this.dragonMat) return;
        const mat = this.dragonMat;

        // GUI state initialized FROM the loaded material — the sliders
        // start at the asset's authored values, no presets.
        const toRGBA = (c: Color) => [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 1];
        const params = {
            color: { rgba: toRGBA(mat.baseColor) },
            opacity: mat.baseColor.a,
            transmission: mat.transmissionFactor,
            metalness: mat.metallic,
            roughness: mat.roughness,
            ior: mat.ior,
            thickness: mat.thicknessFactor,
            attenuationColor: { rgba: toRGBA(mat.attenuationColor) },
            attenuationDistance: mat.attenuationDistance,
        };

        GUIHelp.addColor(params, 'color').onChange(() => {
            const c = (params.color as any).rgba;
            mat.baseColor = new Color(c[0] / 255, c[1] / 255, c[2] / 255, mat.baseColor.a);
        });

        GUIHelp.add(params, 'opacity', 0, 1, 0.01).onChange(() => {
            const c = mat.baseColor;
            mat.baseColor = new Color(c.r, c.g, c.b, params.opacity);
        });

        GUIHelp.add(params, 'transmission', 0, 1, 0.01).onChange(() => {
            mat.transmissionFactor = params.transmission;
        });

        GUIHelp.add(params, 'metalness', 0, 1, 0.01).onChange(() => {
            mat.metallic = params.metalness;
        });

        GUIHelp.add(params, 'roughness', 0, 1, 0.01).onChange(() => {
            mat.roughness = params.roughness;
        });

        GUIHelp.add(params, 'ior', 1, 2, 0.01).onChange(() => {
            mat.ior = params.ior;
        });

        GUIHelp.add(params, 'thickness', 0, 5, 0.01).onChange(() => {
            mat.thicknessFactor = params.thickness;
        });

        GUIHelp.addColor(params, 'attenuationColor').onChange(() => {
            const c = (params.attenuationColor as any).rgba;
            mat.attenuationColor = new Color(c[0] / 255, c[1] / 255, c[2] / 255, 1);
        });

        GUIHelp.add(params, 'attenuationDistance', 0, 1, 0.01).onChange(() => {
            mat.attenuationDistance = params.attenuationDistance;
        });

        GUIHelp.open();
    }
}

new Sample_TransmissionAlpha().run();
