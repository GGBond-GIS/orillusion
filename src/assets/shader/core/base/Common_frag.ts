/**
 * @internal
 */
export let Common_frag: string = /*wgsl*/ `
  #include "GlobalUniform"
  #include "FragmentVarying"
  #include "FragmentOutput"
  #include "ShadingInput"
  #include "ColorUtil_frag"
  #include "BitUtil"

  var<private> ORI_FragmentOutput: FragmentOutput;
  var<private> ORI_VertexVarying: FragmentVarying;
  var<private> ORI_ShadingInput: ShadingInput;
  var<private> viewDir:vec3<f32>;
  var<private> modelIndex:u32;
  
  @fragment
  fn FragMain( vertex_varying:FragmentVarying ) -> FragmentOutput {
   
    modelIndex = u32(round(vertex_varying.index)) ; 

    ORI_VertexVarying = vertex_varying;
    ORI_VertexVarying.vWorldNormal = normalize(vertex_varying.vWorldNormal);
    ORI_FragmentOutput.color = vec4<f32>(1.0, 0.0, 0.0, 1.0);
    viewDir = normalize(globalUniform.CameraPos.xyz - ORI_VertexVarying.vWorldPos.xyz) ;

    frag();
    
    #if USE_DEBUG
      debugFragmentOut();
    #endif

    #if USE_DEFAULTFRAGOUT
      // let finalMatrix = globalUniform.projMat * globalUniform.viewMat ;
      // let nMat = mat3x3<f32>(finalMatrix[0].xyz,finalMatrix[1].xyz,finalMatrix[2].xyz) ;
      // let ORI_NORMALMATRIX = transpose(inverse( nMat ));
      // var vNormal = normalize(ORI_NORMALMATRIX * (ORI_VertexVarying.vWorldNormal));

      // let gBuffer = packNHMDGBuffer(
      //   ORI_VertexVarying.fragCoord.z,
      //   ORI_ShadingInput.BaseColor.rgb,
      //   ORI_ShadingInput.BaseColor.rgb,
      //   vec3f(ORI_ShadingInput.Roughness,ORI_ShadingInput.Metallic,ORI_ShadingInput.AmbientOcclusion),
      //   ORI_ShadingInput.Normal,
      //   ORI_ShadingInput.Opacity
      // ) ;
    #endif

    #if USE_OUTDEPTH
      #if USE_LOGDEPTH
        ORI_FragmentOutput.out_depth = log2DepthFixPersp(ORI_VertexVarying.fragPosition.w, globalUniform.near, globalUniform.far);
      #else
        ORI_FragmentOutput.out_depth = ORI_ShadingInput.FragDepth ;
      #endif
    #endif

    #if USE_OIT_DEPTH_PEEL_DEPTH
      // Dual Depth Peeling — depth-extraction sub-pass.
      //
      // Dual-depth-peel algorithm: each pixel maintains (depth_min,
      // depth_max) in an RG32F MRT cleared to (-MAX_DEPTH, -MAX_DEPTH).
      // Every transparent fragment writes vec4(-fragDepth, fragDepth)
      // and the attachment is configured with MAX blend (per-channel),
      // so after one geometry pass the MRT contains:
      //
      //   .r = max(-d_i)  =  -min(d_i)   →  nearest fragment depth
      //   .g = max( d_i)                 →  furthest fragment depth
      //
      // Subsequent peel iterations (stage 3) read the previous-pass
      // depth MRT, skip fragments whose depth is at the boundary
      // (already rendered) or outside (already peeled), and write the
      // depth of the next-nearest / next-furthest fragments. Stage 2
      // implements only the init pass — full per-iteration peeling
      // logic with prev-pass texelFetch lands in stage 3.
      //
      // fragCoord is the @builtin(position) — its .z is NDC depth in
      // [0, 1], the same value the depth-test uses, which is what we
      // want to peel by.
      let _ddpDepth = ORI_VertexVarying.fragCoord.z;
      ORI_FragmentOutput.color = vec4<f32>(-_ddpDepth, _ddpDepth, 0.0, 0.0);
    #endif

    #if USE_OIT_DEPTH_PEEL_FRONT
      // Dual Depth Peeling — front-color accumulation sub-pass.
      //
      // The front-color MRT accumulates layers in front-to-back order
      // via the over operator. For each peeled layer:
      //   newFront = prevFront + (1 - prevFront.a) * (rgb*α, α)
      //
      // When any layer reaches α=1, prevFront.a becomes 1 and all
      // subsequent contributions are zeroed — the front-most fragment
      // dominates and α=1 is naturally opaque. This is the property
      // weighted-blended OIT cannot replicate at small scene scales.
      //
      // Stage 2 outputs the premultiplied current-layer colour. Stage 3
      // adds the texelFetch of prev-pass front MRT and the over-operator
      // composition. Until then the result is just "first peeled layer"
      // which roughly matches the init pass's contribution.
      let _ddpAlpha = clamp(ORI_FragmentOutput.color.a, 0.0, 1.0);
      ORI_FragmentOutput.color = vec4<f32>(ORI_FragmentOutput.color.rgb * _ddpAlpha, _ddpAlpha);
    #endif

    #if USE_OIT_DEPTH_PEEL_BACK
      // Dual Depth Peeling — back-color accumulation sub-pass.
      //
      // The back-color MRT accumulates layers in back-to-front order via
      // an under-blend (associative). Final composite (in resolve
      // feature, stage 4):
      //   final = bg·(1 - frontA) + frontColor + (1 - frontA)·backColor
      //
      // Stage 2 outputs premultiplied current-layer colour; stage 3 adds
      // the layer-discrimination logic (only fragments at the current
      // peel iteration's furthest depth contribute here).
      let _ddpAlpha = clamp(ORI_FragmentOutput.color.a, 0.0, 1.0);
      ORI_FragmentOutput.color = vec4<f32>(ORI_FragmentOutput.color.rgb * _ddpAlpha, _ddpAlpha);
    #endif

    #if USE_OIT_ACCUM
      // Weighted-Blended OIT (McGuire and Bavoil 2013, Eq. 7).
      //
      // BxDF_frag / UnLit_frag pre-multiply rgb by alpha, so the .rgb
      // here is already lit·α. WBOIT compositing wants:
      //   accum.rgb = sum(rgb · α · w)   →  we multiply by w
      //   accum.a   = sum(α · w)         →  we write α·w into the .a slot
      //   reveal.r  = product(1 − α)     →  multiplicative blend on gBuffer.r
      //
      // Weight formula per the paper: w = alpha * clamp(0.03 / (1e-5 + (z/200)^4), 1e-2, 3e3).
      //
      // The previous implementation did two things wrong:
      //   1. fed fragCoord.z (post-projection NDC depth in [0,1]) into
      //      the formula. The paper's z is LINEAR eye-space depth in
      //      world units (centred around the [0, ~200] expected by the
      //      z/200 term). NDC depth packs non-linearly and for anything
      //      past the near plane saturates the depth term to its 3000
      //      cap, making every fragment's weight identical. With
      //      identical weights, accum.rgb / accum.a degenerates to a
      //      plain colour average — every transparent stack rendered
      //      as "milky averaged" regardless of alpha (the alpha factor
      //      cancels in the ratio when w is constant).
      //   2. used alpha^4 + depth_term (additive, with alpha
      //      exponentiated) instead of alpha · depth_term
      //      (multiplicative). The additive form let the depth-
      //      saturated 3000 dominate so alpha had no effect at all on
      //      the contribution; the multiplicative form scales the
      //      per-fragment contribution by alpha directly.
      //
      // Compute linear depth from the world-space position via the view
      // matrix — globalUniform.viewMat is already bound. Take abs(z)
      // because the camera looks down −z in eye space.
      //
      // WGSL spec reserves leading double-underscore identifiers; we
      // use single-underscore prefixes.
      {
        let _oitAlpha = clamp(ORI_FragmentOutput.color.a, 0.0, 1.0);
        let _eyePos = (globalUniform.viewMat * vec4<f32>(ORI_VertexVarying.vWorldPos.xyz, 1.0)).xyz;
        let _oitZ = abs(_eyePos.z);
        let _oitW = _oitAlpha * clamp(
          0.03 / (1e-5 + pow(_oitZ / 200.0, 4.0)),
          0.01, 3000.0
        );
        ORI_FragmentOutput.color = vec4<f32>(ORI_FragmentOutput.color.rgb * _oitW, _oitAlpha * _oitW);
        ORI_FragmentOutput.gBuffer = vec4<f32>(_oitAlpha, 0.0, 0.0, 0.0);
      }
    #endif

    return ORI_FragmentOutput ;
  }


  fn packNHMDGBuffer(depth:f32, albedo:vec3f,hdrLighting:vec3f,rmao:vec3f,normal:vec3f,alpha:f32) -> vec4f  {
      var gBuffer : vec4f ;
      var octUVNormal = (octEncode(normalize( (normal) )) + 1.0) * 0.5 ;
      var yc = f32(r11g11b9_to_float(vec3f(octUVNormal,rmao.r))) ;
      #if USE_CASTREFLECTION
        var rgbm = EncodeRGBM(hdrLighting);
        var zc = f32(pack4x8unorm(vec4f(rgbm.rgb,0.0))) ;
        var wc = f32(pack4x8unorm(vec4f(rmao.rg,rgbm.a,0.0)));
      #else
        var zc = f32(vec4fToFloat_7bits(vec4f(albedo.rgb,alpha)));
        var wc = f32(r22g8_to_float(vec2f(f32(modelIndex)/f_r22g8.r,rmao.g)));
      #endif

      gBuffer.x = depth  ;
      gBuffer.y = yc ;
      gBuffer.z = zc ;
      gBuffer.w = wc ;
      return gBuffer ;
  }

  // Per-pixel scene depth for the compressed gBuffer.x channel.
  //
  // Under USE_LOGDEPTH the rasterizer-interpolated fragCoord.z drifts from
  // the true logarithmic curve on long triangles (the curve is non-linear
  // in clip.w; the rasterizer interpolates ndc.z linearly in screen-space
  // with perspective correction, which is only exact for functions linear
  // in 1/w). clip.w itself IS interpolated exactly because it's linear in
  // view-space, so we recompute via log2DepthFixPersp — the same function
  // FragMain writes into @builtin(frag_depth), making gBuffer.x agree with
  // _MainDepthTexture at every pixel. Without log-z the rasterizer value
  // is already exact.
  fn getGBufferDepth() -> f32 {
    #if USE_LOGDEPTH
      return log2DepthFixPersp(ORI_VertexVarying.fragPosition.w, globalUniform.near, globalUniform.far);
    #else
      return ORI_VertexVarying.fragCoord.z;
    #endif
  }

  fn transformUV( uv:vec2f , offsetScale:vec4f ) -> vec2f{
     return uv * offsetScale.zw + offsetScale.xy ;
  }

`

