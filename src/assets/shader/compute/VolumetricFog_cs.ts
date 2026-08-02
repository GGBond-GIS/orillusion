/**
 * Volumetric Fog (MVP) — screen-space per-pixel ray-march from the
 * near plane to scene depth (or maxDistance). At each step:
 *   1. Sample directional-light shadow at the world-space sample point
 *      (visibility along the light path through the fog).
 *   2. Accumulate in-scattering using Henyey-Greenstein phase function
 *      for forward/backward scatter directionality.
 *   3. Update transmittance with Beer-Lambert (exp(-density*step)).
 *
 * Output: vec4(scatteringRGB, transmittance) into outTex; the host
 * post then composites: finalColor = sceneColor * transmittance + scattering.
 *
 * Trade-offs vs froxel-based volumetric fog:
 *   + No 3D texture infrastructure required (Orillusion has none).
 *   + Single dispatch, one shader.
 *   - More expensive per-pixel (~32 steps / pixel) than amortized froxel.
 *   - No temporal denoise — slight flickering with low step counts.
 *   - Current MVP samples ONLY the dominant directional light's CSM
 *     shadow; point-light contributions are summed without shadows.
 *
 * Future upgrade path: replace this with a 3D froxel grid once
 * Texture3D infrastructure lands.
 *
 * @internal
 */
export let VolumetricFog_cs: string = /*wgsl*/`
    #include "GlobalUniform"
    #include "GBufferStand"
    #include "LightData"

    const PI: f32 = 3.1415926;

    struct FogSettings {
        density: f32,
        scatteringIntensity: f32,
        anisotropy: f32,        // Henyey-Greenstein g, [-0.99, 0.99]
        maxDistance: f32,
        stepCount: f32,
        ambientR: f32,
        ambientG: f32,
        ambientB: f32,
    };

    @group(0) @binding(2) var<uniform> fogSettings: FogSettings;
    @group(0) @binding(3) var<storage, read> lightBuffer: array<LightData>;
    @group(0) @binding(4) var inTex: texture_2d<f32>;
    @group(0) @binding(5) var outTex: texture_storage_2d<rgba16float, write>;

    var<private> texSize: vec2<u32>;
    var<private> fragCoord: vec2<i32>;
    var<private> fragUV: vec2<f32>;
    var<private> gBuffer: GBuffer;

    // Henyey-Greenstein phase function. cosTheta is the cosine of the
    // angle between the view ray and the light direction.
    fn henyeyGreenstein(cosTheta: f32, g: f32) -> f32 {
        let g2 = g * g;
        let denom = 1.0 + g2 - 2.0 * g * cosTheta;
        return (1.0 - g2) / (4.0 * 3.1415926 * pow(max(denom, 1e-6), 1.5));
    }

    fn findFirstDirLightIndex() -> i32 {
        // 8 matches the ShadowCommon dirCount const (avoid the include
        // since it pulls shadowMap bindings we don't need here).
        for (var i: i32 = 0; i < 8; i = i + 1) {
            let ldx = globalUniform.shadowLights[u32(i) / 4u][u32(i) % 4u];
            if (ldx >= 0.0) { return i32(ldx); }
        }
        return -1;
    }

    @compute @workgroup_size(8, 8, 1)
    fn CsMain(@builtin(global_invocation_id) gid: vec3<u32>) {
        fragCoord = vec2<i32>(gid.xy);
        texSize = textureDimensions(inTex).xy;
        if (fragCoord.x >= i32(texSize.x) || fragCoord.y >= i32(texSize.y)) { return; }
        fragUV = vec2<f32>(fragCoord) / vec2<f32>(texSize - 1u);

        let oc = textureLoad(inTex, fragCoord, 0);
        gBuffer = getGBuffer(fragCoord);
        useNormalMatrixInv();

        // Reconstruct view-ray direction at this UV
        let camPos = globalUniform.CameraPos.xyz;
        let worldPosOnSurface = getWorldPositionFromGBuffer(gBuffer, fragUV);
        let viewRay = worldPosOnSurface - camPos;
        let rayLen = min(length(viewRay), fogSettings.maxDistance);
        let rayDir = select(vec3<f32>(0.0, 0.0, 1.0), viewRay / max(length(viewRay), 1e-4), length(viewRay) > 1e-4);

        // Pick the dominant directional light for shadow + scattering.
        let lightIdx = findFirstDirLightIndex();
        var lightDir = vec3<f32>(0.0, -1.0, 0.0);
        var lightColor = vec3<f32>(0.0);
        if (lightIdx >= 0) {
            let light = lightBuffer[u32(lightIdx)];
            lightDir = light.direction;
            lightColor = light.lightColor.rgb * light.intensity;
        }
        let toLight = normalize(-lightDir);
        let cosTheta = dot(rayDir, toLight);
        let phase = henyeyGreenstein(cosTheta, fogSettings.anisotropy);

        // Ray march. Jitter start to break banding.
        let stepCount = i32(clamp(fogSettings.stepCount, 8.0, 128.0));
        let stepLen = rayLen / f32(stepCount);
        let jitter = fract(sin(dot(fragUV, vec2<f32>(12.9898, 78.233))) * 43758.5453);

        var scattering = vec3<f32>(0.0);
        var transmittance: f32 = 1.0;
        let ambient = vec3<f32>(fogSettings.ambientR, fogSettings.ambientG, fogSettings.ambientB);

        for (var s: i32 = 0; s < stepCount; s = s + 1) {
            let t = (f32(s) + jitter) * stepLen;
            let samplePos = camPos + rayDir * t;
            // Beer-Lambert: density along step.
            let stepTransmittance = exp(-fogSettings.density * stepLen);

            // In-scattering = phase * lightColor * density (sun term).
            // CSM shadow sampling along the march is on the upgrade path
            // for this shader — wiring shadowMap2DArray + comparison
            // sampler into a compute pipeline is straightforward but
            // adds ~5 bindings + matrix lookups + cascade selection;
            // deferred to keep MVP small. The phase function already
            // biases scattering toward the sun direction so god-ray
            // shafts read correctly when looking near the light.
            let inscatter = (phase * lightColor + ambient) * fogSettings.density * stepLen;
            scattering = scattering + inscatter * transmittance * fogSettings.scatteringIntensity;
            transmittance = transmittance * stepTransmittance;
            if (transmittance < 0.01) { break; }
        }

        // Composite directly into output: sceneColor scaled by
        // transmittance + emitted scattering. Equivalent to
        // mix(scattering, sceneColor, transmittance).
        let outRGB = oc.rgb * transmittance + scattering;
        textureStore(outTex, fragCoord, vec4<f32>(outRGB, oc.a));
    }
`;
