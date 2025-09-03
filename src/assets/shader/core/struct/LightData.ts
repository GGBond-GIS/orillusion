export function getLightData(maxCascades: number): string {
    return /*wgsl*/ `
    struct LightData {
        index:f32,
        lightType:i32,
        radius:f32,
        linear:f32,
        
        position:vec3<f32>,
        lightMatrixIndex:f32,

        direction:vec3<f32>,
        quadratic:f32,

        lightColor:vec3<f32>,
        intensity:f32,

        innerCutOff :f32,
        outerCutOff:f32,
        range :f32,
        castShadow:i32,

        lightTangent:vec3<f32>,
        ies:f32,

        csmShadowMapNum: f32,
        csmShadowMapIndex: f32,
        _retain0: f32,
        _retain1: f32,

        shadowBias: array<f32, ${maxCascades}>,
    };
`
}
