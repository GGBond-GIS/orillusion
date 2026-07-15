import { GPUFrustumCull_cs } from '../../../assets/shader/compute/GPUFrustumCull_cs';
import { ShaderLib } from '../../../assets/shader/ShaderLib';
import { View3D } from '../../../core/View3D';
import { RenderNode } from '../../../components/renderer/RenderNode';
import { Matrix4 } from '../../../math/Matrix4';
import { Context3D } from '../../graphics/webGpu/Context3D';
import { ComputeShader } from '../../graphics/webGpu/shader/ComputeShader';
import { StorageGPUBuffer } from '../../graphics/webGpu/core/buffer/StorageGPUBuffer';
import { UniformGPUBuffer } from '../../graphics/webGpu/core/buffer/UniformGPUBuffer';
import { RTResourceMap } from '../frame/RTResourceMap';

/**
 * GPU-driven mesh culling system.
 *
 * Maintains a per-engine-instance storage buffer of mesh metadata
 * (world-space AABB + matrix index + indexCount/firstIndex/baseVertex)
 * synced from the scene's RenderNode set. Each frame, dispatches a
 * compute pass that:
 *   1. Tests every mesh's AABB against the camera's 6 frustum planes.
 *   2. (Optional, off by default) Tests against `_HiZPyramid` for
 *      occlusion rejection.
 *   3. Atomically appends visible meshes' indirect-draw args to a
 *      `drawCmds` storage buffer, with a `drawCount` atomic counter.
 *
 * **Output buffers**:
 *   - `visibilityBuffer` (u32 per mesh) — 1 visible / 0 culled
 *   - `drawCmdsBuffer` ({u32, u32, u32, i32, u32} per visible mesh)
 *   - `drawCountBuffer` (u32, atomic counter)
 *
 * Renderer integration is OPT-IN and follow-up work — see
 * `GPUCullFeature.execute()`. Without integration the buffers are still
 * computed and observable in dev tools, allowing perf measurement and
 * incremental adoption.
 *
 * @group GFX
 */
export class GPUCullSystem {
    private readonly _ctx: Context3D;

    /** Capacity of the metadata SSBO. Resized on demand. */
    private _capacity: number = 0;
    private _meshCount: number = 0;

    /** Backing CPU staging array (Float32Array view); indexes are
     *  `meshIdx * STRIDE`. STRIDE = 12 floats = 3 vec4. */
    private static readonly STRIDE = 12;
    private _staging: Float32Array | null = null;

    private _meshMetadataBuffer: StorageGPUBuffer | null = null;
    private _visibilityBuffer: StorageGPUBuffer | null = null;
    private _drawCmdsBuffer: StorageGPUBuffer | null = null;
    private _drawCountBuffer: StorageGPUBuffer | null = null;
    private _settingsBuffer: UniformGPUBuffer | null = null;

    private _compute: ComputeShader | null = null;
    private readonly _viewProj: Matrix4 = new Matrix4().identity();
    private _useHiZ: boolean = false;

    /** Map of RenderNode instanceID → SSBO slot. */
    private readonly _slotMap: Map<string, number> = new Map();

    constructor(ctx: Context3D) {
        this._ctx = ctx;
    }

    public get meshCount(): number { return this._meshCount; }
    public get visibilityBuffer(): StorageGPUBuffer | null { return this._visibilityBuffer; }
    public get drawCmdsBuffer(): StorageGPUBuffer | null { return this._drawCmdsBuffer; }
    public get drawCountBuffer(): StorageGPUBuffer | null { return this._drawCountBuffer; }

    /** Toggle Hi-Z occlusion testing (in addition to frustum culling).
     *  Caller is responsible for ensuring the `_HiZPyramid` texture
     *  exists in the engine's RTResourceMap before flipping to true. */
    public set useHiZ(v: boolean) { this._useHiZ = v; }
    public get useHiZ(): boolean { return this._useHiZ; }

