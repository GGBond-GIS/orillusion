/**
 * GPU-driven mesh-level culling. Tests each mesh's world-space AABB
 * against the camera frustum (and, when enabled, against the Hi-Z
 * pyramid for occlusion). Outputs:
 *
 *   - `visibility[i]`: 1 if mesh i is visible, 0 if culled.
 *   - `drawCmds[]`: indirect-draw arguments compacted via atomic counter.
 *     One entry per visible mesh; the host renderer issues one
 *     `drawIndexedIndirect` per slot (or one with `firstInstance` indexing
 *     to source the slot's params).
 *
 * Per-mesh storage struct (matches RenderNodeMetadataBuffer.ts):
 *   - boundsMinAndMatrixIdx (vec4): xyz = world AABB min, w = matrix index
 *   - boundsMaxAndIndexCount (vec4): xyz = world AABB max, w = index count
 *   - drawArgs (vec4u): xyz = (firstIndex, baseVertex, instanceCount), w = enable flag
 *
 * Skipped meshes (enable = 0) drop out without contributing to the
 * indirect arg buffer.
 *
 * MVP scope: frustum-only. Hi-Z occlusion test is gated on the
 * `useHiZ` uniform — leave at 0 to skip; flip to 1 when Hi-Z pyramid
 * binding is wired (deferred — see GPUCullFeature class doc).
 *
 * @internal
 */
