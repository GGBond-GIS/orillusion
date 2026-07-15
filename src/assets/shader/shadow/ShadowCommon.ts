import { CSM } from "../../../core/csm/CSM";

/**
 * @internal
 * Shared shadow bindings, private state, and constants.
 * Every other shadow submodule assumes these symbols are in scope, so include
 * this first (the Preprocessor dedups repeat includes).
 */
export let ShadowCommon: string = /*wgsl*/ `
    @group(1) @binding(auto) var shadowMapSampler: sampler_comparison;
    @group(1) @binding(auto) var shadowMap: texture_depth_2d_array;
    @group(1) @binding(auto) var pointShadowMapSampler: sampler_comparison;
    @group(1) @binding(auto) var pointShadowMap: texture_depth_cube_array;
    // Non-comparison aliases for the same depth textures — used by PCSS
    // blocker search which needs the raw depth value, not a compared 0/1.
    // See RenderShaderPass sampler resolution (strips 'SamplerRaw' suffix
    // so both aliases point at the same underlying Texture).
    @group(1) @binding(auto) var shadowMapSamplerRaw: sampler;
    @group(1) @binding(auto) var pointShadowMapSamplerRaw: sampler;

    var<private> directShadowVisibility: array<f32, 8>;
    var<private> pointShadows: array<f32, 8>;
    var<private> shadowWeight: f32 = 1.0 ;

    const dirCount:i32 = 8 ;
    const pointCount:i32 = 8 ;
    const csmCount:i32 = ${CSM.Cascades} ;
    var<private> csmLevel:i32 = -1;

    // 16-tap Poisson disk (unit-disk coords, max radius ≤ 1). Shared by 2D
    // and cube-face samplers — both project these onto a tangent plane and
    // scale by a desired radius. Better spatial distribution than the old
    // 4×4×4 cube-grid or axis-aligned 3×3, and small enough to stay cheap.
    const POISSON_DISK_16 = array<vec2<f32>, 16>(
        vec2<f32>(-0.94201624, -0.39906216),
        vec2<f32>( 0.94558609, -0.76890725),
        vec2<f32>(-0.094184101, -0.92938870),
        vec2<f32>( 0.34495938,  0.29387760),
        vec2<f32>(-0.91588581,  0.45771432),
        vec2<f32>(-0.81544232, -0.87912464),
        vec2<f32>(-0.38277543,  0.27676845),
        vec2<f32>( 0.97484398,  0.75648379),
        vec2<f32>( 0.44323325, -0.97511554),
        vec2<f32>( 0.53742981, -0.47373420),
        vec2<f32>(-0.26496911, -0.41893023),
        vec2<f32>( 0.79197514,  0.19090188),
        vec2<f32>(-0.24188840,  0.99706507),
        vec2<f32>(-0.81409955,  0.91437590),
        vec2<f32>( 0.19984126,  0.78641367),
        vec2<f32>( 0.14383161, -0.14100790),
    );

    fn calcBasicBias(shadowWorldSize:f32, shadowDepthTexSize:f32, near:f32, far:f32) -> f32{
      var bias = shadowWorldSize / shadowDepthTexSize;
      bias = bias / (far - near);
      return bias * 2.0;
    }
`