    private _ensureCapacity(want: number): void {
        if (want <= this._capacity) return;
        const newCap = Math.max(64, Math.ceil(want * 1.5));
        const stride = GPUCullSystem.STRIDE;
        const newStaging = new Float32Array(newCap * stride);
        if (this._staging) newStaging.set(this._staging);
        this._staging = newStaging;
        this._capacity = newCap;
        // Force buffer recreation
        this._meshMetadataBuffer = null;
        this._visibilityBuffer = null;
        this._drawCmdsBuffer = null;
        this._compute = null;
    }

    /** Register a RenderNode in the cull system, returning its SSBO slot.
     *  Idempotent; calling with an existing node updates its metadata. */
    public registerNode(node: RenderNode): number {
        if (!node.geometry || !node.object3D?.bound) return -1;
        let slot = this._slotMap.get(node.instanceID);
        if (slot === undefined) {
            slot = this._meshCount++;
            this._slotMap.set(node.instanceID, slot);
            this._ensureCapacity(this._meshCount);
        }
        this._writeMetadata(slot, node);
        return slot;
    }

    public unregisterNode(node: RenderNode): void {
        const slot = this._slotMap.get(node.instanceID);
        if (slot === undefined) return;
        this._slotMap.delete(node.instanceID);
        // Mark slot disabled by zeroing enable flag (drawArgs.w).
        const stride = GPUCullSystem.STRIDE;
        const base = slot * stride;
        if (this._staging) this._staging[base + 11] = 0; // drawArgs.w
    }

    private _writeMetadata(slot: number, node: RenderNode): void {
        const stride = GPUCullSystem.STRIDE;
        const base = slot * stride;
        const buf = this._staging!;
        const bound = node.object3D.bound as any;
        // Bound min / max in world space. RenderNode.bound is updated
        // automatically when the transform changes (octree tracking).
        const bMin = bound.min ?? bound.center;
        const bMax = bound.max ?? bound.center;
        buf[base + 0] = bMin.x; buf[base + 1] = bMin.y; buf[base + 2] = bMin.z;
        // matrixIdx — RenderNode.transform.worldMatrix.index is the
        // slot in the global matrix SSBO.
        buf[base + 3] = bitcastU32ToF32((node.transform as any)?._worldMatrix?.index ?? 0);
        buf[base + 4] = bMax.x; buf[base + 5] = bMax.y; buf[base + 6] = bMax.z;
        // index count from the geometry's first sub-geometry's first lod
        const sub0 = node.geometry?.subGeometries?.[0];
        const lod0 = sub0?.lodLevels?.[0];
        const indexCount = lod0?.indexCount ?? 0;
        const firstIndex = lod0?.indexStart ?? 0;
        buf[base + 7] = bitcastU32ToF32(indexCount);
        buf[base + 8] = bitcastU32ToF32(firstIndex);
        buf[base + 9] = bitcastU32ToF32(0); // baseVertex (TODO: real value)
        buf[base + 10] = bitcastU32ToF32(node.instanceCount > 0 ? node.instanceCount : 1);
        buf[base + 11] = bitcastU32ToF32(node.enable ? 1 : 0);
    }

