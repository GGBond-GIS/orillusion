/**
 * @internal
 * Point-light cube-map shadow sampling.
 * Three compile branches: USE_PCF_SHADOW / USE_SOFT_SHADOW / USE_HARD_SHADOW.
 * Depends on ShadowCommon, GlobalUniform, LightData, ORI_ShadingInput.
 */
export let PointShadow_frag: string = /*wgsl*/ `
    fn pointShadowMapCompare(){
      let worldPos = ORI_VertexVarying.vWorldPos.xyz;

      for (var i: i32 = 0; i < pointCount ; i = i + 1) {
        if( i >= globalUniform.nPointShadowStart && i < globalUniform.nPointShadowEnd ){
          let ldx = globalUniform.shadowLights[u32(i) / 4u][u32(i) % 4u];
          let light = lightBuffer[u32(ldx)] ;

          #if USE_SHADOWMAPING
              let lightPos = light.position.xyz;
              var shadow = 0.0;
              // RFC-003: shadowBias is a world-space distance subtracted from the
              // measured fragment-to-light distance; normalBias offsets the receiver
              // along its normal first to mitigate acne on grazing surfaces.
              //
              // IMPORTANT (cross-platform): normalize() of a zero-length vector is
              // undefined in WGSL. Metal returns (0,0,0), Dawn D3D12 returns NaN,
              // and once NaN is in compareZ the depth-compare sampler treats
              // NaN ref as "pass" on Windows, giving no shadows. Use select +
              // manual inverseSqrt to stay data-defined even for degenerate
              // normals or unset light.position.
              let Nraw = ORI_ShadingInput.Normal;
              let N_len2 = dot(Nraw, Nraw);
              let N = select(vec3<f32>(0.0, 1.0, 0.0), Nraw * inverseSqrt(max(N_len2, 1e-30)), N_len2 > 1e-8);
              let unshiftedLen = length(worldPos - lightPos.xyz);
              let lengthScale = min(unshiftedLen / max(light.range, 1.0), 1.0);
              let receiverPos = worldPos + N * (light.normalBias[0] * lengthScale);
              let frgToLight = receiverPos - lightPos.xyz;
              let frg_len2 = dot(frgToLight, frgToLight);
              var dir: vec3<f32> = select(vec3<f32>(1.0, 0.0, 0.0), frgToLight * inverseSqrt(max(frg_len2, 1e-30)), frg_len2 > 1e-8);
              var len = sqrt(max(frg_len2, 0.0));
              let shadowFarDecode = select(globalUniform.far, light.shadowFar, light.shadowFar > 0.0);
              // Analytic receiver-plane bias for cube shadow texel
              // quantization. A cube texel's footprint on the receiver is a
              // stretched ellipse with semi-major ~ len / (mapSize * NoL).
              // Depth variation within one texel is bounded by that
              // footprint; screen-space dpdx is *not* the right metric here
              // because cube shadow view and main camera view are independent.
              // NoL floor 0.05 caps the amplifier at 20x.
              let NoL = max(dot(N, -dir), 0.05);
              let worldBias = (light.shadowBias[0] * lengthScale) / NoL;
              let compareZ = (len - worldBias) / shadowFarDecode;

              // Tangent basis around 'dir' for projecting Poisson disk
              // offsets onto the cube-face tangent plane. 'up' picked to be
              // non-parallel to dir to avoid cross() collapsing to zero.
              let upAxis = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(0.0, 1.0, 0.0), abs(dir.y) < 0.9);
              let tRight = normalize(cross(upAxis, dir));
              let tUp = cross(dir, tRight);

              #if USE_HARD_SHADOW
                let depth = textureSampleCompareLevel(pointShadowMap, pointShadowMapSampler, dir, light.castShadow, compareZ);
                shadow = 1.0 - depth;
              #else
                #if USE_SOFT_SHADOW
                  // Cube PCSS — blocker search in angular space, penumbra
                  // estimated from (refDepth - avgBlocker) / avgBlocker.
                  // Per-light softness overrides the global knob when > 0.
                  // Units: multiplier on a 4-texel base angle (4/512 rad).
                  let pcssSoftBase = select(max(globalUniform.shadowSoft, 1.0), light.softness, light.softness > 0.0);
                  let pcssLightSize = pcssSoftBase * (4.0 / 512.0);
                  var avgBlocker = 0.0;
                  var numBlockers = 0.0;
                  for (var j = 0; j < 16; j++) {
                      let p = POISSON_DISK_16[j];
                      let searchDir = normalize(dir + (tRight * p.x + tUp * p.y) * pcssLightSize);
                      let sampleDepth = textureSampleLevel(pointShadowMap, pointShadowMapSamplerRaw, searchDir, light.castShadow, 0i);
                      if (sampleDepth < compareZ) {
                          avgBlocker += sampleDepth;
                          numBlockers += 1.0;
                      }
                  }
                  if (numBlockers < 0.5) {
                      shadow = 0.0;
                  } else {
                      let avgBlockerDepth = avgBlocker / numBlockers;
                      let penumbra = max(compareZ - avgBlockerDepth, 0.0) / max(avgBlockerDepth, 1e-5);
                      let filterRadius = min(penumbra * pcssLightSize, pcssLightSize);
                      shadow = 0.0;
                      for (var j = 0; j < 16; j++) {
                          let p = POISSON_DISK_16[j];
                          let offsetDir = normalize(dir + (tRight * p.x + tUp * p.y) * filterRadius);
                          let d = textureSampleCompareLevel(pointShadowMap, pointShadowMapSampler, offsetDir, light.castShadow, compareZ);
                          shadow += 1.0 - d;
                      }
                      shadow = shadow * (1.0 / 16.0);
                  }
                #else
                  // USE_PCF_SHADOW (default). Tangent-plane 16-Poisson at
                  // one-cube-texel angular radius (default shadow map 1024).
                  // Scaled by globalUniform.pcfKernelScale so the live GUI
                  // slider in ShadowSetting controls both directional and
                  // cube PCF uniformly.
                  let pcfRadius = (1.0 / 512.0) * max(globalUniform.pcfKernelScale, 0.01);
                  shadow = 0.0;
                  for (var j = 0; j < 16; j++) {
                      let p = POISSON_DISK_16[j];
                      let offsetDir = normalize(dir + (tRight * p.x + tUp * p.y) * pcfRadius);
                      let d = textureSampleCompareLevel(pointShadowMap, pointShadowMapSampler, offsetDir, light.castShadow, compareZ);
                      shadow += 1.0 - d;
                  }
                  shadow = shadow * (1.0 / 16.0);
                #endif
              #endif

              // Smooth fade across the last 5% of the cube shadow's depth
              // range so fragments past the light's range don't hard-edge
              // into "lit". Mirrors the directional frustum-edge fade.
              let edgeFade = smoothstep(0.95, 1.0, len / shadowFarDecode);
              shadow = shadow * (1.0 - edgeFade);

              // Direct write: previous code scanned all pointCount looking
              // for the matching castShadow index, an O(N^2) loop over all
              // shadowed lights.
              pointShadows[i32(light.castShadow)] = 1.0 - shadow;
          #endif
        }
        }
    }
`
