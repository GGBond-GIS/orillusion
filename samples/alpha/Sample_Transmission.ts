import { GUIHelp } from "@orillusion/debug/GUIHelp";
import {
    BitmapTexture2D,
    CameraUtil,
    Color,
    Engine3D,
    HoverCameraController,
    LitMaterial,
    MeshRenderer,
    Object3D,
    RendererMask,
    Scene3D,
    SkyRenderer,
    SphereGeometry,
    Vector3,
    View3D,
} from "@orillusion/core";

/**
 * Physical-transmission demo — IBL-only PBR sphere with alpha stripes.
 *
 * Single sphere with an IBL-only PBR material that demonstrates the full
 * KHR_materials_transmission / _ior / _volume / _specular control surface.
 * The sphere uses a procedural 2×2 alpha stripe map so half the surface
 * is fully transparent and the other half opaque — the lit side shows
 * the env reflection and refraction, the alpha-cut side reveals the
 * HDR sky directly through the geometry.
 *
 * GUI exposes the standard transmission parameter surface:
 *   color, transmission, opacity, metalness, roughness, ior, thickness,
 *   specularIntensity, specularColor, envMapIntensity, exposure.
 *
 * No DirectLight — environment-only lighting.
 */
class Sample_Transmission {
    engine!: Engine3D;
    scene!: Scene3D;
    view!: View3D;

    private mat!: LitMaterial;
    private envBaseIntensity = 1.0;

    async run() {
        this.engine = await Engine3D.init({
            setting: {
                shadow: { enable: false },
            },
        });

        GUIHelp.init();

        this.scene = new Scene3D();

        // HDR cube — both visible background (SkyRenderer) AND IBL
        // (scene.envMap). Royal Esplanade (Poly Haven CC0 / public
        // domain) — chosen for its strong reflection cues.
        const sky = this.scene.addComponent(SkyRenderer);
        sky.map = await this.engine.res.loadLDRTextureCube('sky/LDR_sky.jpg')
        this.scene.envMap = sky.map;

        const camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(40, this.engine.aspect, 1, 2000);
        // Three demo: camera at (0, 0, 120), looking at origin, fov=40,
        // controls.minDistance=10, maxDistance=150. HoverCamera spherical
        // (roll, pitch, distance) — pitch=0, distance=120 places the
        // camera on the equator at radius 120, equivalent.
        camera.object3D
            .addComponent(HoverCameraController)
            .setCamera(0, 0, 120, new Vector3(0, 0, 0));

        this.view = new View3D();
        this.view.scene = this.scene;
        this.view.camera = camera;
        this.engine.startRenderView(this.view);

        await this.createSphere();
        this.initGUI();
    }

    private async createSphere() {
        const obj = new Object3D();
        const mr = obj.addComponent(MeshRenderer);
        // Skip zPrePass for this transmission/blend material —
        // PassGenerate.createDepthPass doesn't fully mirror the
        // alphaMode='BLEND' + transmission state of the COLOR pass,
        // so the auto-generated DEPTH pipeline ends up with a
        // BindGroupLayout that disagrees with COLOR at runtime
        // (BindGroupLayout "fspbrlitshader 26" vs "28" mismatch).
        // The transparent pass loads existing depth anyway, so a
        // pre-depth contribution from this mesh isn't needed.
        mr.addMask(RendererMask.IgnoreDepthPass);
        mr.geometry = new SphereGeometry(20, 64, 32);

        // Standard PBR transmission defaults
        // (color=#ffffff, transmission=1, opacity=1, metalness=0,
        // roughness=0, ior=1.5, thickness=10, specularIntensity=1,
        // specularColor=#ffffff, envMapIntensity=1).
        const mat = new LitMaterial();
        mat.alphaMode = 'BLEND';
        mat.baseColor = new Color(1, 1, 1, 1);
        mat.metallic = 0;
        mat.roughness = 0;
        mat.ior = 1.5;
        mat.transmissionFactor = 1.0;
        mat.thicknessFactor = 10.0;
        mat.attenuationColor = new Color(1, 1, 1, 1);
        mat.attenuationDistance = Number.POSITIVE_INFINITY;
        // Procedural 2×2 alpha map.
        // Top-left + bottom-right cells fully transparent (alpha=0),
        // the other two fully opaque (alpha=255). When sampled across
        // the sphere's UVs this paints two quadrants where the alpha
        // cuts away the surface entirely so you see the HDR sky
        // directly through the sphere; the other two quadrants render
        // the lit + transmissive material.
        mat.maskMap = this.makeAlphaMap();

        mr.material = mat;
        this.scene.addChild(obj);
        this.mat = mat;
    }

