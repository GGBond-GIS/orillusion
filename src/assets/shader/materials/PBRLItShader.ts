/**
 * @internal
 */
export let PBRLItShader: string = /*wgsl*/ `
    #include "Common_vert"
    #include "Common_frag"
    #include "BxDF_frag"
    #include "AlphaHash_frag"

    @group(1) @binding(auto)
    var baseMapSampler: sampler;
    @group(1) @binding(auto)
    var baseMap: texture_2d<f32>;

    @group(1) @binding(auto)
    var normalMapSampler: sampler;
    @group(1) @binding(auto)
    var normalMap: texture_2d<f32>;

    // #if USE_ARMC
        // @group(1) @binding(auto)
        // var maskMapSampler: sampler;
        // @group(1) @binding(auto)
        // var maskMap: texture_2d<f32>;
    // #endif

    // #if USE_MR
        @group(1) @binding(auto)
        var maskMapSampler: sampler;
        @group(1) @binding(auto)
        var maskMap: texture_2d<f32>;
    // #endif

    #if USE_AOTEX
        @group(1) @binding(auto)
        var aoMapSampler: sampler;
        @group(1) @binding(auto)
        var aoMap: texture_2d<f32>;
    #endif

    @group(1) @binding(auto)
    var emissiveMapSampler: sampler;
    @group(1) @binding(auto)
    var emissiveMap: texture_2d<f32>;

    #if USE_TRANSMISSION
        @group(1) @binding(auto)
        var sceneColorPyramidSampler: sampler;
        @group(1) @binding(auto)
        var sceneColorPyramid: texture_2d<f32>;
        #if USE_TRANSMISSIONMAP
            @group(1) @binding(auto)
            var transmissionMapSampler: sampler;
            @group(1) @binding(auto)
            var transmissionMap: texture_2d<f32>;
        #endif
        #if USE_THICKNESSMAP
            @group(1) @binding(auto)
            var thicknessMapSampler: sampler;
            @group(1) @binding(auto)
            var thicknessMap: texture_2d<f32>;
        #endif
    #endif

    var<private> debugOut : vec4f = vec4f(0.0) ;

    fn vert(inputData:VertexAttributes) -> VertexOutput {
        ORI_Vert(inputData) ;
        return ORI_VertexOut ;
    }

    fn frag(){
   
        let baseMapOffsetSize = materialUniform.baseMapOffsetSize;
        var uv = transformUV(ORI_VertexVarying.fragUV0,baseMapOffsetSize) ; 

        #if USE_SRGB_ALBEDO
            ORI_ShadingInput.BaseColor = textureSample(baseMap, baseMapSampler, uv )  ;
            // Sampled value is already linear (rgba8unorm-srgb hardware
            // decode), so no software gammaToLiner. Modulate component-
            // wise with baseColor — rgb*rgb, alpha*alpha. The previous
            // form did vec4*vec3 which WGSL rejects (no matching
            // overload); compilation only failed for assets that
            // actually flipped USE_SRGB_ALBEDO, which was an uncommon
            // path until glTF auto-set it post-#1.
            ORI_ShadingInput.BaseColor = vec4<f32>( ORI_ShadingInput.BaseColor.rgb * materialUniform.baseColor.rgb, ORI_ShadingInput.BaseColor.a * materialUniform.baseColor.a)  ;
        #else
            ORI_ShadingInput.BaseColor = textureSample(baseMap, baseMapSampler, uv )  ;
            ORI_ShadingInput.BaseColor = vec4f(gammaToLiner(ORI_ShadingInput.BaseColor.rgb),ORI_ShadingInput.BaseColor.a)  ;
            ORI_ShadingInput.BaseColor *= vec4f(materialUniform.baseColor.rgba)  ;
        #endif

        let roughnessMapOffsetSize = materialUniform.roughnessMapOffsetSize;
        var uv4 = transformUV(ORI_VertexVarying.fragUV0,roughnessMapOffsetSize); 
        var maskTex = textureSample(maskMap, maskMapSampler, uv4 );
       
        #if USE_ALPHA_A
            ORI_ShadingInput.BaseColor.a =  ORI_ShadingInput.BaseColor.a * (maskTex.a) ;
        #endif

        #if USE_ALPHACUT
            if( (ORI_ShadingInput.BaseColor.a - materialUniform.alphaCutoff) <= 0.0 ){
                // discard kills the fragment; no need to write @location outputs.
                discard;
            }
        #endif

        #if USE_ALPHAHASH
            // Stochastic alpha test: per-fragment threshold from a
            // spatial hash of world position. Combined with TAA jitter
            // the result converges to true alpha over a few frames.
            // Routes through the opaque queue (depthWriteEnabled=true),
            // so writes interact correctly with depth-buffer consumers
            // (shadows, SSR, SSAO, transmission backdrop).
            if (ORI_ShadingInput.BaseColor.a < alphaHash3D(ORI_VertexVarying.vWorldPos.xyz)) {
                discard;
            }
        #endif

        useShadow();

        var roughnessChannel:f32 = 1.0 ;
        #if USE_ROUGHNESS_A
            roughnessChannel = maskTex.a ;
        #else if USE_ROUGHNESS_R
            roughnessChannel = maskTex.r ;
        #else if USE_ROUGHNESS_G
            roughnessChannel = maskTex.g ;
        #else if USE_ROUGHNESS_B
            roughnessChannel = maskTex.b ;
        #else if USE_ALBEDO_A
            roughnessChannel = ORI_ShadingInput.BaseColor.a ;
        #endif  

        #if USE_SMOOTH
            var roughness = ( 1.0 - roughnessChannel ) * materialUniform.roughness;
            ORI_ShadingInput.Roughness = clamp(roughness , 0.0001 , 1.0);
        #else
            ORI_ShadingInput.Roughness = clamp(roughnessChannel * materialUniform.roughness ,0.0001,1.0);
        #endif 

        var metallicChannel:f32 = 1.0 ;
        #if USE_METALLIC_A
            metallicChannel = maskTex.a ;
        #else if USE_METALLIC_R
            metallicChannel = maskTex.r ;
        #else if USE_METALLIC_G
            metallicChannel = maskTex.g ;
        #else if USE_METALLIC_B
            metallicChannel = maskTex.b ;
        #endif    

        ORI_ShadingInput.Metallic = metallicChannel * materialUniform.metallic ;
   
        var aoChannel:f32 = 1.0 ;
        #if USE_AOTEX
            let aoMapOffsetSize = materialUniform.aoMapOffsetSize;
            var aoMapOffsetSizeUV = transformUV(ORI_VertexVarying.fragUV0,aoMapOffsetSize); 
            var aoMap = textureSample(aoMap, aoMapSampler, ORI_VertexVarying.fragUV0 );
            aoChannel = aoMap.g ;
        #else
            #if USE_AO_A
                aoChannel = maskTex.a ;
            #else if USE_AO_R
                aoChannel = maskTex.r ;
            #else if USE_AO_G
                aoChannel = maskTex.g ;
            #else if USE_AO_B
                aoChannel = maskTex.b ;
            #endif  
        #endif

        ORI_ShadingInput.AmbientOcclusion = aoChannel ;
        ORI_ShadingInput.Specular = 1.0 ;

        let emissiveMapOffsetSize = materialUniform.emissiveMapOffsetSize;
        var emissiveUV = transformUV(ORI_VertexVarying.fragUV0,emissiveMapOffsetSize) ;
        #if USE_EMISSIVEMAP
            var emissiveMapColor = textureSample(emissiveMap, emissiveMapSampler , emissiveUV ) ;
            let emissiveColor = materialUniform.emissiveColor.rgb * emissiveMapColor.rgb * materialUniform.emissiveIntensity ;
            ORI_ShadingInput.EmissiveColor = vec4<f32>(emissiveColor.rgb,1.0);
        #else
            let emissiveColor = materialUniform.emissiveColor.rgb * materialUniform.emissiveIntensity ;
            ORI_ShadingInput.EmissiveColor = vec4<f32>(emissiveColor,1.0);
        #endif

        let normalMapOffsetSize = materialUniform.normalMapOffsetSize;
        var nomralUV = transformUV(ORI_VertexVarying.fragUV0,normalMapOffsetSize) ;
        var Normal = textureSample(normalMap,normalMapSampler,nomralUV).rgb ;
        // Flip on back-facing fragments so cullMode='none' surfaces don't
        // receive direct light / shadows on the side facing away from sun.
        let face = select(-1.0, 1.0, ORI_VertexVarying.face);
        let normal = unPackRGNormal(Normal,1.0,face) ;
        ORI_ShadingInput.Normal = normal ;
     
        BxDFShading();

        #if USE_TRANSMISSION
            // KHR_materials_transmission — sample the opaque-world
            // backdrop captured by SceneColorPyramidFeature.
            //
            // Refraction follows the KHR_materials_volume convention:
            // build a 3D refracted ray of length thickness starting
            // from the fragment's world position, then project its
            // exit point back to clip space and sample the pyramid at
            // that UV. This gives per-fragment offsets that depend on
            // surface curvature, view angle, and distance to camera —
            // the volumetric refraction look (gradient amber, multiple
            // colour bands across the body) that the previous flat
            // 2D normal.xy * (ior-1) approximation couldn't produce.
            let screenUV = ORI_VertexVarying.fragCoord.xy /
                vec2f(globalUniform.windowWidth, globalUniform.windowHeight);
            let viewDir = normalize(globalUniform.CameraPos.xyz - ORI_VertexVarying.vWorldPos.xyz);
            let normalWS = normalize(ORI_ShadingInput.Normal);
            // -viewDir points from camera into the surface; refract()
            // returns the transmitted direction continuing through the
            // medium. eta = 1/ior because we go from air (n≈1) into
            // glass (n=ior). For ior ≥ 1 the discriminant stays
            // non-negative so refract never returns the zero TIR
            // sentinel here.
            let refractDir = refract(-viewDir, normalWS, 1.0 / max(materialUniform.ior, 1.0));
            // glTF KHR_materials_volume: thicknessTexture G channel
            // scales thicknessFactor per-fragment, so thin regions
            // (wings, fins) stay bright while only thick regions (a
            // body core) reach full attenuation.
            var thickness = materialUniform.thicknessFactor;
            #if USE_THICKNESSMAP
                thickness = thickness * textureSample(thicknessMap, thicknessMapSampler, uv).g;
            #endif
            // Ray length in world units, scaled per-axis by modelScale
            // (vertex stage computed length(worldMat[i].xyz) into
            // ORI_VertexVarying.modelScale). Uniform meshes collapse to
            // (s,s,s); unscaled to (1,1,1). Matches the standard
            // KHR_materials_volume transmission ray so a stretched
            // glass cube refracts proportionally to its world dims.
            let transmissionRay = refractDir * thickness * ORI_VertexVarying.modelScale;
            let exitWorld = ORI_VertexVarying.vWorldPos.xyz + transmissionRay;
            // Project exit point back to NDC, then to UV space. Y is
            // flipped because WGSL's fragCoord origin is top-left
            // (y-down) while the post-projective NDC has y-up.
            let exitClip = globalUniform.projMat * globalUniform.viewMat * vec4f(exitWorld, 1.0);
            let exitNDC = exitClip.xy / max(exitClip.w, 1e-4);
            let refractedUV = vec2f(exitNDC.x * 0.5 + 0.5, exitNDC.y * -0.5 + 0.5);
            // Clamp to texture interior — the exit point can land
            // outside the framebuffer for thick glass + grazing
            // angles, and clamp behaviour beats whatever the sampler's
            // address mode would do (typically smear edge pixels).
            let sampleUV = clamp(refractedUV, vec2f(0.002), vec2f(0.998));
            // Roughness-aware mip selection. The reference
            // implementation pairs an IOR-roughness adjustment with
            // bicubic sampling; we approximate with a simple linear
            // mapping into the pyramid's mip chain — mip 0 for
            // polished glass, deepest mip for fully rough.
            let pyramidLodMax = f32(textureNumLevels(sceneColorPyramid)) - 1.0;
            // IOR-roughness adjustment: refraction blur scales
            // by an IOR-derived factor. ior=1 (no refraction) drops
            // the factor to 0 → sharp sample regardless of roughness;
            // ior >= 1.5 (typical glass / crystal) clamps the factor
            // to 1 → roughness drives blur as before. Subtle for the
            // common 1.5..2.4 range, important for transmission of
            // very-low-IOR media (water vapour, thin films).
            let iorRoughnessFactor = clamp(materialUniform.ior * 2.0 - 2.0, 0.0, 1.0);
            let effectiveRefractionRoughness = clamp(ORI_ShadingInput.Roughness, 0.0, 1.0) * iorRoughnessFactor;
            let lod = effectiveRefractionRoughness * pyramidLodMax;
            let transmittedRGBA = textureSampleLevel(sceneColorPyramid, sceneColorPyramidSampler, sampleUV, lod);
            let transmitted = transmittedRGBA.rgb;
            // Volumetric attenuation, log-space form (the standard
            // KHR_materials_volume derivation):
            //   coeff       = -log(attenuationColor) / attenuationDistance
            //   transmittance = exp(-coeff * distance)
            //                 = pow(attenuationColor, distance / attenuationDistance)
            // distance is the actual world-space path length light
            // travels through the medium — length(transmissionRay),
            // i.e. thickness already scaled by modelScale (and by the
            // thickness texture above). Using the raw, unscaled
            // thicknessFactor here (as opposed to the ray actually
            // traced above) previously made the exponent too large on
            // any scaled-down mesh, crushing attenuationColor's minor
            // channels toward zero and biasing the result red.
            var transmittance = vec3f(1.0);
            if (materialUniform.attenuationDistance < 1.0e18 && thickness > 0.0) {
                let safeColor = max(materialUniform.attenuationColor.rgb, vec3f(1e-4));
                let ratio = length(transmissionRay) / materialUniform.attenuationDistance;
                transmittance = pow(safeColor, vec3f(ratio));
            }
            var tf = clamp(materialUniform.transmissionFactor, 0.0, 1.0);
            #if USE_TRANSMISSIONMAP
                // glTF spec: transmissionTexture R channel scales the
                // factor per-fragment, so a single material can have
                // opaque + glassy regions (e.g. a window frame).
                tf = tf * textureSample(transmissionMap, transmissionMapSampler, uv).r;
            #endif
            // Tint the transmitted backdrop by baseColor (the user's
            // surface tint) only — transmittance above already fully
            // encodes the attenuationColor absorption via Beer-Lambert,
            // so multiplying attenuationColor in again here would
            // apply it twice (squaring it), over-darkening and
            // red-shifting the result.
            let tint = materialUniform.baseColor.rgb;
            let transmittedTinted = transmitted * transmittance * tint;
            // Default behavior matches the standard KHR_materials_
            // transmission path on an opaque canvas: mix lit color
            // with the attenuated backdrop and keep alpha at 1 so
            // opaque-queue depth and blending semantics hold.
            //
            // When transmissionAlphaMode is non-zero, the fragment also
            // attenuates its output alpha by transmission so an
            // alpha-true swapchain composites whatever lives behind the
            // canvas (HTML page background, video, ...) through the
            // glass — the alpha-canvas transmission trick.
            // Sampling the pyramid alpha for this would feed back
            // into itself (the pyramid is captured AfterOpaque, after
            // this fragment writes), so we derive alpha from 1 - tf
            // directly. The mode is opt-in to preserve existing
            // demos that share an opaque canvas with other geometry.
            let alphaMode = clamp(materialUniform.transmissionAlphaMode, 0.0, 1.0);
            // RGB: in alpha-cutout mode we approximate the standard
            // PBR material's specular-preserving behaviour — the
            // diffuse lobe is replaced by the attenuated backdrop
            // sample, but a fixed fraction of the lit signal (specular
            // + env reflection) survives unattenuated. In opaque mode
            // the original full mix stays; existing samples rely on it
            // for clean refraction through colored backdrops.
            let lit = ORI_FragmentOutput.color.rgb;
            // Pull the *real* IBL specular term BxDF_frag exported via
            // fragData.Specular. The standard PBR transmission flow
            // keeps the diffuse and specular sums separated, applies
            // transmission only to the diffuse, and adds specular back
            // unconditionally. We do the equivalent here by subtracting
            // spec from the combined lit value to approximate the
            // diffuse-only term, mixing that with the refracted env
            // sample, then adding spec back at the end. Without this,
            // transmission=1 used to wipe out the entire lit signal
            // (including specular), producing a glass surface with no
            // visible env reflection / rim highlights — visually much
            // weaker than the reference render at the same parameters.
            let cleanSpec = fragData.Specular;
            let litMinusSpec = max(lit - cleanSpec, vec3f(0.0));
            let diffuseLike = litMinusSpec;
            // In cutout mode tint the preserved highlight by
            // specularColor.rgb. The BRDF LUT's AB.g term keeps the
            // base IBL spec partially white regardless of F0, which
            // dilutes the user's chosen specular hue by the time it
            // reaches the visible output. This local multiplier sits
            // between fragData.Specular and the final composite —
            // direct enough that specular color noticeably tints the
            // dragon's highlights — and is mixed to white at
            // alphaMode=0 so opaque-queue PBR materials are
            // untouched. We mix back to white at metallic=1 so the
            // chrome path still mirrors the env honestly.
            // Specular is preserved on top of transmission in BOTH
            // opaque and cutout branches now (used to be cutout-only,
            // which made transmission=1 read as a flat refraction with
            // no env highlights). specularColor.rgb tints the
            // dielectric F0 to compensate for the BRDF LUT's AB.g
            // term — without it the user-set specular color gets diluted by
            // the time it reaches the visible output. Mix back to
            // white at metallic=1 so the chrome path mirrors the env
            // honestly (KHR_materials_specular spec).
            let specTint = mix(materialUniform.specularColor.rgb, vec3<f32>(1.0), fragData.Metallic);
            let tintedSpec = cleanSpec * specTint;
            let preservedSpec = tintedSpec;
            // KHR_materials_transmission spec: "A material with metallic
            // = 1 cannot transmit light." Standard PBR pipelines get
            // this for free because they multiply diffuse by kD =
            // (1-F)*(1-metallic), so a pure metal has zero diffuse
            // term and transmission, which only replaces diffuse, has
            // no visible effect — the surface becomes a pure mirror.
            // Our diffuseLike here also includes direct-light spec
            // contribution, so we need to gate transmission explicitly
            // by (1 - metallic) to get the same chrome-at-metallic=1
            // look the reference render produces.
            let metalMask = 1.0 - clamp(fragData.Metallic, 0.0, 1.0);
            let effectiveTf = tf * metalMask;
            // bodyRGB is the diffuse / transmitted-backdrop part of
            // the dragon (no specular). Spec is added separately
            // below so it can also contribute on top of the canvas
            // composite over a transparent backdrop (cells region) —
            // matching the standard "specular halo over alpha-canvas"
            // behaviour.
            //
            // Refracted-alpha gating + attenuation fallback. When the
            // refraction sample lands on a canvas-empty pixel
            // (transmittedRGBA.a = 0, e.g. a fragment whose refracted
            // exit point projects into the cells / HTML region),
            // textureSampleLevel returns (0,0,0,0) and the standard
            // transmittedTinted (rgb * transmittance * tint) collapses
            // to black. We instead fall back to a pure-attenuation
            // sample — what a beam of WHITE light would look like
            // after travelling thickness units through the volume.
            // That is transmittance * tint with the source RGB
            // implicitly set to white, and it preserves the dragon's
            // amber body colour over cells so the user sees a
            // continuously-shaded body whether the fragment refracts
            // cloth or cells / page-background.
            let refractCoverage = clamp(transmittedRGBA.a, 0.0, 1.0);
            let transmittedFallback = transmittance * tint;
            let transmittedFinal = mix(transmittedFallback, transmittedTinted, refractCoverage);
            let bodyRGB = mix(diffuseLike, transmittedFinal, effectiveTf);
            let dragonOpaqueRGB = bodyRGB + preservedSpec;
            // Alpha-blend simulation for cutout mode. The standard
            // PBR transparent path sets material.transparent=true and
            // lets the GPU blend state run the over-operator; we draw
            // with BlendMode.NONE in the opaque queue (depth-tested
            // override), so we emulate the same math in the shader.
            // backdropDirect samples the pyramid at THIS fragment's
            // screen position (no refraction offset) — the pyramid
            // contains the rest of the world (cloth / floor / walls)
            // at this stage of the frame thanks to the
            // TransmissionOpaqueFeature pipeline split.
            //
            //   srcA      = opacity * pyramid.a            // standard diffuseColor.a
            //   resultRGB = srcA * dragon + (1 - srcA) * pyramid.a * pyramid.rgb
            //   resultA   = srcA + pyramid.a * (1 - srcA)
            //
            // Cloth region (pyramid.a=1): result collapses to
            // (opacity*dragon + (1-opacity)*cloth, 1) — alpha-blend with
            // cloth, HTML fully blocked.
            // Cells region (pyramid.a=0): srcA=0, result=(0,0) — dragon
            // contributes nothing and the canvas's premultiplied
            // compositor reveals the HTML cell at full strength.
            let backdropDirect = textureSample(sceneColorPyramid, sceneColorPyramidSampler, screenUV);
            let opacity = ORI_FragmentOutput.color.a;
            let bodySrcA = opacity;
            // --- Page transmission through canvas alpha ---
            // The HTML page lives in the browser's DOM compositor, not
            // in the GPU scene, so refraction can never *sample* it.
            // The only way glass can "transmit" the page is to lower
            // the canvas alpha by the transmitted fraction and let the
            // premultiplied compositor blend the page behind us:
            //   out = ownLightRGB + page * (1 - alpha)
            //
            // The transmitted fraction may only reveal the page where
            // the transmitted path truly ends in empty space — i.e.
            // neither the refracted sample (refractCoverage) nor the
            // straight-through backdrop at this pixel (backdropDirect.a
            // — the opaque queue OVERWRITES the color buffer, so
            // anything the pyramid holds here would otherwise be lost,
            // not composited by the browser) has scene coverage.
            let directCov = clamp(backdropDirect.a, 0.0, 1.0);
            let sceneCov = max(refractCoverage, directCov);
            // Per-channel medium filter (Beer-Lambert x surface tint).
            // Source-over only offers a SCALAR (1 - alpha) page term,
            // so the colored filter is decomposed:
            //   - the weakest-transmitted channel (tPass) becomes the
            //     scalar page pass-through -> drives alpha;
            //   - the per-channel excess (mediumVis - tPass) is
            //     emitted as own light under a neutral-bright-page
            //     assumption (pageTintGlow).
            // Over a white page the two recombine to exactly
            // mediumVis * page — amber glass reads amber; over colored
            // cells the hue dominates while the cell still shows
            // through at tPass strength.
            let mediumVis = clamp(transmittance * tint, vec3f(0.0), vec3f(1.0));
            // Floor the scalar pass-through at half the average
            // transmission: a fully saturated filter (e.g. pure-yellow
            // attenuation, min channel = 0) would otherwise drive
            // alpha to 1 and read as opaque emissive plastic instead
            // of stained glass. The floor trades a little hue
            // saturation for guaranteed see-through.
            let minVis = min(mediumVis.r, min(mediumVis.g, mediumVis.b));
            let avgVis = dot(mediumVis, vec3f(1.0 / 3.0));
            let tPass = max(minVis, 0.5 * avgVis);
            let pageFrac = 1.0 - sceneCov;
            // The DOM page cannot be refraction-sampled, so a straight
            // scalar pass-through renders the page rigidly undistorted
            // — jarring next to the properly refracted in-scene
            // backdrop. Approximate the glassy read with the two
            // signals refraction produces on the scene side:
            //   - Schlick Fresnel: grazing fragments transmit less and
            //     reflect more, so rims go spec/body instead of page;
            //   - bend fade: where the screen-space refraction offset
            //     is large, the straight-through page is not what the
            //     transmitted ray would actually see — fade it out and
            //     let the medium glow / specular take over, mirroring
            //     the "busy" look of strongly bent regions over cloth.
            let pageNoV = clamp(dot(normalWS, viewDir), 0.0, 1.0);
            let pageF0 = pow((materialUniform.ior - 1.0) / (materialUniform.ior + 1.0), 2.0);
            let pageFresnelT = 1.0 - (pageF0 + (1.0 - pageF0) * pow(1.0 - pageNoV, 5.0));
            let pageBend = length(refractedUV - screenUV);
            let pageBendFade = 1.0 - smoothstep(0.02, 0.25, pageBend);
            let pageVis = pageFresnelT * pageBendFade;
            let pageThrough = effectiveTf * pageFrac * tPass * pageVis;
            // Clamped at 0 — with the floor active a channel can sit
            // below tPass and must not subtract from the body light.
            // Note glow <= 1 - tPass = alpha, so the premultiplied
            // output stays spec-valid without relying on the present
            // pass's alpha lift. Scaled by pageVis like the
            // pass-through itself: the glow models the chromatic part
            // of page light crossing the medium, and light that
            // Fresnel-reflects away or bends off-path never crosses.
            let pageTintGlow = max(mediumVis - vec3f(tPass), vec3f(0.0)) * pageFrac * pageVis;
            // Own transmitted light in cutout mode: refracted scene
            // sample where available, else the straight-through
            // backdrop attenuated by the medium, else the tint glow —
            // the page itself supplies the remaining light through
            // alpha, so keeping the opaque path's white-light fallback
            // here would count the backdrop light twice.
            let transmittedCutout = mix(backdropDirect.rgb * transmittance * tint, transmittedTinted, refractCoverage) + pageTintGlow;
            let bodyCutoutRGB = mix(diffuseLike, transmittedCutout, effectiveTf);
            // canvasAlpha semantics:
            //   scene-backed pixels (sceneCov = 1) -> 1, cloth blocks HTML;
            //   page-backed glass at opacity 1 -> 1 - tf * tPass, HTML
            //   shows through proportionally to the transmission;
            //   opacity < 1 fades the body itself toward directCov.
            let cutoutAlpha = mix(directCov, 1.0 - pageThrough, bodySrcA);
            // Diffuse / transmission part: opacity blends dragon body
            // with the cloth (or whatever else has depth at this
            // pixel). Specular is added unconditionally on top so a
            // glass surface in front of an alpha:true canvas region
            // (HTML cells) still casts bright highlights / reflection
            // halos onto the visible page background.
            let cutoutBodyRGB = bodySrcA * bodyCutoutRGB + (1.0 - bodySrcA) * backdropDirect.a * backdropDirect.rgb;
            let cutoutRGB = cutoutBodyRGB + preservedSpec;
            // Opaque-branch alpha was hardcoded to 1.0, which made the
            // sphere fully visible regardless of the user's opacity
            // slider on materials that flipped the GPU pipeline to
            // alphaMode='BLEND' (Sample_Transmission). Forward the
            // computed BaseColor.a (= baseColor.a * maskTex.a from
            // USE_ALPHA_A) so opacity=0 produces an invisible surface
            // — matching the standard PBR transparent contract.
            // For alphaMode='OPAQUE' GPU pipelines the value is
            // ignored anyway (no blending), so this doesn't change
            // opaque-glass demos.
            let outAlphaOpaque = ORI_FragmentOutput.color.a;
            let outAlpha = mix(outAlphaOpaque, cutoutAlpha, alphaMode);
            let outRGB = mix(dragonOpaqueRGB, cutoutRGB, alphaMode);
            ORI_FragmentOutput.color = vec4f(outRGB, outAlpha);
        #endif
    }
`

