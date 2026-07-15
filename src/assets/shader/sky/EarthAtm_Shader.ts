/**
 * @internal
 * EarthAtm shader for rendering a backface sphere sampling cube texture
 */
export class EarthAtm_Shader {
    public static earthatm_vs_wgsl: string = /* wgsl */ `
    #include "WorldMatrixUniform"
    #include "GlobalUniform"

    struct uniformData {
        // Earth parameters
        earthRadius: f32,           // Earth radius in meters (default: 6371000)
        atmosphereRadius: f32,      // Atmosphere outer radius (default: earthRadius * 1.025)
        sunIntensity: f32,          // Sun light intensity
        mieG: f32,                  // Mie phase function g parameter
        
        // Sun direction
        sunDirectionX: f32,
        sunDirectionY: f32,
        sunDirectionZ: f32,
        exposure: f32,              // Exposure for tone mapping
        
        // Scattering coefficients
        rayleighCoeffX: f32,
        rayleighCoeffY: f32,
        rayleighCoeffZ: f32,
        mieCoeff: f32,              // Mie scattering coefficient
        
        // Additional parameters
        rayleighScale: f32,         // Rayleigh scale height
        mieScale: f32,              // Mie scale height
        earthCenterX: f32,
        earthCenterY: f32,
        
        earthCenterZ: f32,
        padding1: f32,
        padding2: f32,
        padding3: f32,
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

    public static earthatm_fs_wgsl: string = /* wgsl */ `
    #include "GlobalUniform"
    #include "MathShader"
    #include "BitUtil"
    #include "ColorUtil_frag"
    #include "FragmentOutput"

    struct uniformData {
        // Earth parameters
        earthRadius: f32,           
        atmosphereRadius: f32,      
        sunIntensity: f32,
        mieG: f32,
        
        // Sun direction
        sunDirectionX: f32,
        sunDirectionY: f32,
        sunDirectionZ: f32,
        exposure: f32,
        
        // Scattering coefficients
        rayleighCoeffX: f32,
        rayleighCoeffY: f32,
        rayleighCoeffZ: f32,
        mieCoeff: f32,
        
        // Additional parameters
        rayleighScale: f32,
        mieScale: f32,
        earthCenterX: f32,
        earthCenterY: f32,
        
        earthCenterZ: f32,
        padding1: f32,
        padding2: f32,
        padding3: f32,
    };

    // Placeholder texture binding for group 1 (required by engine)
    @group(1) @binding(0)
    var baseMapSampler: sampler;
    @group(1) @binding(1)
    var baseMap: texture_cube<f32>;

    @group(2) @binding(0)
    var<uniform> global: uniformData;

    // Constants
    const PI: f32 = 3.14159265359;
    const NUM_SAMPLES: i32 = 8;
    const NUM_SAMPLES_LIGHT: i32 = 4;

    // Rayleigh phase function
    fn rayleighPhase(cosTheta: f32) -> f32 {
        return 0.75 * (1.0 + cosTheta * cosTheta);
    }