export let GPUFrustumCull_cs: string = /*wgsl*/`
    struct MeshMeta {
        // xyz = world AABB min, w = bitcast<f32>(matrixIdx)
        boundsMinMatrixIdx: vec4<f32>,
        // xyz = world AABB max, w = bitcast<f32>(indexCount)
        boundsMaxIndexCount: vec4<f32>,
        // x = bitcast<f32>(firstIndex), y = bitcast<f32>(baseVertex),
        // z = bitcast<f32>(instanceCount), w = bitcast<f32>(enableFlag)
        drawArgs: vec4<f32>,
    };

    struct DrawIndirectArgs {
        indexCount: u32,
        instanceCount: u32,
        firstIndex: u32,
        baseVertex: i32,
        firstInstance: u32,
    };

    struct CullSettings {
        // Six camera frustum planes (vec4 each: xyz=normal, w=offset).
        frustumPlanes: array<vec4<f32>, 6>,
        // viewProj for projecting the AABB into screen space (Hi-Z).
        viewProj: mat4x4<f32>,
        meshCount: u32,
        useHiZ: u32,
        hiZMipCount: u32,
        _pad1: u32,
        // Screen size for converting NDC → pixel coords.
        screenSize: vec2<f32>,
        _pad2: vec2<f32>,
    };

    @group(0) @binding(0) var<uniform> cullSettings: CullSettings;
    @group(0) @binding(1) var<storage, read> meshes: array<MeshMeta>;
    @group(0) @binding(2) var<storage, read_write> visibility: array<u32>;
    @group(0) @binding(3) var<storage, read_write> drawCmds: array<DrawIndirectArgs>;
    @group(0) @binding(4) var<storage, read_write> drawCount: array<atomic<u32>, 1>;
    @group(0) @binding(5) var hizPyramid: texture_2d<f32>;

    fn aabbOutsidePlane(planeNormal: vec3<f32>, planeOffset: f32, bMin: vec3<f32>, bMax: vec3<f32>) -> bool {
        // Pick the AABB corner farthest along the plane normal — if even
        // that corner is on the negative side of the plane, the whole
        // box is culled.
        let p = vec3<f32>(
            select(bMin.x, bMax.x, planeNormal.x > 0.0),
            select(bMin.y, bMax.y, planeNormal.y > 0.0),
            select(bMin.z, bMax.z, planeNormal.z > 0.0),
        );
        return dot(planeNormal, p) + planeOffset < 0.0;
    }

    @compute @workgroup_size(64, 1, 1)
    fn CsMain(@builtin(global_invocation_id) gid: vec3<u32>) {
        let i = gid.x;
        if (i >= cullSettings.meshCount) { return; }
        let m = meshes[i];

        // Disabled mesh (renderer destroyed / hidden) — output 0 visibility.
        let enableFlag = bitcast<u32>(m.drawArgs.w);
        if (enableFlag == 0u) {
            visibility[i] = 0u;
            return;
        }

        let bMin = m.boundsMinMatrixIdx.xyz;
        let bMax = m.boundsMaxIndexCount.xyz;

        // Frustum test against all 6 planes.
        var inFrustum: bool = true;
        for (var p: i32 = 0; p < 6; p = p + 1) {
            let plane = cullSettings.frustumPlanes[p];
            if (aabbOutsidePlane(plane.xyz, plane.w, bMin, bMax)) {
                inFrustum = false;
                break;
            }
        }

        if (!inFrustum) {
            visibility[i] = 0u;
            return;
        }

        // Hi-Z occlusion test. Project the 8 AABB corners with the
        // camera viewProj, take screen-space min/max + min ndc-z (the
        // closest point of the AABB toward the camera), then compare
        // against the max-z stored in the appropriate Hi-Z mip.
        if (cullSettings.useHiZ == 1u) {
            var minUV = vec2<f32>(1.0, 1.0);
            var maxUV = vec2<f32>(0.0, 0.0);
            var minNDCz = 1.0;
            var anyBehind = false;
            for (var c: i32 = 0; c < 8; c = c + 1) {
                let cx = select(bMin.x, bMax.x, (c & 1) != 0);
                let cy = select(bMin.y, bMax.y, (c & 2) != 0);
                let cz = select(bMin.z, bMax.z, (c & 4) != 0);
                let clip = cullSettings.viewProj * vec4<f32>(cx, cy, cz, 1.0);
                if (clip.w <= 0.0) { anyBehind = true; continue; }
                let ndc = clip.xyz / clip.w;
                let uv = vec2<f32>(ndc.x * 0.5 + 0.5, -ndc.y * 0.5 + 0.5);
                minUV = min(minUV, uv);
                maxUV = max(maxUV, uv);
                minNDCz = min(minNDCz, ndc.z);
            }
            // If any corner is behind the near plane, conservatively keep
            // the mesh — perspective-flipped corners give bogus UVs.
            if (!anyBehind && minUV.x < maxUV.x && minUV.y < maxUV.y) {
                let extentPx = max((maxUV.x - minUV.x) * cullSettings.screenSize.x,
                                   (maxUV.y - minUV.y) * cullSettings.screenSize.y);
                let mipLevel = clamp(i32(ceil(log2(max(extentPx, 1.0)))), 0, i32(cullSettings.hiZMipCount) - 1);
                let mipSize = vec2<f32>(textureDimensions(hizPyramid, mipLevel));
                let centerUV = (minUV + maxUV) * 0.5;
                let coord = vec2<i32>(clamp(centerUV * mipSize, vec2<f32>(0.0), mipSize - 1.0));
                let hiZ = textureLoad(hizPyramid, coord, mipLevel).r;
                // If the AABB's CLOSEST z is FARTHER than the farthest
                // surface in this region, the mesh is occluded.
                if (minNDCz > hiZ) {
                    visibility[i] = 0u;
                    return;
                }
            }
        }

        // Visible — append draw command via atomic counter.
        visibility[i] = 1u;
        let slot = atomicAdd(&drawCount[0], 1u);
        let indexCount = bitcast<u32>(m.boundsMaxIndexCount.w);
        let firstIndex = bitcast<u32>(m.drawArgs.x);
        let baseVertex = i32(bitcast<u32>(m.drawArgs.y));
        let instanceCount = bitcast<u32>(m.drawArgs.z);
        let matrixIdx = bitcast<u32>(m.boundsMinMatrixIdx.w);

        drawCmds[slot] = DrawIndirectArgs(
            indexCount,
            instanceCount,
            firstIndex,
            baseVertex,
            matrixIdx, // firstInstance hijacked to carry matrix slot
        );
    }
`;
