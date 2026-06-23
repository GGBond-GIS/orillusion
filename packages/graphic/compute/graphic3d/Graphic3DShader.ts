/**
 * @internal
 */
export let Graphic3DShader: string = /*wgsl*/ `
    #include "WorldMatrixUniform"
    #include "GlobalUniform"

    struct VertexAttributes {
        @location(auto) position: vec4<f32>,
        @location(auto) color: vec4<f32>,
    }

    struct VertexOutput {
        @location(auto) varying_WPos: vec4<f32>,
        @location(auto) varying_Color: vec4<f32>,
        #if USE_LOGDEPTH
            // Pass clip.w (= view-space z in LH WebGPU projection) to
            // the fragment so it can write a log-encoded frag_depth that
            // matches the standard BxDF/UnLit pipeline. fragCoord.w in
            // the fragment is 1/clip.w after perspective divide, but
            // perspective-correct varying interpolation of clip.w
            // recovers the per-fragment view distance directly.
            @location(auto) varying_ClipW: f32,
        #endif
        @builtin(position) member: vec4<f32>
    };

    @vertex
    fn VertMain( vertex:VertexAttributes ) -> VertexOutput {
        var worldMatrix = models.matrix[u32(vertex.position.w)];

        if (globalUniform.useRTE != 0) {
            UpdateWorldMatrixToRTE(u32(vertex.position.w), &worldMatrix);
        }

        var worldPos = (worldMatrix * vec4<f32>(vertex.position.xyz, 1.0));
        var viewPosition = ((globalUniform.viewMat) * worldPos);
        var clipPosition = globalUniform.projMat * viewPosition;

        var ORI_VertexOut: VertexOutput;
        ORI_VertexOut.varying_WPos = worldPos;
        ORI_VertexOut.varying_Color = vertex.color;
        #if USE_LOGDEPTH
            // Mirror VertexFunction_vert so log-depth lines occupy the
            // same depth-encoded region as standard meshes. Without
            // this, line-z stays linear in NDC and the depth test
            // against log-encoded meshes is meaningless.
            ORI_VertexOut.varying_ClipW = clipPosition.w;
            clipPosition.z = log2Depth(clipPosition.w, globalUniform.near, globalUniform.far);
        #endif
        ORI_VertexOut.member = clipPosition;
        return ORI_VertexOut;
    }

    struct FragmentOutput {
        @location(auto) color: vec4<f32>,
        // #if USE_WORLDPOS
            @location(auto) worldPos: vec4<f32>,
        // #endif
        // #if USEGBUFFER
            @location(auto) worldNormal: vec4<f32>,
            @location(auto) material: vec4<f32>,
        // #endif
        #if USE_LOGDEPTH
            @builtin(frag_depth) out_depth: f32,
        #endif
    };

    @fragment
    fn FragMain(
        @location(auto) vWorldPos: vec4<f32>,
        @location(auto) varying_Color: vec4<f32>,
        #if USE_LOGDEPTH
            @location(auto) varying_ClipW: f32,
        #endif
    ) -> FragmentOutput {
        var result: FragmentOutput;

        // #if USE_WORLDPOS
            result.worldPos = vWorldPos;
        // #endif

        // #if USEGBUFFER
            // result.worldNormal = vec4<f32>(0.0, 0.0, 0.0, 1.0);
            result.material = vec4<f32>(0.0, 1.0, 0.0, 0.0);
        // #endif

        result.color = varying_Color;

        #if USE_LOGDEPTH
            // Match Common_frag's log-depth attachment formula so the
            // hardware depth value (and gBuffer.x for the picker) lands
            // in the same [0.5, 1] band as standard meshes — otherwise
            // a Graphic3D line at distance D would test against meshes
            // that wrote a different encoding of the same D and either
            // always-pass or always-fail the depth test.
            result.out_depth = log2DepthFixPersp(varying_ClipW, globalUniform.near, globalUniform.far);
        #endif

        return result;
    }
`;