    // Mie phase function (Henyey-Greenstein)
    fn miePhase(cosTheta: f32, g: f32) -> f32 {
        let g2 = g * g;
        let num = 1.5 * (1.0 - g2) * (1.0 + cosTheta * cosTheta);
        let denom = (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
        return num / denom;
    }

    // Ray-sphere intersection
    fn raySphereIntersect(rayOrigin: vec3<f32>, rayDir: vec3<f32>, sphereCenter: vec3<f32>, sphereRadius: f32) -> vec2<f32> {
        let oc = rayOrigin - sphereCenter;
        let b = dot(oc, rayDir);
        let c = dot(oc, oc) - sphereRadius * sphereRadius;
        let discriminant = b * b - c;
        
        if (discriminant < 0.0) {
            return vec2<f32>(-1.0, -1.0);
        }
        
        let sqrtDisc = sqrt(discriminant);
        return vec2<f32>(-b - sqrtDisc, -b + sqrtDisc);
    }

    // Scale height density function
    fn densityAtHeight(height: f32, scaleHeight: f32) -> f32 {
        return exp(-height / scaleHeight);
    }

    // Compute optical depth from point to atmosphere edge along direction
    fn opticalDepth(
        rayOrigin: vec3<f32>,
        rayDir: vec3<f32>,
        rayLength: f32,
        earthCenter: vec3<f32>,
        earthRadius: f32,
        scaleHeight: f32
    ) -> f32 {
        let stepSize = rayLength / f32(NUM_SAMPLES_LIGHT);
        var depth = 0.0;
        
        for (var i = 0; i < NUM_SAMPLES_LIGHT; i = i + 1) {
            let pos = rayOrigin + rayDir * (f32(i) + 0.5) * stepSize;
            let height = length(pos - earthCenter) - earthRadius;
            depth = depth + densityAtHeight(max(0.0, height), scaleHeight) * stepSize;
        }
        
        return depth;
    }

    @fragment
    fn main(
        @location(auto) fragUV: vec2<f32>,
        @location(auto) vWorldPos: vec4<f32>,
        @location(auto) vWorldNormal: vec3<f32>,
        @location(auto) viewDir: vec3<f32>,
        @builtin(position) fragCoord: vec4<f32>
    ) -> FragmentOutput {
        let cameraPos = globalUniform.cameraWorldMatrix[3].xyz;
        
        var earthCenter: vec3<f32>;
        if (globalUniform.useRTE != 0) {
            let earthCenterWorld = vec3<f32>(global.earthCenterX, global.earthCenterY, global.earthCenterZ);
            earthCenter = earthCenterWorld - (globalUniform.cameraPositionH + globalUniform.cameraPositionL);
        } else {
            earthCenter = vec3<f32>(global.earthCenterX, global.earthCenterY, global.earthCenterZ);
        }
        
        let rayDir = normalize(vWorldPos.xyz - cameraPos);
        
        let sunDir = normalize(vec3<f32>(global.sunDirectionX, global.sunDirectionY, global.sunDirectionZ));
        let rayleighCoeff = vec3<f32>(global.rayleighCoeffX, global.rayleighCoeffY, global.rayleighCoeffZ);
        
        let earthRadius = global.earthRadius;
        let atmosphereRadius = global.atmosphereRadius;
        let rayleighScale = global.rayleighScale;
        let mieScale = global.mieScale;
        let mieCoeff = global.mieCoeff;
        let mieG = global.mieG;
        let sunIntensity = global.sunIntensity;
        
        // Check atmosphere intersection
        let atmIntersect = raySphereIntersect(cameraPos, rayDir, earthCenter, atmosphereRadius);
        
        // Slightly inflated earth radius to catch grazing rays at horizon
        let earthHitRadius = earthRadius + rayleighScale * 0.1;
        let earthIntersect = raySphereIntersect(cameraPos, rayDir, earthCenter, earthHitRadius);
        let hitEarth = earthIntersect.x > 0.0;
        let hitAtm = atmIntersect.y >= 0.0;

        // Accumulated scattering
        var totalRayleigh = vec3<f32>(0.0);
        var totalMie = vec3<f32>(0.0);
        var viewOpticalDepthRayleigh = 0.0;
        var viewOpticalDepthMie = 0.0;

        // Ray march only when ray intersects atmosphere
        if (hitAtm) {
            var tStart = max(atmIntersect.x, 0.0);
            var tEnd = atmIntersect.y;
            
            if (hitEarth && earthIntersect.x > 0.0) {
                tEnd = min(tEnd, earthIntersect.x);
            }
            
            let rayLength = tEnd - tStart;
            if (rayLength > 0.0) {
                let stepSize = rayLength / f32(NUM_SAMPLES);
                
                for (var i = 0; i < NUM_SAMPLES; i = i + 1) {
                    let t = tStart + (f32(i) + 0.5) * stepSize;
                    let samplePos = cameraPos + rayDir * t;
                    let height = length(samplePos - earthCenter) - earthRadius;
                    
                    let densityRayleigh = densityAtHeight(max(0.0, height), rayleighScale);
                    let densityMie = densityAtHeight(max(0.0, height), mieScale);
                    
                    viewOpticalDepthRayleigh = viewOpticalDepthRayleigh + densityRayleigh * stepSize;
                    viewOpticalDepthMie = viewOpticalDepthMie + densityMie * stepSize;
                    
                    let sunIntersect = raySphereIntersect(samplePos, sunDir, earthCenter, atmosphereRadius);
                    
                    if (sunIntersect.y > 0.0) {
                        let sunEarthIntersect = raySphereIntersect(samplePos, sunDir, earthCenter, earthRadius);
                        
                        if (sunEarthIntersect.x < 0.0) {
                            let sunRayLength = sunIntersect.y;
                            
                            let sunOpticalDepthRayleigh = opticalDepth(
                                samplePos, sunDir, sunRayLength,
                                earthCenter, earthRadius, rayleighScale
                            );
                            let sunOpticalDepthMie = opticalDepth(
                                samplePos, sunDir, sunRayLength,
                                earthCenter, earthRadius, mieScale
                            );
                            
                            let totalOpticalDepthRayleigh = viewOpticalDepthRayleigh + sunOpticalDepthRayleigh;
                            let totalOpticalDepthMie = viewOpticalDepthMie + sunOpticalDepthMie;
                            
                            let transmittance = exp(
                                -(rayleighCoeff * totalOpticalDepthRayleigh + 
                                vec3<f32>(mieCoeff) * totalOpticalDepthMie)
                            );
                            
                            totalRayleigh = totalRayleigh + densityRayleigh * transmittance * stepSize;
                            totalMie = totalMie + densityMie * transmittance * stepSize;
                        }
                    }
                }
            }
        }
        
        // Phase functions
        let cosTheta = dot(rayDir, sunDir);
        let phaseR = rayleighPhase(cosTheta);
        let phaseM = miePhase(cosTheta, mieG);
        
        // Scattering color
        let rayleighColor = totalRayleigh * rayleighCoeff * phaseR;
        let mieColor = totalMie * mieCoeff * phaseM;
        var color = (rayleighColor + mieColor) * sunIntensity;
        
        // Sun attenuation through atmosphere (1.0 when no atmosphere traversal)
        let sunAttenuation = exp(-(rayleighCoeff * viewOpticalDepthRayleigh + vec3<f32>(mieCoeff) * viewOpticalDepthMie));

        // Glow only when ray passes through atmosphere; sun disc always visible
        var sunDisc = 0.0;
        if (!hitEarth) {
            if (hitAtm) {
                let cosTheta01 = max(cosTheta, 0.0);
                let glow1 = pow(cosTheta01, 350.0) * 0.08;
                let glow2 = pow(cosTheta01, 60.0) * 0.012;
                let glow3 = pow(cosTheta01, 6.0) * 0.003;
                let glowColor = vec3<f32>(1.0, 0.92, 0.82);
                color = color + glowColor * (glow1 + glow2 + glow3) * sunIntensity * sunAttenuation;
            }

            // Sun disc
            let sunAngularRadius = 0.035;
            let sunCosAngle = cos(sunAngularRadius);
            if (cosTheta > sunCosAngle) {
                sunDisc = smoothstep(sunCosAngle - 0.003, sunCosAngle, cosTheta);
            }
        }
        
        // Discard if nothing visible
        if (!hitAtm && length(color) < 0.0001 && sunDisc < 0.001) {
            discard;
        }

        // Apply exposure
        color = color * global.exposure;
        
        // Tone mapping (ACES approximation)
        let a = 2.51;
        let b = 0.03;
        let c = 2.43;
        let d = 0.59;
        let e = 0.14;
        color = clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
        
        // Gamma correction
        color = pow(color, vec3<f32>(1.0 / 2.2));
        
        // Sun disc composited AFTER tone mapping (always visible)
        if (sunDisc > 0.0) {
            let sunCenterColor = vec3<f32>(1.0, 1.0, 0.98);
            let sunEdgeColor = vec3<f32>(1.0, 0.85, 0.4);
            let centerFactor = pow(sunDisc, 0.4);
            let sunDiskColor = mix(sunEdgeColor, sunCenterColor, centerFactor);
            color = mix(color, sunDiskColor, sunDisc);
        }
        
        // Alpha
        let scatterIntensity = length(color);
        var alpha = 1.0;
        if (!hitAtm) {
            alpha = clamp(scatterIntensity * 2.0, 0.0, 1.0);
        } else if (!hitEarth) {
            let viewTransmittance = exp(-(rayleighCoeff * viewOpticalDepthRayleigh + vec3<f32>(mieCoeff) * viewOpticalDepthMie));
            let avgTransmittance = (viewTransmittance.x + viewTransmittance.y + viewTransmittance.z) / 3.0;
            let atmOpacity = 1.0 - avgTransmittance;
            alpha = max(atmOpacity, clamp(scatterIntensity * 2.0, 0.0, 1.0));
        }

        var fragmentOutput: FragmentOutput;
        fragmentOutput.color = vec4<f32>(color, alpha);
        
        #if USE_OUTDEPTH
            fragmentOutput.out_depth = 1.0;
        #endif
        
        return fragmentOutput;
    }
    `;
}
