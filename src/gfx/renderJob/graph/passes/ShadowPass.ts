import { DirectLight } from '../../../../components/lights/DirectLight';
import { RenderNode } from '../../../../components/renderer/RenderNode';
import { Camera3D } from '../../../../core/Camera3D';
import { View3D } from '../../../../core/View3D';
import { Vector3 } from '../../../../math/Vector3';
import { Depth2DTextureArray } from '../../../../textures/Depth2DTextureArray';
import { VirtualTexture } from '../../../../textures/VirtualTexture';
import { Time } from '../../../../util/Time';
import { Reference } from '../../../../util/Reference';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { GPUTextureFormat } from '../../../graphics/webGpu/WebGPUConst';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { Texture } from '../../../graphics/webGpu/core/texture/Texture';
import { WebGPUDescriptorCreator } from '../../../graphics/webGpu/descriptor/WebGPUDescriptorCreator';
import { EntityCollect } from '../../collect/EntityCollect';
import { ShadowLightsCollect } from '../../collect/ShadowLightsCollect';
import { RTFrame } from '../../frame/RTFrame';
import { OcclusionSystem } from '../../occlusion/OcclusionSystem';
import { PassType } from '../../passRenderer/state/PassType';
import { RendererPassState } from '../../passRenderer/state/RendererPassState';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { buildOpBundles, buildTrBundles, dependOnIfRegistered, preInitPassPipelines } from './_helpers';

/**
 * Published handle name for the directional-light shadow map array.
 * `_MainShadowMap` is the CSM cascade array texture. Each cascade
 * occupies one slice (0..maxCascades-1), successive directional
 * lights use subsequent slice ranges up to `shadow.maxShadowMapNum`.
 *
 * @group Graph
 */
export const MAIN_SHADOW_MAP = '_MainShadowMap';

type ShadowKind = 'all' | 'static' | 'dynamic';

/**
 * Directional + cascade shadow map renderer. Owns the shadow array
 * texture and per-slot pass states; the CSM cascade loop and
 * static/dynamic split stay internal to this pass — splitting them
 * into N graph nodes would explode the DAG (4 cascades × 8 lights ×
 * static/dynamic = 64 nodes) without scheduling benefit.
 *
 * @group Graph
 */
export class ShadowPass extends RenderGraphPass {
    public readonly name = 'ShadowPass';

    public depth2DArrayTexture!: Depth2DTextureArray;
    public shadowPassCount: number = 0;

    protected readonly _passType: PassType = PassType.SHADOW;
    protected readonly _rendererPassStates: RendererPassState[] = [];
    protected _activeRendererPassState: RendererPassState | null = null;

    // Static-cache infra — allocated lazily when
    // setting.shadow.enableStaticCache is true and first frame hits the
    // static-cache code path.
    protected _staticCacheReady = false;
    protected _staticDepthTextures: VirtualTexture[] = [];
    protected _staticPassStates: RendererPassState[] = [];
    protected _dynamicPassStates: RendererPassState[] = [];
    protected _staticDirtyLayers: boolean[] = [];
    protected _forceUpdate = false;

    protected _debugProbeDone = false;
    protected readonly _shadowPos = new Vector3();
    protected readonly _shadowCameraTarget = new Vector3();

    public setup(b: RenderGraphBuilder): void {
        const ctx = b.context3D;
        const shadow = ctx.engine!.setting.shadow;
        const w = shadow.maxShadowMapWidth;
        const h = shadow.maxShadowMapHeight;
        const maxShadowMapNum = shadow.maxShadowMapNum;
        this.depth2DArrayTexture = new Depth2DTextureArray(w, h, GPUTextureFormat.depth32float, maxShadowMapNum, ctx);
        Reference.getInstance().attached(this.depth2DArrayTexture, this);

        for (let i = 0; i < maxShadowMapNum; i++) {
            const rtFrame = new RTFrame([], []);
            const tex = new VirtualTexture(w, h, GPUTextureFormat.depth32float, false, undefined, 1, 0, 1, ctx);
            tex.name = `shadowDepthTexture_${i}`;
            rtFrame.depthTexture = tex;
            rtFrame.label = 'shadowRender';
            rtFrame.customSize = true;
            rtFrame.depthCleanValue = 1;
            this._rendererPassStates[i] = WebGPUDescriptorCreator.createRendererPassState(ctx, rtFrame);
        }

        b.write(MAIN_SHADOW_MAP, () => this.depth2DArrayTexture);

        dependOnIfRegistered(b, 'GPUCullPass');
    }