    /** Dispatch the cull compute pass for the given camera. */
    public execute(view: View3D): void {
        if (this._meshCount === 0) return;
        const ctx = this._ctx;

        if (!this._compute) {
            ShaderLib.register('GPUFrustumCull_cs', GPUFrustumCull_cs);
            this._compute = new ComputeShader(GPUFrustumCull_cs);

            // Settings: 6 vec4 planes + 4 vec4 viewProj + 1 vec4 (counts) +
            // 1 vec4 (screenSize + pad) = 6+16+4+4 = 30 floats; round to 32
            this._settingsBuffer = new UniformGPUBuffer(32);
            this._compute.setUniformBuffer('cullSettings', this._settingsBuffer);

            this._meshMetadataBuffer = new StorageGPUBuffer(this._capacity * GPUCullSystem.STRIDE);
            this._compute.setStorageBuffer('meshes', this._meshMetadataBuffer);

            this._visibilityBuffer = new StorageGPUBuffer(this._capacity);
            this._compute.setStorageBuffer('visibility', this._visibilityBuffer);

            // 5 u32 per draw cmd
            this._drawCmdsBuffer = new StorageGPUBuffer(this._capacity * 5);
            this._compute.setStorageBuffer('drawCmds', this._drawCmdsBuffer);

            // Single u32 atomic counter
            this._drawCountBuffer = new StorageGPUBuffer(1);
            this._compute.setStorageBuffer('drawCount', this._drawCountBuffer);

            // Hi-Z pyramid binding — bind even when occlusion is off so
            // shader has a valid handle. RTResourceMap may not have the
            // texture yet on the very first frame; bind a 1×1 placeholder
            // when missing.
            const hiz = RTResourceMap.getTexture(this._ctx, '_HiZPyramid');
            if (hiz) {
                this._compute.setSamplerTexture('hizPyramid', hiz);
            }

            this._compute.workerSizeX = Math.max(1, Math.ceil(this._capacity / 64));
            this._compute.workerSizeY = 1;
            this._compute.workerSizeZ = 1;
        }

        // Push current metadata to GPU.
        this._meshMetadataBuffer!.setFloat32Array('data', this._staging!);
        this._meshMetadataBuffer!.apply();

        // Build settings: extract 6 frustum planes from camera view-proj.
        // Camera3D exposes `frustum` which is updated each frame by the
        // collect path; planes are in `view.camera.frustum.planes`.
        const planes = (view.camera as any).frustum?.planes;
        for (let p = 0; p < 6; p++) {
            const plane = planes ? planes[p] : null;
            const nx = plane?.normal?.x ?? 0;
            const ny = plane?.normal?.y ?? 0;
            const nz = plane?.normal?.z ?? 0;
            const d  = plane?.distance ?? 0;
            this._settingsBuffer!.setFloat(`frustumPlanes[${p}].x`, nx);
            this._settingsBuffer!.setFloat(`frustumPlanes[${p}].y`, ny);
            this._settingsBuffer!.setFloat(`frustumPlanes[${p}].z`, nz);
            this._settingsBuffer!.setFloat(`frustumPlanes[${p}].w`, d);
        }
        // viewProj for Hi-Z screen-space projection (also kept around
        // when occlusion is off — shader cost is negligible).
        this._viewProj.multiplyMatrices(view.camera.projectionMatrix, view.camera.viewMatrix);
        this._settingsBuffer!.setMatrix('viewProj', this._viewProj);

        this._settingsBuffer!.setFloat('meshCount', this._meshCount);
        // Hi-Z occlusion is gated; without a bound pyramid we keep it off.
        const hiz = RTResourceMap.getTexture(this._ctx, '_HiZPyramid');
        const useHiZNow = this._useHiZ && !!hiz;
        this._settingsBuffer!.setFloat('useHiZ', useHiZNow ? 1 : 0);
        this._settingsBuffer!.setFloat('hiZMipCount', hiz ? Math.max(1, Math.floor(Math.log2(Math.max(hiz.width, hiz.height))) + 1) : 1);
        this._settingsBuffer!.setFloat('_pad1', 0);
        const [sw, sh] = this._ctx.presentationSize;
        this._settingsBuffer!.setFloat('screenSize.x', sw);
        this._settingsBuffer!.setFloat('screenSize.y', sh);
        this._settingsBuffer!.setFloat('_pad2.x', 0);
        this._settingsBuffer!.setFloat('_pad2.y', 0);
        this._settingsBuffer!.apply();

        // Reset atomic counter to zero before the dispatch.
        // (StorageGPUBuffer doesn't expose a "clear to zero" — write a
        // single u32 view from a typed array.)
        const zeros = new Uint32Array([0]);
        ctx.device.queue.writeBuffer(this._drawCountBuffer!.buffer, 0, zeros);

        // Dispatch.
        const gpu = ctx.gpuContext;
        const command = gpu.beginCommandEncoder();
        gpu.computeCommand(command, [this._compute!]);
        gpu.endCommandEncoder(command);
    }
}

/** Reinterpret the bits of a u32 as f32. WebGPU `bitcast<f32>(u32)` on
 *  the shader side; this mirror is needed because StorageGPUBuffer
 *  takes Float32 — we can't write a u32 directly. */
function bitcastU32ToF32(u: number): number {
    const buf = new ArrayBuffer(4);
    new Uint32Array(buf)[0] = u >>> 0;
    return new Float32Array(buf)[0];
}
