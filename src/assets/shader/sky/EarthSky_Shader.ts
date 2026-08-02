/**
 * @internal
 * EarthSky shader for rendering a backface sphere sampling cube texture
 */
export class EarthSky_Shader {
    public static earthsky_vs_wgsl: string = /* wgsl */ `
    #include "WorldMatrixUniform"
    #include "GlobalUniform"

    struct uniformData {
        exposure: f32,
        roughness: f32,
        yaw: f32,
        pitch: f32,
    };

    struct VertexOutput {
        @location(auto) fragUV: vec2<f32>,
        @location(auto) vWorldPos: vec4<f32>,
        @location(auto) vWorldNormal: vec3<f32>,
        @location(auto) viewDir: vec3<f32>,
        @builtin(position) member: vec4<f32>
    };

    var<private> ORI_VertexOut: VertexOutput;

    @group(2) @binding(0)
    var<uniform> global: uniformData;

    @vertex
    fn main( 
        @builtin(instance_index) index : u32,
        @location(auto) position: vec3<f32>,
        @location(auto) normal: vec3<f32>,
        @location(auto) uv: vec2<f32>
    ) -> VertexOutput {
        ORI_VertexOut.fragUV = uv;
        var modelMat = models.matrix[u32(index)];
        
        // Handle RTE (Relative To Eye) mode
        if (globalUniform.useRTE != 0) {
            UpdateWorldMatrixToRTE(u32(index), &modelMat);
        }
        
        let normalMatrix = mat3x3<f32>(modelMat[0].xyz, modelMat[1].xyz, modelMat[2].xyz);
        ORI_VertexOut.vWorldNormal = normalize(normalMatrix * normal);
        ORI_VertexOut.vWorldPos = modelMat * vec4<f32>(position.xyz, 1.0);

        let viewPos = globalUniform.viewMat * ORI_VertexOut.vWorldPos;
        ORI_VertexOut.viewDir = viewPos.xyz;

        var clipPos = globalUniform.projMat * viewPos;
        clipPos.z = clipPos.w;
        ORI_VertexOut.member = clipPos;
        return ORI_VertexOut;
    }
    `

    public static earthsky_fs_wgsl: string = /* wgsl */ `
    #include "GlobalUniform"
    #include "MathShader"
    #include "BitUtil"
    #include "ColorUtil_frag"
    #include "FragmentOutput"

    struct uniformData {
        exposure: f32,
        roughness: f32,
        yaw: f32,
        pitch: f32,
    };

    @group(1) @binding(0)
    var baseMapSampler: sampler;
    @group(1) @binding(1)
    var baseMap: texture_cube<f32>;

    @group(2) @binding(0)
    var<uniform> global: uniformData;

    // Rotate a vector around Y axis (yaw)
    fn rotateY(v: vec3<f32>, angle: f32) -> vec3<f32> {
        let c = cos(angle);
        let s = sin(angle);
        return vec3<f32>(
            c * v.x + s * v.z,
            v.y,
            -s * v.x + c * v.z
        );
    }

    // Rotate a vector around X axis (pitch)
    fn rotateX(v: vec3<f32>, angle: f32) -> vec3<f32> {
        let c = cos(angle);
        let s = sin(angle);
        return vec3<f32>(
            v.x,
            c * v.y - s * v.z,
            s * v.y + c * v.z
        );
    }

    @fragment
    fn main(
        @location(auto) fragUV: vec2<f32>,
        @location(auto) vWorldPos: vec4<f32>,
        @location(auto) vWorldNormal: vec3<f32>,
        @location(auto) viewDir: vec3<f32>,
        @builtin(position) fragCoord: vec4<f32>
    ) -> FragmentOutput {
        let maxLevel: u32 = textureNumLevels(baseMap);
 
        var samplerDir = normalize(viewDir);
        samplerDir = rotateX(samplerDir, global.pitch);
        samplerDir = rotateY(samplerDir, global.yaw);
        
        var textureColor: vec3<f32> = textureSampleLevel(baseMap, baseMapSampler, samplerDir, global.roughness * f32(maxLevel)).xyz;
        
        #if IS_HDR_SKY
            textureColor = LinearToGammaSpace(textureColor);
        #endif

        let o_Target: vec4<f32> = vec4<f32>(textureColor, 1.0) * global.exposure;

        var fragmentOutput: FragmentOutput;
        fragmentOutput.color = o_Target;
        #if USE_OUTDEPTH
            // Ensure sky is always at far plane (depth = 1.0) for log depth
            fragmentOutput.out_depth = 0.999999;
        #endif
        return fragmentOutput;
    }
    `;
}
