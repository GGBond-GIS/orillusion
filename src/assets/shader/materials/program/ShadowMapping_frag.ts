/**
 * @internal
 * Facade that composes the shadow pipeline out of single-responsibility
 * submodules. Custom shaders that only need a subset (e.g. just PCF) can
 * include the submodules directly — Preprocessor dedups repeat #include.
 */
export let ShadowMapping_frag: string = /*wgsl*/ `
    #include "ShadowCommon"
    #include "PCF_frag"
    #include "CSM_frag"
    #include "DirectShadow_frag"
    #include "PointShadow_frag"

    fn useShadow(){
        directShadowVisibility = array<f32, 8>( 1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0) ;
        pointShadows = array<f32, 8>(1.0,1.0,1.0,1.0,1.0,1.0,1.0,1.0) ;
        directShadowMaping();
        pointShadowMapCompare();
    }
`
