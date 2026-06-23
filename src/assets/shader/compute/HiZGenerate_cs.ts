/**
 * Hi-Z (max-z) depth pyramid generator.
 *
 * Two pipelines:
 *
 *   1. `HiZ_Init`: copies depth from the compressed GBuffer (gBuffer.x)
 *      into pyramid mip 0 at full scene resolution. r16float is more
 *      than enough precision for occlusion tests (0..1 NDC z range).
 *
 *   2. `HiZ_Reduce`: per-mip 2×2 max reduction. Larger Z = farther in
 *      WebGPU NDC, so max-z gives the FARTHEST visible surface in each
 *      4-pixel block. Occlusion tests then check
 *      `if myObject.minNDCz > pyramid[mip].max → cull`.
 *
 * @internal
 */

export let HiZ_Init_cs: string = /*wgsl*/`
    @group(0) @binding(0) var srcTex: texture_2d<f32>;
    @group(0) @binding(1) var dstTex: texture_storage_2d<r32float, write>;

    @compute @workgroup_size(8, 8, 1)
    fn CsMain(@builtin(global_invocation_id) gid: vec3<u32>) {
        let dstSize = textureDimensions(dstTex);
        if (gid.x >= dstSize.x || gid.y >= dstSize.y) { return; }
        // Compressed gbuffer packs depth into .x. Read at the same
        // coord (mip 0 of the pyramid is full scene resolution).
        let depth = textureLoad(srcTex, vec2<i32>(gid.xy), 0).x;
        textureStore(dstTex, vec2<i32>(gid.xy), vec4<f32>(depth, 0.0, 0.0, 0.0));
    }
`;

export let HiZ_Reduce_cs: string = /*wgsl*/`
    @group(0) @binding(0) var srcTex: texture_2d<f32>;
    @group(0) @binding(1) var dstTex: texture_storage_2d<r32float, write>;

    @compute @workgroup_size(8, 8, 1)
    fn CsMain(@builtin(global_invocation_id) gid: vec3<u32>) {
        let dstSize = textureDimensions(dstTex);
        if (gid.x >= dstSize.x || gid.y >= dstSize.y) { return; }
        let srcSize = textureDimensions(srcTex);
        // 2:1 downsample with max reduction. Clamp source coords to
        // src bounds so odd-sized mips don't read out-of-range.
        let srcCoord = vec2<i32>(i32(gid.x) * 2, i32(gid.y) * 2);
        let maxX = i32(srcSize.x) - 1;
        let maxY = i32(srcSize.y) - 1;
        let c00 = vec2<i32>(min(srcCoord.x, maxX), min(srcCoord.y, maxY));
        let c01 = vec2<i32>(min(srcCoord.x + 1, maxX), min(srcCoord.y, maxY));
        let c10 = vec2<i32>(min(srcCoord.x, maxX), min(srcCoord.y + 1, maxY));
        let c11 = vec2<i32>(min(srcCoord.x + 1, maxX), min(srcCoord.y + 1, maxY));
        let s00 = textureLoad(srcTex, c00, 0).r;
        let s01 = textureLoad(srcTex, c01, 0).r;
        let s10 = textureLoad(srcTex, c10, 0).r;
        let s11 = textureLoad(srcTex, c11, 0).r;
        let maxZ = max(max(s00, s01), max(s10, s11));
        textureStore(dstTex, vec2<i32>(gid.xy), vec4<f32>(maxZ, 0.0, 0.0, 0.0));
    }
`;
