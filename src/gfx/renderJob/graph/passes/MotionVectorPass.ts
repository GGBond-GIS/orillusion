import { MotionVector_cs } from '../../../../assets/shader/compute/MotionVector_cs';
import { ShaderLib } from '../../../../assets/shader/ShaderLib';
import { Matrix4 } from '../../../../math/Matrix4';
import { RenderTexture } from '../../../../textures/RenderTexture';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { UniformGPUBuffer } from '../../../graphics/webGpu/core/buffer/UniformGPUBuffer';
import { ComputeShader } from '../../../graphics/webGpu/shader/ComputeShader';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { GBufferFrame } from '../../frame/GBufferFrame';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { TextureHandle } from '../transient/ResourceHandle';
import { TextureIdentityWatcher } from '../transient/TextureIdentityWatcher';

export const MOTION_VECTOR = '_MotionVector';

/**
 * Per-pixel screen-space motion vector pass. Reverse-reprojects each
 * fragment's world position with the previous frame's viewProj matrix
 * to produce `(currUv - prevUv)` in rg16float storage.
 *
 * Consumed by TAA, motion blur, temporal denoisers.
 *
 * MVP limitation: works only for camera-driven motion. Per-vertex
 * prev-clip output for skinned meshes is the upgrade path.
 *
 * Phase 1 migration target — first pass to consume the transient
 * resource subsystem: declares its output through
 * `b.declareTexture` + `b.write(h, 'storage')` and resolves the
 * actual {@link RenderTexture} through `ctx.getTexture(handle)`
 * each frame. The pool may alias this output with any other
 * `rgba16float` screen-sized scratch texture whose lifetime ends
 * before MotionVectorPass runs.
 *
 * @group Graph
 */
export class MotionVectorPass extends RenderGraphPass {
    public readonly name = 'MotionVectorPass';

    protected _ctx!: Context3D;
    protected _mvHandle!: TextureHandle;
    protected _compute: ComputeShader | null = null;
    protected _mvData: UniformGPUBuffer | null = null;
    protected readonly _prevViewProj: Matrix4 = new Matrix4().identity();
    protected readonly _currViewProj: Matrix4 = new Matrix4().identity();
    protected readonly _scratch: Matrix4 = new Matrix4().identity();
    /** Detects pool-driven texture identity swaps (resize, re-alias)
     *  so we know when to invalidate the cached compute shader. */
    protected readonly _watcher: TextureIdentityWatcher = new TextureIdentityWatcher();
    /** Last presentationSize seen by `_ensureCompute`; mismatch triggers
     *  a workgroup count refresh (the texture is also refreshed via
     *  the watcher, but workgroup math depends on logical size, not
     *  identity). */
    protected _lastWorkerW: number = 0;
    protected _lastWorkerH: number = 0;

    public setup(b: RenderGraphBuilder): void {
        this._ctx = b.context3D;
        // Declare a screen-sized rgba16float storage texture. rgba16float
        // (not rg16float) because the latter is not in WebGPU's default
        // storage-texture format set — would require an extension on
        // some adapters. The two extra channels waste bandwidth but
        // keep the pass portable.
        //
        // usage:'auto' lets the analyzer union STORAGE_BINDING (from
        // our own b.write hint below) with TEXTURE_BINDING (from any
        // downstream pass that does b.read(handle, 'sample') — TAA
        // for example, once it migrates). Default COPY_SRC/COPY_DST
        // bits are also added by the analyzer for dev-time debug
        // copies.
        this._mvHandle = b.declareTexture(MOTION_VECTOR, {
            format: GPUTextureFormat.rgba16float,
            width: 'screen',
            height: 'screen',
            label: MOTION_VECTOR,
        });
        b.write(this._mvHandle, 'storage');
    }

    protected _ensureCompute(ctx: RenderGraphPassContext, mv: RenderTexture): void {
        const [w, h] = this._ctx.presentationSize;
        const sizeChanged = w !== this._lastWorkerW || h !== this._lastWorkerH;
        if (this._compute && !sizeChanged) return;
        if (!this._compute) {
            ShaderLib.register('MotionVector_cs', MotionVector_cs);
            this._compute = new ComputeShader(MotionVector_cs);

            // mat4x4<f32> = 16 floats
            this._mvData = new UniformGPUBuffer(16);
            this._compute.setUniformBuffer('mvData', this._mvData);

            const cameraGroup = GlobalBindGroup.getCameraGroup(ctx.view.camera);
            this._compute.setUniformBuffer('globalUniform', cameraGroup.uniformGPUBuffer);

            const rtFrame = GBufferFrame.getGBufferFrame(GBufferFrame.colorPass_GBuffer, this._ctx);
            this._compute.setSamplerTexture('gBufferTexture', rtFrame.getCompressGBufferTexture());
            this._compute.setSamplerTexture('inTex', rtFrame.getColorTexture());
            this._compute.setStorageTexture('outTex', mv);
        } else {
            // Identity-change path: keep the compiled shader, just
            // re-bind to the new storage texture (resize / pool re-alias).
            this._compute.setStorageTexture('outTex', mv);
        }
        this._compute.workerSizeX = Math.ceil(w / 8);
        this._compute.workerSizeY = Math.ceil(h / 8);
        this._compute.workerSizeZ = 1;
        this._lastWorkerW = w;
        this._lastWorkerH = h;
    }

    public execute(ctx: RenderGraphPassContext): void {
        const mv = ctx.getTexture(this._mvHandle);
        // Pool may have handed us a different RenderTexture wrapper
        // (canvas resize → compile re-ran → new bucket entry) or the
        // wrapper's GPUTexture may have been recreated under us. Watch
        // for the identity flip and force re-bind when it happens.
        const dirty = this._watcher.update([{ key: 'mv', tex: mv }]);
        if (dirty) this._compute = null;
        this._ensureCompute(ctx, mv);

        // Capture current viewProj BEFORE updating prev so the first
        // frame uploads the (identity) prev → motion vectors land at 0
        // and there's no first-frame ghosting.
        const camera = ctx.view.camera;
        this._scratch.multiplyMatrices(camera.projectionMatrix, camera.viewMatrix);

        // Upload PREV (the prior frame's viewProj).
        this._mvData!.setMatrix('prevViewProj', this._prevViewProj);
        this._mvData!.apply();

        const gpu = this._ctx.gpuContext;
        const command = gpu.beginCommandEncoder();
        gpu.computeCommand(command, [this._compute!]);
        gpu.endCommandEncoder(command);

        // Roll: this frame's viewProj becomes next frame's prev.
        this._prevViewProj.copy(this._scratch);
        this._currViewProj.copy(this._scratch);
    }
}
