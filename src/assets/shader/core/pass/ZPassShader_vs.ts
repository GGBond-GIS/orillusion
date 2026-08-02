import { MorphTarget_shader } from "../../../../components/anim/morphAnim/MorphTarget_shader";
import { SkeletonAnimation_shader } from "../../anim/SkeletonAnimation_shader";

/**
 * @internal
 */
export let ZPassShader_vs: string = /*wgsl*/ `
    #include "GlobalUniform"
    #include "MathShader"
    #include "VertexAttributes"

    struct VertexOutput {
        @location(auto) vID: f32 ,
        @location(auto) vPos: vec3<f32> ,
        @location(auto) vClipPos: vec4<f32> ,
        @builtin(position) member: vec4<f32>
    };

    struct Uniforms {
        matrix : array<mat4x4<f32>>
    };

    @group(0) @binding(1)
    var<storage, read> models : Uniforms;

    var<private> worldMatrix: mat4x4<f32>;

    #if USE_MORPHTARGETS
        ${MorphTarget_shader.getMorphTargetShaderBinding(1, 0)}
    #endif

    #if USE_SKELETON
        ${SkeletonAnimation_shader.groupBindingAndFunctions(1, 0)}
    #endif

    @vertex
    fn main(vertex: VertexAttributes) -> VertexOutput {
        worldMatrix = models.matrix[vertex.index];

        var vertexPosition = vertex.position;
        var vertexNormal = vertex.normal;

        #if USE_MORPHTARGETS
            ${MorphTarget_shader.getMorphTargetCalcVertex()}
        #endif

        #if USE_SKELETON
            #if USE_JOINT_VEC8
                worldMatrix *= getSkeletonWorldMatrix_8(vertex.joints0, vertex.weights0, vertex.joints1, vertex.weights1);
            #else
                worldMatrix *= getSkeletonWorldMatrix_4(vertex.joints0, vertex.weights0);
            #endif
        #endif

        let wPos = worldMatrix * vec4<f32>(vertexPosition.xyz, 1.0);
        var fixProjMat = globalUniform.projMat ;
        var rzMatrix : mat4x4<f32> ;
        rzMatrix[0] = vec4<f32>(1.0,0.0,0.0,0.0) ;
        rzMatrix[1] = vec4<f32>(0.0,1.0,0.0,0.0) ;
        rzMatrix[2] = vec4<f32>(0.0,0.0,1.0,0.0) ;
        rzMatrix[3] = vec4<f32>(0.0,0.0,0.0,1.0) ;
        var clipPos:vec4<f32> = fixProjMat * globalUniform.viewMat * (wPos) ;

        // Intentionally NOT applying log-z here even under USE_LOGDEPTH.
        // The prepass needs to produce a depth value the color pass will
        // less_equal-test against; the color FS writes log-encoded depth
        // via log2DepthFixPersp (ndc.z = log2(1+w)/log2(far+1)), which is
        // always strictly less than the standard linear ndc.z = (a*w+b)/w
        // for w >= near, so leaving the prepass linear guarantees
        // less_equal passes on every covered pixel.
        //
        // The seemingly natural fix — encode log-z here too — looks right
        // at the vertex but fails at interior pixels: the rasterizer
        // interpolates clip.z linearly in screen-space and the log curve
        // is concave, so interpolated_L < exact_L between vertices. Under
        // less_equal the color pass's per-pixel exact L incoming value is
        // larger than the stored interpolated L → every interior fragment
        // gets rejected and the scene goes blank. CDP-verified against
        // Sample_DecalShadowVolume. The fix-for-the-fix would be running
        // an FS in the prepass that recomputes per-pixel L the same way
        // the color FS does, which means wiring up a real fragment stage
        // to DepthMaterialPass — out of scope here.
        return VertexOutput(f32(vertex.index) , wPos.xyz, clipPos, clipPos);
    }

    fn depthToLinear01(depth:f32) -> f32 {
        let a = 1.0 / (globalUniform.near - globalUniform.far);
        return (globalUniform.near*globalUniform.far*a) / (depth + globalUniform.far * a) ;
    }
`
