/**
 * @internal
 * Sprite shader — a textured, tinted quad in world space with an optional
 * distance-invariant size mode and an optional `USE_VIDEO_TEXTURE` branch
 * that samples a `texture_external` (WebGPU video pipeline) instead of a
 * static `texture_2d<f32>`.
 *
 * Runs through the standard `Common_vert` / `Common_frag` / `UnLit_frag`
 * pipeline so the sprite participates in the forward pass alongside
 * regular 3D meshes (transparent bucket, depth-test on, depth-write off).
 *
 * RFC-005 removed the UI-only features (9-slice / fillRatio / cornerRadius /
 * UV scissor) — sprites are now a pure 3D-scene primitive, not a mini UI
 * framework.
 */
export let Sprite_shader: string = /*wgsl*/ `
    #include "Common_vert"
    #include "Common_frag"
    #include "UnLit_frag"

    #if USE_CUSTOMUNIFORM
    #else
        struct MaterialUniform {
            color: vec4<f32>,
            uvRect: vec4<f32>,
            size: vec2<f32>,
            pivot: vec2<f32>,
            distanceInvariant: f32,
            cornerRadius: f32,
            spritePad0: f32,
            spritePad1: f32,
        };
    #endif

    @group(2) @binding(0)
    var<uniform> materialUniform: MaterialUniform;

    @group(1) @binding(auto)
    var baseMapSampler: sampler;
    #if USE_VIDEO_TEXTURE
        @group(1) @binding(auto)
        var baseMap: texture_external;
    #else
        @group(1) @binding(auto)
        var baseMap: texture_2d<f32>;
    #endif

    fn vert(inputData: VertexAttributes) -> VertexOutput {
        // Shared unit-quad has positions in [-0.5, +0.5].
        // Apply pivot (0..1, 0.5 = centered) then scale by size (world units).
        var v = inputData;
        let shift = vec2<f32>(0.5 - materialUniform.pivot.x, 0.5 - materialUniform.pivot.y);
        var scale = materialUniform.size;
        if (materialUniform.distanceInvariant > 0.5) {
            // Keep on-screen size constant as the camera moves by scaling the
            // quad's local extent with camera distance. Reference distance is
            // hard-coded to 10 m — the size value is "meters at 10 m depth".
            // ORI_MATRIX_M is the per-node model matrix, already populated by
            // Inline_vert by the time our vert() is called.
            let worldOrigin = (ORI_MATRIX_M * vec4<f32>(0.0, 0.0, 0.0, 1.0)).xyz;
            let camDist = distance(worldOrigin, globalUniform.CameraPos);
            scale = scale * (camDist / 10.0);
        }
        v.position = vec3<f32>(
            (inputData.position.x + shift.x) * scale.x,
            (inputData.position.y + shift.y) * scale.y,
            inputData.position.z
        );
        ORI_Vert(v);
        return ORI_VertexOut;
    }

    // Rounded-corner SDF in local UV space [0,1]². Result is an alpha mask
    // in [0,1] that's 1.0 well inside, smoothly drops to 0.0 at the rounded
    // edge. Radius is in world units (matches size).
    fn spriteCornerMask(local: vec2<f32>, radius: f32) -> f32 {
        let half = materialUniform.size * 0.5;
        let p = (local - vec2<f32>(0.5)) * materialUniform.size;
        let r = min(radius, min(half.x, half.y));
        let q = abs(p) - half + vec2<f32>(r);
        let d = length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
        return 1.0 - smoothstep(-1.0, 1.0, d);
    }

    fn frag() {
        let local = ORI_VertexVarying.fragUV0;
        let uv = materialUniform.uvRect.xy + local * materialUniform.uvRect.zw;

        #if USE_VIDEO_TEXTURE
            let vsize = textureDimensions(baseMap).xy - 1;
            let iuv = vec2<i32>(uv * vec2<f32>(vsize));
            var sampled = textureLoad(baseMap, iuv);
        #else
            var sampled = textureSample(baseMap, baseMapSampler, uv);
        #endif
        // Sprite baseMap samples come back sRGB-encoded — both
        // paths: rgba8unorm PNG bytes are sRGB by convention, and
        // texture_external defaults to colorSpace='srgb' returning
        // gamma-encoded values. Decode to linear before the lighting /
        // composite math so the final sRGB-swapchain encode lands on
        // real linear values. USE_SRGB_ALBEDO opts out for hardware-
        // decoded textures.
        #if !USE_SRGB_ALBEDO
            sampled = vec4f(gammaToLiner(sampled.rgb), sampled.a);
        #endif
        sampled = sampled * materialUniform.color;

        if (materialUniform.cornerRadius > 0.0) {
            sampled.a = sampled.a * spriteCornerMask(local, materialUniform.cornerRadius);
        }

        if (sampled.a <= 0.0) {
            discard;
        }

        ORI_ShadingInput.BaseColor = sampled;
        UnLit();
    }
`
