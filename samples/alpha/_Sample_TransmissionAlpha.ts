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
 * The defining trick of this demo isn't the transmission shader itself —
 * it's the canvas-alpha composite. A CSS table with four colored cells
 * (#ff0000 / #00ff00 / #0000ff / #000000) is placed *behind* the WebGL
 * canvas; the canvas is created with `alpha: true` and never draws a
 * background of its own; the dragon's transmission samples whatever's
 * already on the framebuffer (the SceneColorPyramid copy of the opaque
 * world). The result: the colored HTML cells refract through the dragon.
 *
 * Mapping to Orillusion:
 *   - `canvasConfig.alpha = true` makes the swapchain clear to (1,1,1,0)
 *     and switches the present pass to `loadOp: 'load'` so the HTML
 *     compositor can blend us onto the page (Context3D + WebGPUDescriptorCreator).
 *   - We deliberately do not add a SkyRenderer / enable AtmosphericComponent —
 *     that would draw a sphere skybox and obscure the cells.
 *   - The HDR cube (`/hdri/sunset.hdr`) is bound to `scene.envMap` for IBL
 *     only; nothing in the scene presents it as a background.
 *   - DragonAttenuation.glb already carries KHR_materials_ior /
 *     KHR_materials_transmission / KHR_materials_volume, so the gltf
 *     parser produces a LitMaterial with `transmissionFactor`,
 *     `attenuationColor`, etc. already populated — we just expose them
 *     to the GUI.
 */
class Sample_TransmissionAlpha {
    engine!: Engine3D;
    scene!: Scene3D;
    view!: View3D;

    private dragonMat!: LitMaterial;
    private directLight!: DirectLight;
    private envMapBaseIntensity = 1.0;
    private lightBaseIntensity = 3.0;

    async run() {
        // Inject the four colored cells *before* Engine3D creates the
        // canvas, so they're already in the iframe's DOM when the canvas
        // is appended on top with z-index 1.
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
        // / IBL pipelines have a sun-direction reference, but force
        // `enable=false` so nothing draws.
        const atmos = this.scene.addComponent(AtmosphericComponent);
        atmos.enable = false;

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(40, this.engine.aspect, 1, 2000);
        // Three demo: camera.position.set(-5, 0.5, 0); controls.target.y = 0.5.
        // HoverCameraController spherical: roll=180 (yaw 180°) puts camera
        // on +X looking at -X — Three has it on -X. Either side gives the
        // same dragon profile so we use roll=180 for a slight upward tilt.
        // Dragon was authored at unit-scale in glTF; the demo distance of 5
        // matches.
        camera.object3D
            .addComponent(HoverCameraController)
            .setCamera(0, 0, 5, new Vector3(0, 0.5, 0));

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;
        this.engine.startRenderView(this.view);

        // Single directional light — the demo's lighting is dominated
        // by the IBL HDR; the directional just adds a key.
        const lightPivot = new Object3D();
        lightPivot.rotationX = 30;
        lightPivot.rotationY = 200;
        this.directLight = lightPivot.addComponent(DirectLight);
        this.directLight.lightColor = KelvinUtil.color_temperature_to_rgb(6500);
        this.directLight.intensity = this.lightBaseIntensity;
        this.directLight.castShadow = false;
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

        // The asset is two parts: a checkerboard floor pedestal that
        // stays as authored (opaque MR), and the dragon itself which
        // ships with KHR_materials_transmission already enabled. We
        // pick the LitMaterial whose `transmissionFactor` was touched
        // by the gltf parser — the parser only sets it on materials
        // that explicitly declare the extension, so this discriminates
        // the dragon from the floor without name lookups.
        const meshes = model.getComponentsInChild(MeshRenderer);
        for (const mr of meshes) {
            for (const m of mr.materials) {
                if (m instanceof LitMaterial && m.transmissionFactor > 0) {
                    this.dragonMat = m;
                }
            }
        }
        if (this.dragonMat) {
            // Preset matches the values authored in the asset itself
            // (DragonAttenuation.glb's KHR_materials_volume +
            // KHR_materials_ior). The shader now keeps half the lit
            // signal as a specular / env-reflection proxy in cutout
            // mode and scales the refraction offset by thickness, so
            // the heavy attenuation (thickness 2.27 / distance 0.155)
            // produces the characteristic deep amber + bright
            // highlights of the reference render rather than a
            // uniformly dark body.
            this.dragonMat.baseColor = new Color(1, 1, 1, 1);
            this.dragonMat.transmissionFactor = 1.0;
            this.dragonMat.metallic = 0;
            this.dragonMat.roughness = 0;
            this.dragonMat.ior = 1.5;
            // Reference-equivalent visual via compensated ratio.
            //
            // The asset's authored values (thickness=2.27, distance=
            // 0.155) push the Beer-Lambert ratio to ~14.6, which in
            // the reference render still reads as amber because of
            // three things we don't replicate: per-fragment 3D
            // refraction-ray length, sRGB → linear color management,
            // and an ACES final-pass tonemap. Stacking those
            // compensations would be a multi-feature shader rewrite.
            //
            // Pragmatic match: lower the ratio to ~0.5 so our flat
            // attenuation produces a similar amber/golden hue to the
            // reference at the heavier ratio. Slider stays in range —
            // drag thickness up to 2.27 or attenuation distance down
            // to 0.155 to feel the asset default. thickness=2.27 keeps
            // the asset's authored value (now drives both Beer-Lambert
            // path length AND the new 3D refraction-ray screen
            // offset). attenuationDistance softened from the asset's
            // 0.155 to 2.0 — without an sRGB-managed colour pipeline
            // and final-pass ACES tonemap to bring back highlights,
            // even a ratio of 4-5 collapses the body to deep red.
            // Ratio ≈ 1 keeps the authored amber hue visible while
            // the new 3D refraction produces the per-fragment colour
            // variation that gives the volumetric look.
            this.dragonMat.thicknessFactor = 2.27;
            this.dragonMat.attenuationColor = new Color(246 / 255, 209 / 255, 72 / 255, 1);
            this.dragonMat.attenuationDistance = 2.0;
            // The reference demo is IBL-dominated (no explicit
            // DirectLight, only scene.environment). Our DirectLight at
            // intensity=3 adds a strong warm-white wash that flattens
            // the glass contrast. Drop it so the IBL specular and the
            // env reflection get their proper visual weight.
            this.lightBaseIntensity = 1.5;
            this.directLight.intensity = this.lightBaseIntensity;
            // Critical for the canvas-alpha trick: with this mode on,
            // the transmission shader writes alpha < 1 wherever the
            // glass transmits, so the iframe's HTML backdrop can show
            // through the canvas's premultiplied compositor.
            this.dragonMat.transmissionAlphaMode = true;
        }

        // Render the asset unmodified.
        // DragonAttenuation.glb is authored so the dragon's body straddles
        // y=0..1 in world units, which is why the camera targets y=0.5
        // at fov-40, 5 units away.
    }

    private initGUI() {
        if (!this.dragonMat) return;

        // Params block — initial values match the preset applied to
        // the dragon material in loadDragon().
        const params = {
            color: { rgba: [255, 255, 255, 1] },
            transmission: 1,
            opacity: 1,
            metalness: 0,
            roughness: 0,
            ior: 1.5,
            thickness: 2.27,
            attenuationColor: { rgba: [246, 209, 72, 1] },
            attenuationDistance: 2.0,
            specularIntensity: 1,
            specularColor: { rgba: [255, 255, 255, 1] },
            envMapIntensity: 1,
            exposure: 1,
        };

        // Helper: rename a controller to a friendlier label and pin a
        // browser-native tooltip on its row. dat.gui exposes `__li` on
        // each controller — that's the <li> wrapping label + widget,
        // so the title attribute kicks in on the whole row hover.
        const decorate = (ctl: any, label: string, tip: string) => {
            if (!ctl) return ctl;
            if (typeof ctl.name === 'function') ctl.name(label);
            if (ctl.__li) ctl.__li.title = tip;
            return ctl;
        };

        decorate(
            GUIHelp.addColor(params, 'color').onChange(() => {
                const c = (params.color as any).rgba;
                this.dragonMat.baseColor = new Color(c[0] / 255, c[1] / 255, c[2] / 255, this.dragonMat.baseColor.a);
            }),
            'Base Color',
            'baseColor — tints the material body; multiplied into the diffuse / transmission result. White = no tint',
        );

        decorate(
            GUIHelp.add(params, 'transmission', 0, 1, 0.01).onChange(() => {
                this.dragonMat.transmissionFactor = params.transmission;
            }),
            'Transmission',
            'transmissionFactor (KHR_materials_transmission) — 0 = opaque solid, 1 = fully glass. Controls the proportion by which diffuse is replaced with transmitted RGB',
        );

        decorate(
            GUIHelp.add(params, 'opacity', 0, 1, 0.01).onChange(() => {
                // Drive opacity via baseColor.a only — the transmission
                // shader path uses this directly in the alpha-blend
                // (srcA = opacity * pyramid.a). Switching alphaMode at
                // runtime would need a pipeline rebuild + queue swap.
                const a = params.opacity;
                const c = this.dragonMat.baseColor;
                this.dragonMat.baseColor = new Color(c.r, c.g, c.b, a);
            }),
            'Opacity',
            'baseColor.a — 1 = fully visible, 0 = fully gone. When an opaque object (cloth) sits behind the glass, lowers the dragon visibility proportionally; when nothing is behind (the HTML area) it has no effect',
        );

        decorate(
            GUIHelp.add(params, 'metalness', 0, 1, 0.01).onChange(() => {
                this.dragonMat.metallic = params.metalness;
            }),
            'Metalness',
            'metallic — 0 = glass / plastic / ceramic (dielectric), 1 = metal. Metals use baseColor as the reflection colour; dielectrics use specularColor (F0)',
        );

        decorate(
            GUIHelp.add(params, 'roughness', 0, 1, 0.01).onChange(() => {
                this.dragonMat.roughness = params.roughness;
            }),
            'Roughness',
            'roughness — 0 = mirror-smooth (sharp specular), 1 = fully rough (diffuse environment). Affects both GGX specular sharpness and IBL mip level',
        );

        decorate(
            GUIHelp.add(params, 'ior', 1, 2, 0.01).onChange(() => {
                this.dragonMat.ior = params.ior;
            }),
            'IOR',
            'ior (KHR_materials_ior) — vacuum = 1.0, water = 1.33, common glass = 1.5, crystal = 1.8, diamond = 2.4. Drives the refraction offset and Fresnel reflection strength',
        );

        decorate(
            GUIHelp.add(params, 'thickness', 0, 5, 0.01).onChange(() => {
                this.dragonMat.thicknessFactor = params.thickness;
            }),
            'Thickness',
            'thicknessFactor (KHR_materials_volume) — internal light-path length through the glass. Combined with attenuationDistance it determines the total Beer-Lambert attenuation (pow(attenuationColor, thickness/distance))',
        );

        decorate(
            GUIHelp.addColor(params, 'attenuationColor').onChange(() => {
                const c = (params.attenuationColor as any).rgba;
                this.dragonMat.attenuationColor = new Color(c[0] / 255, c[1] / 255, c[2] / 255, 1);
            }),
            'Tint Hue',
            'attenuationColor — the colour transmitted light retains after travelling through the glass: golden-amber for amber glass, green for a wine bottle, etc.',
        );

        decorate(
            GUIHelp.add(params, 'attenuationDistance', 0, 3, 0.01).onChange(() => {
                this.dragonMat.attenuationDistance = params.attenuationDistance;
            }),
            'Tint Distance',
            'attenuationDistance — the path length over which transmitted light decays to 1/e. Smaller values give heavier attenuation (deeper colour, biased toward attenuationColor); larger values approach no tinting',
        );

        // specularColor.rgb = F0 for dielectrics (Fresnel at 0°, ~0.04
        // by default; tinting it adjusts grazing-angle reflection hue).
        // specularColor.a = specularIntensity scalar that the shader
        // multiplies into the preserved specular-like term — see
        // PBRLitShader's USE_TRANSMISSION block.
        const applySpecular = () => {
            const c = (params.specularColor as any).rgba;
            const k = params.specularIntensity;
            (this.dragonMat as any).shader.setUniformColor(
                'specularColor',
                new Color(c[0] / 255, c[1] / 255, c[2] / 255, k),
            );
        };
        decorate(
            GUIHelp.add(params, 'specularIntensity', 0, 1, 0.01).onChange(applySpecular),
            'Specular Intensity',
            'specularIntensity (KHR_materials_specular) — scales only the IBL specular reflection strength (the sharp environment highlight on the surface); does not affect diffuse. 0 = matte, no reflection; 1 = full environment reflection',
        );
        decorate(
            GUIHelp.addColor(params, 'specularColor').onChange(applySpecular),
            'Specular Color',
            'specularColor — the F0 of a dielectric material (Fresnel reflection colour at normal incidence); the default white gives standard glass. Tinting it pale red yields a plastic / matte-ceramic look; this control is ignored when metallic = 1',
        );

        decorate(
            GUIHelp.add(params, 'envMapIntensity', 0, 1, 0.01).onChange(() => {
                (this.dragonMat as any).shader.envIntensity = params.envMapIntensity * this.envMapBaseIntensity;
            }),
            'Environment Intensity',
            'envIntensity — scales only the IBL diffuse (the ambient fill that paints matte / shadow regions); does not affect specular. 0 = lose the environment ambience (only the key light remains); 1 = full environment diffuse. Complements "Specular Intensity": env handles matte regions, spec handles the reflective highlight',
        );

        // We have no global tonemap-exposure knob (ACES is inline in
        // LightingFunction_frag and bakes a fixed exposure). Approximate
        // by scaling both the IBL and the directional light — visually
        // close enough for the demo's purposes.
        decorate(
            GUIHelp.add(params, 'exposure', 0, 1, 0.01).onChange(() => {
                const k = params.exposure;
                this.directLight.intensity = this.lightBaseIntensity * k;
                (this.dragonMat as any).shader.envIntensity = params.envMapIntensity * this.envMapBaseIntensity * k;
            }),
            'Exposure',
            'Approximate exposure — scales both the key light and the environment intensity together. Our ACES is inline in LightingFunction_frag with a fixed exposure and there is no dedicated final-tonemap knob, so this is a linear-scale approximation',
        );

        GUIHelp.open();
    }
}

new Sample_TransmissionAlpha().run();
