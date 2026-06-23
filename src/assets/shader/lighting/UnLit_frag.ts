/**
 * @internal
 */
export let UnLit_frag: string = /*wgsl*/ `
    #include "Common_frag"
    #include "GlobalUniform"

    fn UnLit(){
        let alpha = ORI_ShadingInput.BaseColor.a ;
        // Engine-wide premultiplied-alpha convention: COLOR pass output is
        // (rgb*alpha, alpha). BlendMode.NORMAL/ALPHA pair with srcFactor=one
        // so the blend math becomes rgb*alpha + dst*(1-alpha). ADD pairs
        // with (one, one) — transparent pixels (alpha=0) zero out at source,
        // killing PNG-transparent-region rgb noise that would otherwise leak
        // through additive blends. OIT_DEPTH_PEEL is the exception: its
        // sub-passes premultiply downstream in Common_frag, so emit
        // straight-alpha there to avoid alpha^2.
        var viewColorPremul = vec4<f32>(ORI_ShadingInput.BaseColor.rgb * alpha , alpha) ;
        var vNormal = ORI_VertexVarying.vWorldNormal.rgb ;
        let gBuffer = packNHMDGBuffer(
            getGBufferDepth(),
            vec3f(0.0),
            viewColorPremul.rgb,
            vec3f(1.0,0.0,0.0),
            vNormal,
            alpha
          ) ;

          #if USE_OIT_DEPTH_PEEL
            ORI_FragmentOutput.color = viewColorPremul;
          #else
            #if USE_CASTREFLECTION
              ORI_FragmentOutput.gBuffer = gBuffer;
            #else
              ORI_FragmentOutput.gBuffer = gBuffer;
              ORI_FragmentOutput.color = viewColorPremul;
            #endif
          #endif
    }

    fn debugFragmentOut(){

    }
`