    /** External API: mark a static-cache layer dirty. */
    public markStaticShadowDirty(shadowIndex: number = -1): void {
        if (!this._staticCacheReady) return;
        if (shadowIndex < 0) {
            for (let i = 0; i < this._staticDirtyLayers.length; i++) this._staticDirtyLayers[i] = true;
        } else if (shadowIndex < this._staticDirtyLayers.length) {
            this._staticDirtyLayers[shadowIndex] = true;
        }
    }

    public execute(ctx: RenderGraphPassContext): void {
        ShadowLightsCollect.update(ctx.view);
        this._render(ctx.view, ctx.occlusion);
    }

    protected _render(view: View3D, occlusion: OcclusionSystem): void {
        const shadowSetting = view.engine3D.setting.shadow;
        if (!shadowSetting.enable) return;
        void this._debugProbeShadowMap(view);

        const camera = view.camera;
        const scene = view.scene;
        this.shadowPassCount = 0;
        if (!shadowSetting.needUpdate) return;
        if (Time.frame % shadowSetting.updateFrameRate !== 0) return;

        const shadowLightList = ShadowLightsCollect.getDirectShadowLightWhichScene(scene);
        let sizeW = shadowSetting.shadowSize;
        let sizeH = shadowSetting.shadowSize;

        for (const light of shadowLightList) {
            const dirLight = light as DirectLight;
            const shadowIndex = dirLight.shadowIndex;
            this._activeRendererPassState = this._rendererPassStates[shadowIndex];
            sizeW = this._activeRendererPassState.depthTexture.width;
            sizeH = this._activeRendererPassState.depthTexture.height;

            // Pre-init pass to ensure shaders compile before first draw.
            preInitPassPipelines(view, this._passType, this._activeRendererPassState);

            const useStaticCache = shadowSetting.enableStaticCache === true;
            const autoOrDirty = (dirLight.castShadow && dirLight.needUpdateShadow || this._forceUpdate)
                || (dirLight.castShadow && shadowSetting.autoUpdate);

            if (useStaticCache && dirLight.castShadow) {
                this._ensureStaticCache(view.engine3D.context3D, sizeW, sizeH);
                if (dirLight.needUpdateShadow || this._forceUpdate) {
                    if (dirLight.enableCSM) {
                        for (let csm = 0; csm < dirLight.cascadeNum; csm++) {
                            this._staticDirtyLayers[shadowIndex + csm] = true;
                        }
                    } else {
                        this._staticDirtyLayers[shadowIndex] = true;
                    }
                    dirLight.needUpdateShadow = false;
                }

                if (dirLight.enableCSM) {
                    dirLight.updateShadowCameraCSM(view.camera);
                    dirLight.lightData.csmShadowMapIndex = shadowIndex;
                    for (let csm = 0; csm < dirLight.cascadeNum; csm++) {
                        const layer = shadowIndex + csm;
                        const shadowCamera = dirLight.csmShadowCamera[csm];
                        (shadowCamera as any)._boundCtx ||= view.engine3D.context3D;
                        this._renderLayerSplit(view, shadowCamera, occlusion, layer, sizeW, sizeH);
                    }
                } else {
                    const extents = camera.getShadowWorldExtents();
                    this._poseShadowCamera(dirLight, camera, dirLight.direction, dirLight.shadowCamera, extents, camera.lookTarget);
                    this._renderLayerSplit(view, dirLight.shadowCamera, occlusion, shadowIndex, sizeW, sizeH);
                }
            } else if (autoOrDirty) {
                dirLight.needUpdateShadow = false;
                if (dirLight.enableCSM) {
                    dirLight.updateShadowCameraCSM(view.camera);
                    dirLight.lightData.csmShadowMapIndex = shadowIndex;
                    for (let csm = 0; csm < dirLight.cascadeNum; csm++) {
                        const layer = shadowIndex + csm;
                        this._activeRendererPassState = this._rendererPassStates[layer];
                        const shadowCamera = dirLight.csmShadowCamera[csm];
                        (shadowCamera as any)._boundCtx ||= view.engine3D.context3D;
                        this._renderShadow(view, shadowCamera, occlusion, this._activeRendererPassState);
                        this._copyDepthTexture(view, this._activeRendererPassState.depthTexture, this.depth2DArrayTexture, layer, sizeW, sizeH);
                    }
                } else {
                    const extents = camera.getShadowWorldExtents();
                    this._activeRendererPassState = this._rendererPassStates[shadowIndex];
                    this._poseShadowCamera(dirLight, camera, dirLight.direction, dirLight.shadowCamera, extents, camera.lookTarget);
                    this._renderShadow(view, dirLight.shadowCamera, occlusion, this._activeRendererPassState);
                    this._copyDepthTexture(view, this._activeRendererPassState.depthTexture, this.depth2DArrayTexture, shadowIndex, sizeW, sizeH);
                }
            }
        }

        this._forceUpdate = false;
    }

