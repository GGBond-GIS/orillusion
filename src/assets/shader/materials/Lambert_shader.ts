/**
 * @internal
 */
export let Lambert_shader: string = /*wgsl*/ `
    #include "Common_vert"
    #include "Common_frag"
    #include "ClusterLight"
    #include "UnLit_frag"
    #include "UnLitMaterialUniform_frag"
    #include "EnvMap_frag"
    #include "ReflectionCG"

    @group(1) @binding(0)
    var baseMapSampler: sampler;
    @group(1) @binding(1)
    var baseMap: texture_2d<f32>;

    fn vert(inputData:VertexAttributes) -> VertexOutput {
        ORI_Vert(inputData) ;
        return ORI_VertexOut ;
    }

    fn frag(){
        var transformUV1 = materialUniform.transformUV1;
        var transformUV2 = materialUniform.transformUV2;

        var uv = transformUV1.zw * ORI_VertexVarying.fragUV0 + transformUV1.xy; 
        let baseMapColor = textureSample(baseMap,baseMapSampler,uv);
        if(baseMapColor.a < materialUniform.alphaCutoff) {
            discard;
        }

        var lightColor = vec4<f32>(0.0);
        let lightIndex = getCluster();
        let start = max(lightIndex.start, 0.0);
        let count = max(lightIndex.count, 0.0);
        let end = max(start + count , 0.0);
        for(var i:i32 = i32(start) ; i < i32(end); i += 1 )
        {
          let light = getLight(i32(i));
  
          switch (light.lightType) {
            case PointLightType: {
            }
            case DirectLightType: {
                var normal = ORI_VertexVarying.vWorldNormal;
                let intensity = light.intensity;
                let att = max(dot(normal,-light.direction),0.0) * intensity;
                lightColor += vec4f(light.lightColor * att, 1.0);
            }
            case SpotLightType: {
            }
            default: {
            }
          }
        }

        let irradiance: vec3f = getReflectionsEnv(ORI_VertexVarying.vWorldNormal, ORI_VertexVarying.vWorldPos.xyz, 1.0);
        let color = lightColor * baseMapColor * materialUniform.baseColor;
        
        ORI_ShadingInput.BaseColor = vec4f(color.rgb + irradiance, baseMapColor.a);
        if(ORI_ShadingInput.BaseColor.a > 1.0){
            ORI_ShadingInput.BaseColor.a = 1.0;
        }
        UnLit();

        // let n = globalUniform.near ;
        // let f = globalUniform.far ;
        // let z = ORI_VertexVarying.fragCoord.z ;
        // ORI_FragmentOutput.out_depth = z * (n/(f-n)) ;
    }
`

