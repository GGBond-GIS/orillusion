import { RenderTexture } from '../../../../textures/RenderTexture';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { TextureMipmapGenerator } from '../../../graphics/webGpu/core/texture/TextureMipmapGenerator';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { TextureHandle } from '../transient/ResourceHandle';
import { TextureIdentityWatcher } from '../transient/TextureIdentityWatcher';
import { COLOR_BUFFER } from './ColorPass';

/**
 * Published handle name for the scene color snapshot produced after
 * opaque rendering finishes and before transparent rendering begins.
 * Transmission materials (glass / water / clear plastic) sample this
 * texture through a fragment shader refraction term — see
 * `KHR_materials_transmission` + `Transmission_frag.ts`.
 *
 * The pyramid carries a full mip chain so frosted-glass / rough-glass
 * transmission can sample blurred levels via `textureSampleLevel`.
 * Mip 0 is the raw `_ColorBuffer` copy; mips 1..N are progressively
 * downsampled box filters generated each frame after the copy via
 * {@link TextureMipmapGenerator}. PBRLitShader's transmission block
 * picks an LOD from `roughness` so polished glass reads from mip 0
 * (sharp refraction) and frosted glass reads from a higher LOD
 * (blurred backdrop) — the standard roughness-aware transmission
 * sampling path.
 *
 * @group Graph
 */
export const SCENE_COLOR_PYRAMID = '_SceneColorPyramid';

/**
 * Frame Graph feature that snapshots `_ColorBuffer` between
 * `ColorPass` (opaque-only, via `maskTr=true`) and
 * `SortedTransparentPass` (transparent-only, via `maskOp=true`) so
 * transmission materials sample the opaque-world backdrop without
 * seeing other transparents.
 *
 * Phase-3 migration: declares the pyramid as a transient texture with
 * `aliasable: false` (mip-chain bind-group caches require stable
 * `GPUTexture` identity across compiles) and `publishToLegacyMap: true`
 * so {@link LitMaterial.transmissionFactor} and related callers that
 * still read through `RTResourceMap.getTexture(ctx, '_SceneColorPyramid')`
 * keep finding the right wrapper. The transient pool sizes the
 * texture against `ctx.presentationSize` (which tracks the
 * `_ColorBuffer` size in lockstep), and the
 * {@link TextureIdentityWatcher} forces a mip-chain refresh when the
 * canvas-resize-driven re-allocation hands us a fresh GPUTexture.
 *
 * @group Graph
 */
export class SceneColorPyramidPass extends RenderGraphPass {
    public readonly name = 'SceneColorPyramidPass';

    protected _ctx!: Context3D;
    protected _handle!: TextureHandle;
    protected readonly _watcher: TextureIdentityWatcher = new TextureIdentityWatcher();

    public setup(b: RenderGraphBuilder): void {
        this._ctx = b.context3D;
        b.read(COLOR_BUFFER);
        // Pool wrapper carries the full mip chain — RenderTexture's
        // current resize() path forces mipLevelCount=1, so the pool
        // also patches the GPUTextureDescriptor.mipLevelCount after
        // construction (see TransientTexturePool._allocateSlot). Phase 4
        // will fix that at the RenderTexture level and let us drop the
        // pool-side patch.
        const [w, h] = this._ctx.presentationSize;
        const mips = this._mipCountFor(w, h);
        this._handle = b.declareTexture(SCENE_COLOR_PYRAMID, {
            format: GPUTextureFormat.rgba16float,
            width: 'screen', height: 'screen',
            mipLevelCount: mips,
            aliasable: false,
            publishToLegacyMap: true,
            // Explicit usage — TextureMipmapGenerator.webGPUGenerateMipmap
            // (called in execute() below to refresh mips 1..N) opens a
            // render pass per mip with the mip as colorAttachment[0],
            // which requires RENDER_ATTACHMENT. Hint-derived usage
            // ('sample' → TEXTURE_BINDING + COPY) misses this bit, so
            // the mipgen pass throws a usage-mismatch validation error.
            // Bits:
            //   RENDER_ATTACHMENT — mipgen blits per mip
            //   TEXTURE_BINDING   — transmission samplers
            //   COPY_DST          — mip-0 copyTextureToTexture from _ColorBuffer
            //   COPY_SRC          — dev-time debug captures
            usage: GPUTextureUsage.RENDER_ATTACHMENT
                 | GPUTextureUsage.TEXTURE_BINDING
                 | GPUTextureUsage.COPY_SRC
                 | GPUTextureUsage.COPY_DST,
            label: SCENE_COLOR_PYRAMID,
        });
        b.write(this._handle, 'sample');
    }

    protected _mipCountFor(w: number, h: number): number {
        return Math.floor(Math.log2(Math.max(w, h))) + 1;
    }

    public execute(ctx: RenderGraphPassContext): void {
        const colorBuffer = ctx.get<RenderTexture>(COLOR_BUFFER);
        if (!colorBuffer) return;
        const pyramid = ctx.getTexture(this._handle);
        // Pool-driven identity change (canvas resize ⇒ next compile
        // re-allocates a fresh wrapper). The watcher fires once per
        // such swap so mip-chain consumers know to drop cached views.
        this._watcher.update([{ key: 'pyramid', tex: pyramid }]);
        const gpu = ctx.view.engine3D.context3D.gpuContext;
        const command = gpu.beginCommandEncoder();
        // Copy mip 0 from the live color buffer.
        command.copyTextureToTexture(
            { texture: colorBuffer.getGPUTexture(), mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
            { texture: pyramid.getGPUTexture(), mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
            { width: colorBuffer.width, height: colorBuffer.height, depthOrArrayLayers: 1 },
        );
        gpu.endCommandEncoder(command);
        // Refresh mips 1..N. webGPUGenerateMipmap submits its own
        // command encoder (it has to — running inside the live one
        // would auto-finish the main loop's encoder mid-frame and
        // explode the next end-pass).
        TextureMipmapGenerator.webGPUGenerateMipmap(pyramid);
    }
}