    protected _ensureStaticCache(ctx: Context3D, w: number, h: number): void {
        if (this._staticCacheReady) return;
        const maxShadowMapNum = ctx.engine!.setting.shadow.maxShadowMapNum;
        this._staticDirtyLayers = new Array(maxShadowMapNum).fill(true);
        for (let i = 0; i < maxShadowMapNum; i++) {
            const staticTex = new VirtualTexture(w, h, GPUTextureFormat.depth32float, false, undefined, 1, 0, 1, ctx);
            staticTex.name = `shadowStaticCache_${i}`;
            this._staticDepthTextures[i] = staticTex;

            const rtStatic = new RTFrame([], []);
            rtStatic.depthTexture = staticTex;
            rtStatic.label = 'shadowStaticRebuild';
            rtStatic.customSize = true;
            rtStatic.depthCleanValue = 1;
            rtStatic.depthLoadOp = 'clear';
            this._staticPassStates[i] = WebGPUDescriptorCreator.createRendererPassState(ctx, rtStatic);

            const rtDynamic = new RTFrame([], []);
            rtDynamic.depthTexture = this._rendererPassStates[i].depthTexture;
            rtDynamic.label = 'shadowDynamicAppend';
            rtDynamic.customSize = true;
            rtDynamic.depthCleanValue = 1;
            rtDynamic.depthLoadOp = 'load';
            this._dynamicPassStates[i] = WebGPUDescriptorCreator.createRendererPassState(ctx, rtDynamic);
        }
        this._staticCacheReady = true;
    }

    protected _renderLayerSplit(view: View3D, shadowCamera: Camera3D, occlusion: OcclusionSystem, layer: number, w: number, h: number): void {
        if (this._staticDirtyLayers[layer]) {
            this._activeRendererPassState = this._staticPassStates[layer];
            this._renderShadow(view, shadowCamera, occlusion, this._activeRendererPassState, 'static');
            this._staticDirtyLayers[layer] = false;
        }
        this._copyDepthTexture(view, this._staticDepthTextures[layer], this._rendererPassStates[layer].depthTexture, 0, w, h);
        this._activeRendererPassState = this._dynamicPassStates[layer];
        this._renderShadow(view, shadowCamera, occlusion, this._activeRendererPassState, 'dynamic');
        this._copyDepthTexture(view, this._rendererPassStates[layer].depthTexture, this.depth2DArrayTexture, layer, w, h);
    }

    protected _renderShadow(view: View3D, shadowCamera: Camera3D, occlusion: OcclusionSystem, state: RendererPassState, kind: ShadowKind = 'all'): void {
        (shadowCamera as any)._boundCtx ||= view.engine3D.context3D;
        const gpu = view.engine3D.context3D.gpuContext;
        // Pass-side layer mask + shadow-camera's own cullingMask filter
        // which renderers cast into this shadow map. Default
        // layerMask=All keeps the old "every node casts shadow" path.
        const layered = this.collectLayered(view, shadowCamera);
        const command = gpu.beginCommandEncoder();
        const encoder = gpu.beginRenderPass(command, state);

        shadowCamera.transform.updateWorldMatrix();
        if (OcclusionSystem.enable) {
            occlusion.update(shadowCamera, view.scene);
            // Build a transient CollectInfo for the occlusion API; the
            // body of OcclusionSystem.collect is currently a no-op so
            // shape only has to satisfy the type.
            const localInfo = EntityCollect.instance.getRenderNodes(view.scene, shadowCamera);
            occlusion.collect(localInfo, shadowCamera);
        }
        GlobalBindGroup.updateCameraGroup(shadowCamera);
        gpu.bindCamera(encoder, shadowCamera);

        if (kind === 'all') {
            const opBundles = buildOpBundles(view, shadowCamera, this._passType, state, undefined, true);
            const trBundles = buildTrBundles(view, shadowCamera, this._passType, state, undefined, true);
            if (opBundles.length > 0) encoder.executeBundles(opBundles);
            this._drawShadowNodes(view, shadowCamera, encoder, layered.opaque, kind);
            if (trBundles.length > 0) encoder.executeBundles(trBundles);
            this._drawShadowNodes(view, shadowCamera, encoder, layered.transparent, kind);
        } else {
            this._drawShadowNodes(view, shadowCamera, encoder, layered.opaque, kind);
            this._drawShadowNodes(view, shadowCamera, encoder, layered.transparent, kind);
        }

        gpu.endPass(encoder);
        gpu.endCommandEncoder(command);
    }