    private makeAlphaMap(): BitmapTexture2D {
        // Horizontal stripe pattern that wraps as 4 rings around the
        // sphere — the alpha-cut produces 4 floating bands separated
        // by transparent gaps (poles compress to thin caps, equator
        // strip is the widest band).
        //
        // Texture is 32 wide × 128 tall: width hits the 32-px minimum
        // the WebGPU filtering-sampler path requires, height is split
        // into 4 horizontal rows so each 32×32 row maps to a quarter
        // of the sphere's V-range. Rows alternate white (alpha=1,
        // surface visible) and black (alpha=0, surface cut away).
        // 8 horizontal rows alternating opaque (alpha=1, surface
        // visible) and transparent (alpha=0, surface cut away). When
        // the sphere's V coordinate runs pole-to-pole, this produces
        // 4 floating bands (small cap at top, two large bowls in the
        // middle, small cap at bottom) separated by 4 see-through
        // gaps — the standard alpha-stripe transmission visual.
        //
        // Canvas2D `fillStyle = '#000000'` produces alpha=255 (opaque
        // black), not alpha=0. clearRect on a fresh canvas leaves
        // alpha=0; only the visible rows get filled white afterward.
        const stripeCount = 8;
        const stripeHeight = 32;
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = stripeCount * stripeHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < stripeCount; i++) {
            if (i % 2 === 0) {
                ctx.fillRect(0, i * stripeHeight, canvas.width, stripeHeight);
            }
        }

        // useMipmap=true so the texture spawns a filtering sampler
        // compatible with the LitMaterial bind group.
        const tex = new BitmapTexture2D(true, this.engine.context3D);
        tex.flipY = false;
        tex.source = canvas;
        return tex;
    }

    private initGUI() {
        if (!this.mat) return;

        const params = {
            color: { rgba: [255, 255, 255, 1] },
            transmission: 1,
            opacity: 1,
            metalness: 0,
            roughness: 0,
            ior: 1.5,
            thickness: 10,
            specularIntensity: 1,
            specularColor: { rgba: [255, 255, 255, 1] },
            envMapIntensity: 1,
            exposure: 1,
        };

        GUIHelp.addColor(params, 'color').onChange(() => {
            const c = (params.color as any).rgba;
            this.mat.baseColor = new Color(
                c[0] / 255, c[1] / 255, c[2] / 255,
                this.mat.baseColor.a,
            );
        });
        GUIHelp.add(params, 'transmission', 0, 1, 0.01).onChange(() => {
            // Drive the uniform directly to avoid LitMaterial's
            // transmissionFactor setter, which flips the
            // USE_TRANSMISSION define when value crosses 0. Flipping
            // the define recompiles the COLOR pass with a new
            // BindGroupLayout while the auto-generated DEPTH pass
            // still holds the old one — every subsequent zPrePass
            // tries to bind a mismatched group and floods the console
            // with GPUValidationError. Keeping the define pinned
            // (via the initial transmissionFactor = 1 in createSphere)
            // and only changing the runtime uniform value gives the
            // same visual effect at 0 (transmission factor = 0
            // mathematically yields no transmission contribution)
            // without the layout churn.
            (this.mat as any).shader.setUniformFloat('transmissionFactor', params.transmission);
        });
        GUIHelp.add(params, 'opacity', 0, 1, 0.01).onChange(() => {
            const c = this.mat.baseColor;
            this.mat.baseColor = new Color(c.r, c.g, c.b, params.opacity);
        });
        GUIHelp.add(params, 'metalness', 0, 1, 0.01).onChange(() => {
            this.mat.metallic = params.metalness;
        });
        GUIHelp.add(params, 'roughness', 0, 1, 0.01).onChange(() => {
            this.mat.roughness = params.roughness;
        });
        GUIHelp.add(params, 'ior', 1, 2, 0.01).onChange(() => {
            this.mat.ior = params.ior;
        });
        GUIHelp.add(params, 'thickness', 0, 50, 0.1).onChange(() => {
            this.mat.thicknessFactor = params.thickness;
        });

        const applySpecular = () => {
            const c = (params.specularColor as any).rgba;
            const k = params.specularIntensity;
            (this.mat as any).shader.setUniformColor(
                'specularColor',
                new Color(c[0] / 255, c[1] / 255, c[2] / 255, k),
            );
        };
        GUIHelp.add(params, 'specularIntensity', 0, 1, 0.01).onChange(applySpecular);
        GUIHelp.addColor(params, 'specularColor').onChange(applySpecular);

        GUIHelp.add(params, 'envMapIntensity', 0, 2, 0.01).onChange(() => {
            (this.mat as any).shader.envIntensity = params.envMapIntensity * this.envBaseIntensity;
        });
        GUIHelp.add(params, 'exposure', 0, 2, 0.01).onChange(() => {
            // Drive the global tonemap exposure — equivalent to a
            // renderer.toneMappingExposure slider.
            this.engine.setting.render.tonemap.exposure = params.exposure;
        });

        GUIHelp.open();
    }
}

new Sample_Transmission().run();
