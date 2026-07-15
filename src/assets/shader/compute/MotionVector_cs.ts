/**
 * Screen-space motion vector compute pass. Reverse-reprojects each
 * pixel's reconstructed world position with the previous frame's
 * viewProj matrix and stores `(currUv - prevUv)` per pixel into a
 * rg16float storage texture.
 *
 * MVP simplification: world position comes from gBuffer.x depth +
 * current invViewProj. This is correct for static / camera-only
 * motion. Per-vertex motion vectors (skinned mesh, animated
 * geometry) need a vertex-stage prev-clip-pos write, deferred.
 *
 * @internal
 */
export let MotionVector_cs: string = /*wgsl*/`
    #include "GlobalUniform"
    #include "GBufferStand"

    const PI: f32 = 3.1415926;

    struct MVData {
        prevViewProj: mat4x4<f32>,
    };

    @group(0) @binding(2) var<uniform> mvData: MVData;
    @group(0) @binding(3) var inTex: texture_2d<f32>;
    @group(0) @binding(4) var outTex: texture_storage_2d<rgba16float, write>;

    var<private> texSize: vec2<u32>;
    var<private> fragCoord: vec2<i32>;
    var<private> fragUV: vec2<f32>;
    var<private> gBuffer: GBuffer;

    @compute @workgroup_size(8, 8, 1)
    fn CsMain(@builtin(global_invocation_id) gid: vec3<u32>) {
        fragCoord = vec2<i32>(gid.xy);
        texSize = textureDimensions(inTex).xy;
        if (fragCoord.x >= i32(texSize.x) || fragCoord.y >= i32(texSize.y)) { return; }
        fragUV = vec2<f32>(fragCoord) / vec2<f32>(texSize - 1u);

        useNormalMatrixInv();
        gBuffer = getGBuffer(fragCoord);
        let visible = getRoughnessFromGBuffer(gBuffer);
        if (visible <= 0.0) {
            // sky / unwritten pixel: zero motion vector
            textureStore(outTex, fragCoord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
            return;
        }

        // Reconstruct world position from current-frame depth.
        let worldPos = getWorldPositionFromGBuffer(gBuffer, fragUV);

        // Project with prev frame's viewProj to get prev-frame UV.
        let prevClip = mvData.prevViewProj * vec4<f32>(worldPos, 1.0);
        if (prevClip.w <= 0.0) {
            textureStore(outTex, fragCoord, vec4<f32>(0.0, 0.0, 0.0, 0.0));
            return;
        }
        let prevNdc = prevClip.xyz / prevClip.w;
        let prevUv = vec2<f32>(prevNdc.x * 0.5 + 0.5, -prevNdc.y * 0.5 + 0.5);

        let motion = fragUV - prevUv;
        textureStore(outTex, fragCoord, vec4<f32>(motion.x, motion.y, 0.0, 0.0));
    }
`;
