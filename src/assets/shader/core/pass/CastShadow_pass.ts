import { SkeletonAnimation_shader } from "../../anim/SkeletonAnimation_shader";
import { MorphTarget_shader } from "../../../../components/anim/morphAnim/MorphTarget_shader";

/**
 * @internal
 */
export let shadowCastMap_vert: string = /*wgsl*/ `
#include "WorldMatrixUniform"
#include "GlobalUniform"
#include "VertexAttributes"

struct VertexOutput {
    @location(auto) fragUV: vec2<f32>,
    @builtin(position) member: vec4<f32>
};

#if USE_MORPHTARGETS
    ${MorphTarget_shader.getMorphTargetShaderBinding(2, 1)}
#endif

#if USE_SKELETON
    ${SkeletonAnimation_shader.groupBindingAndFunctions(2, 1)}
#endif

var<private> worldMatrix: mat4x4<f32>;

@vertex
fn main(vertex:VertexAttributes) -> VertexOutput {
    worldMatrix = models.matrix[vertex.index];
    let shadowMatrix: mat4x4<f32> = globalUniform.projMat * globalUniform.viewMat;
    var vertexPosition = vertex.position.xyz;
    var vertexNormal = vertex.normal.xyz;

    if (globalUniform.useRTE != 0) {
        UpdateWorldMatrixToRTE_PrivatePtr(u32(vertex.index), &worldMatrix);
    }

    #if USE_MORPHTARGETS
     ${MorphTarget_shader.getMorphTargetCalcVertex()}    
    #endif

    #if USE_SKELETON
        // glTF 2.0 skinning: the skinning matrix already produces
        // world-space positions (sum of weight * jointWorld * invBind),
        // so we OVERWRITE worldMatrix instead of multiplying. Multiplying
        // would fold in the mesh node's worldMatrix a second time —
        // visible on Sample_Skeleton (man.scaleX = 30) as a 30×-larger
        // shadow that doesn't match the actual mesh. Matches the color
        // pass: VertexFunction_vert sets ORI_MATRIX_M = skeletonNormal.
        #if USE_JOINT_VEC8
          worldMatrix = getSkeletonWorldMatrix_8(vertex.joints0, vertex.weights0, vertex.joints1, vertex.weights1);
        #else
          worldMatrix = getSkeletonWorldMatrix_4(vertex.joints0, vertex.weights0);
        #endif
    #endif

    var worldPos = worldMatrix * vec4<f32>(vertexPosition, 1.0) ;
    var vPos = shadowMatrix * worldPos;

    return VertexOutput(vertex.uv, vPos );
}
`

/**
 * @internal
 */
export let castPointShadowMap_vert: string = /*wgsl*/ `
#include "WorldMatrixUniform"
#include "GlobalUniform"
#include "VertexAttributes"

struct VertexOutput {
    @location(auto) fragUV: vec2<f32>,
    @location(auto) worldPos: vec3<f32>,
    @builtin(position) member: vec4<f32>
};

#if USE_MORPHTARGETS
    ${MorphTarget_shader.getMorphTargetShaderBinding(2, 1)}
#endif

#if USE_SKELETON
    ${SkeletonAnimation_shader.groupBindingAndFunctions(2, 1)}
#endif

var<private> worldMatrix: mat4x4<f32>;

@vertex
fn main(vertex:VertexAttributes) -> VertexOutput {
    worldMatrix = models.matrix[vertex.index];
    let shadowMatrix: mat4x4<f32> = globalUniform.projMat * globalUniform.viewMat;
    var vertexPosition = vertex.position.xyz;

    if (globalUniform.useRTE != 0) {
        UpdateWorldMatrixToRTE_PrivatePtr(u32(vertex.index), &worldMatrix);
    }

    // Skinning OVERWRITES worldMatrix (glTF 2.0 skinning matrix already
    // produces world-space positions). Same fix as shadowCastMap_vert
    // and matches VertexFunction_vert for the color pass.
    #if USE_METAHUMAN
        ${MorphTarget_shader.getMorphTargetCalcVertex()}
        #if USE_JOINT_VEC8
            worldMatrix = getSkeletonWorldMatrix_8(vertex.joints0, vertex.weights0, vertex.joints1, vertex.weights1);
        #else
            worldMatrix = getSkeletonWorldMatrix_4(vertex.joints0, vertex.weights0);
        #endif
    #endif

    #if USE_MORPHTARGETS
        ${MorphTarget_shader.getMorphTargetCalcVertex()}
    #endif

    #if USE_SKELETON
        #if USE_JOINT_VEC8
          worldMatrix = getSkeletonWorldMatrix_8(vertex.joints0, vertex.weights0, vertex.joints1, vertex.weights1);
        #else
          worldMatrix = getSkeletonWorldMatrix_4(vertex.joints0, vertex.weights0);
        #endif
    #endif

    var worldPos = worldMatrix * vec4<f32>(vertexPosition, 1.0) ;
    var vPos = shadowMatrix * worldPos;
    return VertexOutput(vertex.uv, worldPos.xyz , vPos );
}
`

/**
 * @internal
 */
export let shadowCastMap_frag: string = /*wgsl*/ `
    #include "GlobalUniform"

    #if USE_ALPHACUT
      @group(1) @binding(0)
      var baseMapSampler: sampler;
      @group(1) @binding(1)
      var baseMap: texture_2d<f32>;
    #endif

    struct FragmentOutput {
      @location(auto) o_Target: vec4<f32>,
      @builtin(frag_depth) out_depth: f32
    };

    @fragment
    fn main(@location(auto) fragUV: vec2<f32> , @location(auto) worldPos:vec3<f32> ) -> FragmentOutput {
        let lightWorldPos = globalUniform.CameraPos;
        var distance = length(worldPos.xyz - lightWorldPos) ;
        distance = distance / globalUniform.far;
        var fragOut:FragmentOutput; 

      #if USE_ALPHACUT
        let Albedo = textureSample(baseMap,baseMapSampler,fragUV);
        if(Albedo.w > 0.5){
          fragOut = FragmentOutput(vec4<f32>(0.0),distance);
        }
      #else
        fragOut = FragmentOutput(vec4<f32>(0.0),distance);
      #endif
      
        return fragOut ;
    }
`

/**
 * @internal
 */
export let directionShadowCastMap_frag: string = /*wgsl*/ `
    #if USE_ALPHACUT
      @group(1) @binding(0)
      var baseMapSampler: sampler;
      @group(1) @binding(1)
      var baseMap: texture_2d<f32>;
    #endif

    // Directional shadow is a DEPTH-ONLY pass: ShadowMapPassRenderer builds
    // RTFrame([], []) with no color attachments. This fragment shader must
    // therefore declare NO outputs (no @location and no @builtin(frag_depth))
    // and only take varyings that the vertex shader actually produces — the
    // VertexOutput struct only exports fragUV at location 0 plus position.
    // Even an "unused" extra input like @location(1) would create a binding
    // that Dawn's D3D12 backend can silently drop rasterized fragments for,
    // which is the symptom we saw (Mac works, Windows no shadows).
    @fragment
    fn main(@location(auto) fragUV: vec2<f32>) {
    }
`