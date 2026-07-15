/**
 * Skyline compute shader - detect sky-object boundaries and draw outline
 * @internal
 */
export let Skyline_cs: string = /*wgsl*/ `
const PI: f32 = 3.141592653589793;
#include "MathShader"
#include "FastMathShader"
#include "BitUtil"
#include "ColorUtil_frag"

@group(0) @binding(1) var gBufferTexture : texture_2d<f32>;

struct SkylineSettingData {
    lineColor: vec4<f32>,
    lineWidth: f32,
    depthThreshold: f32,
    strength: f32,
    slot: f32,
}

@group(0) @binding(2) var<uniform> skylineSetting: SkylineSettingData;
@group(0) @binding(3) var inTex: texture_2d<f32>;
@group(0) @binding(4) var outTex: texture_storage_2d<rgba16float, write>;

var<private> texSize: vec2<u32>;
var<private> fragCoord: vec2<i32>;

fn getGBufferData(fragCoord: vec2<i32>) -> vec4<f32> {
    return textureLoad(gBufferTexture, fragCoord, 0);
}

fn getRoughnessValue(gBufferData: vec4<f32>) -> f32 {
    let channel = float_to_r11g11b9(gBufferData.y);
    return channel.z;
}

fn isSkyPixel(coord: vec2<i32>) -> bool {
    if (coord.x < 0 || coord.y < 0 || coord.x >= i32(texSize.x) || coord.y >= i32(texSize.y)) {
        return false;
    }
    let gBufferData = getGBufferData(coord);
    // Sky pixels have roughness <= 0
    let roughness = getRoughnessValue(gBufferData);
    return roughness <= 0.0;
}

fn detectSkylineEdge(coord: vec2<i32>, lineWidth: i32) -> f32 {
    let centerIsSky = isSkyPixel(coord);
    
    // We only draw the line on object pixels that are adjacent to sky
    if (centerIsSky) {
        return 0.0; // Don't draw line on sky pixels
    }
    
    // Check if this object pixel is at the boundary with sky
    var edgeWeight: f32 = 0.0;
    let width = lineWidth;
    
    // Sample in a square pattern around the pixel
    for (var dy: i32 = -width; dy <= width; dy = dy + 1) {
        for (var dx: i32 = -width; dx <= width; dx = dx + 1) {
            if (dx == 0 && dy == 0) {
                continue;
            }
            let sampleCoord = coord + vec2<i32>(dx, dy);
            if (isSkyPixel(sampleCoord)) {
                // Calculate weight based on distance
                let dist = sqrt(f32(dx * dx + dy * dy));
                let weight = 1.0 - (dist / f32(width + 1));
                edgeWeight = max(edgeWeight, weight);
            }
        }
    }
    
    return edgeWeight;
}

@compute @workgroup_size(8, 8, 1)
fn CsMain(@builtin(workgroup_id) workgroup_id: vec3<u32>, @builtin(global_invocation_id) globalInvocation_id: vec3<u32>) {
    fragCoord = vec2<i32>(globalInvocation_id.xy);
    texSize = textureDimensions(inTex).xy;
    
    if (fragCoord.x >= i32(texSize.x) || fragCoord.y >= i32(texSize.y)) {
        return;
    }
    
    let lineWidth = i32(skylineSetting.lineWidth);
    let edgeWeight = detectSkylineEdge(fragCoord, lineWidth);
    
    // Get original color
    let originalColor = textureLoad(inTex, fragCoord, 0);
    
    // Blend with line color based on edge weight and strength
    var finalColor: vec4<f32>;
    if (edgeWeight > 0.0) {
        let blendFactor = edgeWeight * skylineSetting.strength;
        finalColor = vec4<f32>(
            mix(originalColor.rgb, skylineSetting.lineColor.rgb, blendFactor),
            originalColor.a
        );
    } else {
        finalColor = originalColor;
    }
    
    textureStore(outTex, fragCoord, finalColor);
}
`;
