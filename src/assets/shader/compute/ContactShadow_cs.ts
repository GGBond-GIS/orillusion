/**
 * Contact Shadows — screen-space ray-march along the dominant
 * directional light. Cheap, ~16 steps; designed to add the
 * fine-grained "contact darkness" that CSM can't capture
 * (object-on-floor, finger-on-table). Reads scene depth + normal from
 * the GBuffer, samples the first directional light from the lightBuffer
 * for direction, and modulates the in-color buffer by the resulting
 * shadow factor.
 *
 * MVP path: applied as a post-pass to the lit scene color (multiplies
 * the contact factor into RGB). Future upgrade: feed into PBR shader's
 * directShadowVisibility[0] via a separate R8 RT.
 *
 * @internal
 */
export let ContactShadow_cs: string = /*wgsl*/`
    #include "GlobalUniform"
    #include "GBufferStand"
    #include "LightData"

    const PI: f32 = 3.1415926;

    struct ContactShadowSettings {
        maxStepCount: f32,
        maxDistance: f32,
        thickness: f32,
        bias: f32,
        intensity: f32,
        _pad0: f32,
        _pad1: f32,
        _pad2: f32,
    };

    @group(0) @binding(2) var<uniform> csSettings: ContactShadowSettings;
    @group(0) @binding(3) var<storage, read> lightBuffer: array<LightData>;
    @group(0) @binding(4) var inTex: texture_2d<f32>;
    @group(0) @binding(5) var outTex: texture_storage_2d<rgba16float, write>;

    var<private> texSize: vec2<u32>;
    var<private> fragCoord: vec2<i32>;
    var<private> fragUV: vec2<f32>;
    var<private> gBuffer: GBuffer;

    fn findFirstDirLight() -> i32 {
        // Scan the shadowLights packed indices for the first valid entry.
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
        let visible = getRoughnessFromGBuffer(gBuffer);
        if (visible <= 0.0) {
            // sky pixel — no contact shadow
            textureStore(outTex, fragCoord, oc);
            return;
        }

        let lightIdx = findFirstDirLight();
        if (lightIdx < 0) {
            textureStore(outTex, fragCoord, oc);
            return;
        }
        let light = lightBuffer[u32(lightIdx)];

        // Reconstruct world position + view-space ray origin
        useNormalMatrixInv();
        let worldPos = getWorldPositionFromGBuffer(gBuffer, fragUV);
        let normal = getWorldNormalFromGBuffer(gBuffer);

        // Light direction points FROM light → surface, so we ray-march
        // TOWARD the light by negating it.
        let toLight = normalize(-light.direction);
        let NoL = dot(normal, toLight);
        if (NoL <= 0.05) {
            // Back-facing surface: no contact shadow needed (fully shadowed
            // by self-occlusion which the lighting already handles).
            textureStore(outTex, fragCoord, oc);
            return;
        }

        // Slope-scaled bias: at grazing NoL the ray walks far along the
        // plane per step, so the origin offset must grow to clear the
        // thickness band before noise can fake a hit.
        let scaledBias = csSettings.bias / max(NoL, 0.2);
        let originVS = (globalUniform.viewMat * vec4<f32>(worldPos + normal * scaledBias, 1.0)).xyz;

        let toLightVS = normalize((globalUniform.viewMat * vec4<f32>(toLight, 0.0)).xyz);

        let stepCount = i32(clamp(csSettings.maxStepCount, 4.0, 64.0));
        let stepLen = csSettings.maxDistance / f32(stepCount);

        var occluded: f32 = 0.0;
        for (var s: i32 = 1; s <= stepCount; s = s + 1) {
            let samplePosVS = originVS + toLightVS * (stepLen * f32(s));
            let sampleClip = globalUniform.projMat * vec4<f32>(samplePosVS, 1.0);
            if (sampleClip.w <= 0.0) { break; }
            let sampleNDC = sampleClip.xyz / sampleClip.w;
            let sampleUV = sampleNDC.xy * vec2<f32>(0.5, -0.5) + 0.5;
            if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) { break; }

            let sampleCoord = vec2<i32>(sampleUV * vec2<f32>(texSize));
            let sampleGB = getGBuffer(sampleCoord);
            if (getRoughnessFromGBuffer(sampleGB) <= 0.0) { continue; } // sky

            let sceneWorldPos = getWorldPositionFromGBuffer(sampleGB, sampleUV);

            // Self-surface reject. Two-stage filter:
            //   (a) absolute floor: anything within 10cm above the
            //       tangent plane is treated as same-surface. Empirically
            //       the back-projection at far-ground origins (view-Z
            //       >100m) yields scene worldPos.y deviating by ~3-7cm
            //       from the true ground plane, which is enough to slip
            //       past any 1-2cm bias and fire a thickness-band hit.
            //       The original fp32-precision argument predicts mm
            //       noise; the empirical mismatch is an order larger,
            //       hence the conservative floor.
            //   (b) angular: shallower than ~4 deg above the plane is
            //       same-surface; auto-scales with sample distance so
            //       the test still bites at intermediate ranges.
            // Trade-off: contact shadow within 10cm of the receiver is
            // lost. Sub-10cm details (finger-on-table) would need a
            // different reconstruction strategy (read depth32 directly
            // rather than the fp32-encoded-NDC-z GBuffer slot).
            let toSample = sceneWorldPos - worldPos;
            let sampleDist2 = dot(toSample, toSample);
            let sinElev = dot(toSample, normal);
            if (sinElev <= 0.0 || sinElev < 0.1 || sinElev * sinElev < sampleDist2 * 0.005) { continue; }

            // LH view space (clip.w = +viewZ): points in front of camera
            // have z > 0; "ray behind surface" ⇔ ray.z > scene.z.
            let sceneViewZ = (globalUniform.viewMat * vec4<f32>(sceneWorldPos, 1.0)).z;
            let zDiff = samplePosVS.z - sceneViewZ;
            if (zDiff > 0.0 && zDiff < csSettings.thickness) {
                let falloff = 1.0 - f32(s) / f32(stepCount);
                occluded = max(occluded, falloff);
                break;
            }
        }

        let shadowFactor = 1.0 - occluded * csSettings.intensity;
        textureStore(outTex, fragCoord, vec4<f32>(oc.rgb * shadowFactor, oc.a));
    }
`;