    protected _drawShadowNodes(view: View3D, shadowCamera: Camera3D, encoder: GPURenderPassEncoder, nodes: RenderNode[], kind: ShadowKind): void {
        if (!nodes) return;
        GlobalBindGroup.updateCameraGroup(shadowCamera);
        view.engine3D.context3D.gpuContext.bindCamera(encoder, shadowCamera);
        const render = view.engine3D.setting.render;
        const max = Math.min(nodes.length, render.drawOpMax);
        for (let i = render.drawOpMin; i < max; ++i) {
            const node = nodes[i];
            if (!node.transform.enable) continue;
            if (!node.enable) continue;
            if (!node.castShadow) continue;
            if (node.isDestroyed) continue;
            // 'auto' defaults to dynamic so untagged renderers keep
            // every-frame behaviour.
            if (kind === 'static') {
                if (node.shadowCacheMode !== 'static') continue;
            } else if (kind === 'dynamic') {
                if (node.shadowCacheMode === 'static') continue;
            }
            if (!node.preInit(this._passType)) {
                node.nodeUpdate(view, this._passType, this._activeRendererPassState!, undefined);
            }
            node.renderPass2(view, this._passType, this._activeRendererPassState!, undefined, encoder);
        }
    }

    protected _copyDepthTexture(view: View3D, src: Texture, dst: Texture, dstIndex: number, w: number, h: number): void {
        const gpu = view.engine3D.context3D.gpuContext;
        const cmd = gpu.beginCommandEncoder();
        cmd.copyTextureToTexture(
            { texture: src.getGPUTexture(), mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
            { texture: dst.getGPUTexture(), mipLevel: 0, origin: { x: 0, y: 0, z: dstIndex } },
            { width: w, height: h, depthOrArrayLayers: 1 },
        );
        gpu.endCommandEncoder(cmd);
    }

    protected _poseShadowCamera(dirLight: DirectLight, viewCamera: Camera3D, direction: Vector3, shadowCamera: Camera3D, _extents: number, _lookAt: Vector3): void {
        this._shadowPos.copy(dirLight.transform.worldPosition);
        this._shadowCameraTarget.copy(direction).normalize(viewCamera.far);
        Vector3.add(this._shadowCameraTarget, this._shadowPos, this._shadowCameraTarget);
        shadowCamera.transform.lookAt(this._shadowPos, this._shadowCameraTarget);
        shadowCamera.orthoOffCenter(shadowCamera.left, shadowCamera.right, shadowCamera.bottom, shadowCamera.top, shadowCamera.near, shadowCamera.far);
    }

    /** One-shot diagnostic: probes the first shadow VirtualTexture
     *  after frame 60 to confirm whether the shadow pass actually
     *  writes anything (or whether the depth attachment stays at its
     *  clear value). Mac Metal vs Windows Dawn D3D12 sometimes
     *  diverge here. Remove once the gap is understood. */
    protected async _debugProbeShadowMap(view: View3D): Promise<void> {
        if (this._debugProbeDone || Time.frame < 60) return;
        const ps = this._rendererPassStates[0];
        const tex: any = ps?.depthTexture;
        if (!tex) return;
        this._debugProbeDone = true;
        try {
            const ctx = view.engine3D.context3D;
            const device: GPUDevice = ctx.device;
            const gpu = ctx.gpuContext;
            const w = tex.width, h = tex.height;
            const bytesPerRow = Math.ceil((w * 4) / 256) * 256;
            const buf = device.createBuffer({
                size: bytesPerRow * h,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const cmd = gpu.beginCommandEncoder();
            cmd.copyTextureToBuffer(
                { texture: tex.getGPUTexture(), aspect: 'depth-only' },
                { buffer: buf, bytesPerRow, rowsPerImage: h },
                { width: w, height: h, depthOrArrayLayers: 1 },
            );
            gpu.endCommandEncoder(cmd);
            await buf.mapAsync(GPUMapMode.READ);
            const copy = new Float32Array(buf.getMappedRange().slice(0));
            buf.unmap();
            buf.destroy();
            let mn = Infinity, mx = -Infinity, sum = 0, nonOneCount = 0;
            const stride = bytesPerRow / 4;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const d = copy[y * stride + x];
                    if (d < mn) mn = d;
                    if (d > mx) mx = d;
                    sum += d;
                    if (d < 0.9999) nonOneCount++;
                }
            }
            const total = w * h;
            const mean = sum / total;
            // if (import.meta.env.DEV) console.log(
            //     `[ShadowMapDebug] directional shadow VirtualTexture readback: ` +
            //     `size=${w}x${h}  min=${mn.toFixed(5)}  max=${mx.toFixed(5)}  ` +
            //     `mean=${mean.toFixed(5)}  non-1.0-texels=${nonOneCount}/${total} (${(100 * nonOneCount / total).toFixed(2)}%)`,
            // );
        } catch (e: any) {
            console.log('[ShadowMapDebug] readback failed:', e?.message ?? e);
            this._debugProbeDone = false;
        }
    }
}
