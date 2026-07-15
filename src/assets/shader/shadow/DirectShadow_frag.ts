/**
 * @internal
 * Directional-light shadow sampling (with optional CSM blending).
 * Depends on ShadowCommon, PCF_frag, CSM_frag plus GlobalUniform / LightData
 * from the host shader.
 */
export let DirectShadow_frag: string = /*wgsl*/ `
    fn directShadowMaping()  {
        // Evaluate world-position derivatives once at function entry while
        // control flow is still uniform (pre-loop, pre-break). WGSL's
        // derivative_uniformity rule is pessimistic about loops containing
        // data-dependent breaks (CSM early-exit below), so computing
        // dpdx/dpdy later — even one line before the break — gets rejected.
        let dWorldPosDx = dpdx(ORI_VertexVarying.vWorldPos.xyz);
        let dWorldPosDy = dpdy(ORI_VertexVarying.vWorldPos.xyz);
        for (var i: i32 = 0; i < dirCount; i = i + 1) {
          if( i >= globalUniform.nDirShadowStart && i < globalUniform.nDirShadowEnd ) {
            var visibility = 1.0;
            let ldx = globalUniform.shadowLights[u32(i) / 4u][u32(i) % 4u];
            let light = lightBuffer[u32(ldx)];
            var shadowIndex = i32(light.castShadow);
            var shadowMatrix:mat4x4<f32>;

            #if USE_CSM
              if (light.csmShadowMapIndex >= 0){
                  visibility = 0.0;
                  var validCount = 0;
                  var totalWeight = 0.0;
                  for(var csm: i32 = 0; csm < csmCount; csm++) {
                    shadowMatrix = globalUniform.shadowMatrix[shadowIndex + csm];
                    let csmShadowResult = directShadowMapingIndex(light, shadowMatrix, shadowIndex + csm, light.shadowBias[csm], light.normalBias[csm], dWorldPosDx, dWorldPosDy);
                    if(csmShadowResult.y < 0.5) {
                      validCount++;

                      var weight:f32 = calcCSMBlendWeight(csmShadowResult.zw);

                      if(validCount == 1 && csm == csmCount - 1){
                        visibility = 1.0 - weight + csmShadowResult.x * weight;
                        totalWeight = 1.0;
                      } else {
                        weight *= 1.0 - totalWeight;
                        visibility += csmShadowResult.x * weight;
                        totalWeight += weight;
                      }
                      if(validCount >= 2 || totalWeight >= 0.99) {
                        csmLevel = csm;
                        break;
                      }
                    }
                  }
                  totalWeight += 0.0001;
                  if(validCount == 0) {
                    visibility = 1.0;
                  } else {
                    visibility = visibility / totalWeight;
                  }
              } else {
                shadowMatrix = globalUniform.shadowMatrix[shadowIndex];
                visibility = directShadowMapingIndex(light, shadowMatrix, shadowIndex, light.shadowBias[0], light.normalBias[0], dWorldPosDx, dWorldPosDy).x;
              }
            #else
              shadowMatrix = globalUniform.shadowMatrix[shadowIndex];
              visibility = directShadowMapingIndex(light, shadowMatrix, shadowIndex, light.shadowBias[0], light.normalBias[0], dWorldPosDx, dWorldPosDy).x;
            #endif
            directShadowVisibility[shadowIndex] = visibility;
          }
        }

    }

    fn directShadowMapingIndex(light: LightData, shadowMatrix: mat4x4<f32>, depthTexIndex: i32, shadowBias: f32, normalBias: f32, dWorldPosDx: vec3<f32>, dWorldPosDy: vec3<f32>) -> vec4<f32>
    {
      var visibility = 1.0;
      var isOutSideArea:f32 = 1.0;
      var varying_shadowUV:vec2<f32> = vec2<f32>(0.0);
      #if USE_SHADOWMAPING
        // RFC-003 Layer B (normalBias): push receiver along surface normal in
        // world space before the shadow-space transform.
        // RFC-003 Layer C (shadowBias): the incoming shadowBias is the
        // quantization baseline. We add a per-fragment slope term derived
        // analytically from dpdx/dpdy of worldPos (passed in as caller is in
        // uniform control flow) transformed into shadow-space Z. The result
        // equals dpdx(shadowPos.z) under an orthographic light camera
        // (w = 1 always), and matches a receiver-plane bias without the
        // matrix inverse. Capped at 8× baseline to keep silhouette-edge
        // derivative spikes from producing runaway peter-panning.
        // IMPORTANT (cross-platform): normalize() of a zero-length vector is
        // undefined in WGSL. Dawn's Metal backend typically returns (0,0,0)
        // while Dawn's D3D12 backend can return NaN — which propagates into
        // receiverPos and compareZ and a 'less' compare sampler can treat NaN
        // as "pass" → no shadows on Windows. Guard against a zero fragment
        // normal before using N for normalBias.
        let Nraw = fragData.N;
        let N_len2 = dot(Nraw, Nraw);
        let N = select(vec3<f32>(0.0, 1.0, 0.0), Nraw * inverseSqrt(max(N_len2, 1e-30)), N_len2 > 1e-8);
        // Safe-normalize of the vector pointing from fragment toward the
        // light. Used both for the NoL-based bias amplifier below and for
        // the analytic shadow-space slope. D3D12 returns NaN on a zero
        // vector via normalize(); guard with select() + inverseSqrt.
        let dirRaw = -light.direction;
        let dir_len2 = dot(dirRaw, dirRaw);
        let L = select(vec3<f32>(0.0, 0.0, -1.0), dirRaw * inverseSqrt(max(dir_len2, 1e-30)), dir_len2 > 1e-8);
        let NoL = max(dot(N, L), 0.1);

        let receiverPos = ORI_VertexVarying.vWorldPos.xyz + N * normalBias;
        var shadowPosTmp = shadowMatrix * vec4<f32>(receiverPos, 1.0);
        var shadowPos = shadowPosTmp.xyz / shadowPosTmp.w;
        varying_shadowUV = shadowPos.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
        // Classic receiver-slope bias: shadowBias / NoL. One texel on a
        // receiver tilted against the light direction stretches by 1/NoL
        // in the projected-light-direction axis, which is exactly the
        // direction depth varies along, so bias must grow the same way to
        // cover one-texel quantization on the receiver plane. Floor NoL
        // at 0.1 (10x cap) — matches common PBR-pipeline behaviour and keeps
        // silhouette-edge derivative spikes bounded.
        //
        // Additionally fold in a screen-space slope term (Plan C analytic
        // derivative of shadowPos.z via shadowMatrix row 2 and dpdx(worldPos))
        // so heavily foreshortened main-camera views still get adequate
        // bias even at non-grazing light NoL. Capped at 32x baseline.
        let slopeNoL = shadowBias / NoL;
        let zRow = vec3<f32>(shadowMatrix[0].z, shadowMatrix[1].z, shadowMatrix[2].z);
        let dShadowZdx = dot(zRow, dWorldPosDx);
        let dShadowZdy = dot(zRow, dWorldPosDy);
        let slopeScreen = max(abs(dShadowZdx), abs(dShadowZdy)) * 1.5;
        let maxSlope = shadowBias * 32.0;
        let effectiveShadowBias = min(max(slopeNoL, shadowBias + slopeScreen), maxSlope);
        if (varying_shadowUV.x <= 1.0
          && varying_shadowUV.x >= 0.0
          && varying_shadowUV.y <= 1.0
          && varying_shadowUV.y >= 0.0
          && shadowPosTmp.z <= 1.0
          && shadowPosTmp.z >= 0.0)
        {
          isOutSideArea = 0.0;
          let uvOnePixel = 1.0 / vec2<f32>(globalUniform.shadowMapSize) ;
          let refDepth = shadowPos.z - effectiveShadowBias;
          #if USE_HARD_SHADOW
            visibility = sampleHard_Direct(varying_shadowUV, depthTexIndex, refDepth);
          #else
            #if USE_SOFT_SHADOW
              // PCSS — contact-hardening soft shadow. Per-light softness
              // (shader: light.softness) overrides the global knob when set
              // to a positive value. Global fallback: max(shadowSoft*4, 4)
              // texels so SOFT mode is visibly softer than PCF by default.
              let pcssLightSize = select(
                  max(globalUniform.shadowSoft * 4.0, 4.0),
                  light.softness,
                  light.softness > 0.0
              );
              visibility = samplePCSS_Direct(varying_shadowUV, depthTexIndex, refDepth, uvOnePixel, pcssLightSize);
            #else
              // Default PCF path (USE_PCF_SHADOW, or unset). Live-tunable
              // kernel scale — globalUniform.pcfKernelScale multiplies the
              // per-tap texel step. 1.0 = standard 3x3 spacing, 2.0 = 5x5-
              // equivalent spread, etc. Falls back to 1.0 when the host
              // doesn't populate the field (legacy clients).
              let kernelScale = max(globalUniform.pcfKernelScale, 0.01);
              visibility = samplePCF3x3_Direct(varying_shadowUV, depthTexIndex, refDepth, uvOnePixel * kernelScale);
            #endif
          #endif
          // Smooth fade across the last 10% of the shadow frustum's depth
          // range so receivers don't pop from "shadowed" to "fully lit"
          // when they leave the ortho depth range. Matches the frustum-
          // edge fade common to shadow-map implementations.
          let edgeFade = smoothstep(0.9, 1.0, shadowPos.z);
          visibility = mix(visibility, 1.0, edgeFade);
      }
      #endif
      return vec4<f32>(visibility, isOutSideArea, varying_shadowUV);
    }
`
