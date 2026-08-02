/**
 * @internal
 */
export let VertexAttributes: string = /*wgsl*/ `
    struct VertexAttributes{
        @builtin(instance_index) index : u32,
        @location(auto) position: vec3<f32>,
        @location(auto) normal: vec3<f32>,
        @location(auto) uv: vec2<f32>,
        @location(auto) TEXCOORD_1: vec2<f32>,

        #if USE_TANGENT
            @location(auto) TANGENT: vec4<f32>,
        #endif

        #if USE_SKELETON || USE_METAHUMAN
            @location(auto) joints0: vec4<f32>,
            @location(auto) weights0: vec4<f32>,
            #if USE_JOINT_VEC8
                @location(auto) joints1: vec4<f32>,
                @location(auto) weights1: vec4<f32>,
            #endif
        #endif

        #if USE_MORPHTARGETS || USE_METAHUMAN
            @location(auto) vIndex: f32,
        #endif
    }
`

/**
 * @internal
 */
export let VertexAttributes_vert: string = /*wgsl*/ `
    #include "VertexAttributes"
    #include "VertexOutput"
    #include "VertexFunction_vert"
`
