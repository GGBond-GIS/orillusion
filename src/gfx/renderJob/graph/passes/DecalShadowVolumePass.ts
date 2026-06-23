import { DecalComponent } from '../../../../components/DecalComponent';
import { Matrix4 } from '../../../../math/Matrix4';
import { RenderTexture } from '../../../../textures/RenderTexture';
import { Preprocessor } from '../../../graphics/webGpu/shader/util/Preprocessor';
import { Texture } from '../../../graphics/webGpu/core/texture/Texture';
import { ComponentCollect } from '../../collect/ComponentCollect';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { COLOR_BUFFER } from './ColorPass';
import { MAIN_COLOR_RT } from './GBufferResourcePass';
import { MAIN_DEPTH_TEXTURE } from './PreDepthPass';

/** Format of the color target the composite step blends into — must
 *  match {@link COLOR_BUFFER}'s format declared in ColorPass. */
const COLOR_FORMAT: GPUTextureFormat = 'rgba16float';

/** Format of the pass-owned depth+stencil scratch texture. Stencil is
 *  the Z-fail mark; depth is loaded from `_MainDepthTexture` and used
 *  read-only by the mark pass. */
const DS_FORMAT: GPUTextureFormat = 'depth24plus-stencil8';

/** Per-decal uniform layout (in floats):
 *   - 0..16  vp        : mat4x4f
 *   - 16..32 invVP     : mat4x4f
 *   - 32..48 model     : mat4x4f
 *   - 48..64 invModel  : mat4x4f
 *   - 64..68 tint      : vec4f
 *   - 68..72 params    : vec4f
 *       x = cos(maxAngleDeg), or -2 when disabled
 *       y = camera near (for log-depth inverse)
 *       z = camera far  (for log-depth inverse)
 *       w = unused
 * Total = 288 bytes. */
const UNIFORM_BYTES = 4 * 64 + 16 + 16;
const TMP_UNIFORM_F32 = new Float32Array(UNIFORM_BYTES / 4);

type DecalGpu = {
    uniformBuffer: GPUBuffer;
    textureView: GPUTextureView;
    boundTexture: Texture;
};

/**
 * Projected-decal pass — composites textures from
 * {@link DecalComponent} volumes onto the opaque scene using a
 * stencil shadow-volume algorithm (Carmack's Reverse / Z-fail).
 *
 * Per frame, for every enabled {@link DecalComponent}:
 *   1. **Depth blit** — copy `_MainDepthTexture` into the depth aspect
 *      of a pass-owned `depth24plus-stencil8` scratch texture, clear
 *      stencil to 0.
 *   2. **Stencil mark** — rasterize the decal volume (unit cube,
 *      `cullMode='none'`, depthTest='less', depth write off). On depth
 *      fail, front faces decrement and back faces increment the
 *      stencil. After the draw, `stencil != 0` marks pixels whose
 *      opaque-scene surface is enclosed by the volume.
 *   3. **Composite** — rasterize the back faces of the volume with
 *      depth test disabled, stencil test `not-equal 0`. The FS
 *      reconstructs world position from the scene depth, projects
 *      into decal local space, samples the decal texture, and
 *      alpha-blends into `_ColorBuffer`.
 *
 * Pipeline slot: `_MainDepthTexture` is read, `_ColorBuffer` is
 * written as a mutator. {@link ForwardRendererJob} inserts this pass
 * between `TransmissionOpaquePass` and `SortedTransparentPass` when
 * `setting.render.decals === true`, so decals draw on the opaque
 * scene. Per-mesh occlusion of decals is a composition concern owned
 * by the application — exclude the mesh from `ColorPass.layerMask`
 * and draw it from a user pass placed after this one.
 *
 * The pass bypasses the engine's Material / RenderShaderPass layer
 * because that layer does not currently expose stencil state. It
 * owns its WGSL pipelines, scratch depth-stencil texture, and a
 * per-component uniform-buffer cache keyed by {@link DecalComponent}.
 *
 * @group Graph
 */
export class DecalShadowVolumePass extends RenderGraphPass {
    public readonly name: string = 'DecalShadowVolumePass';

    private _device!: GPUDevice;
    private _useLogDepth: boolean = false;
    private _cubeVB!: GPUBuffer;
    private _cubeIB!: GPUBuffer;
    private _cubeIdxCount!: number;
    private _decalSampler!: GPUSampler;
    private _depthStencilTex: GPUTexture | null = null;
    private _depthStencilSize: [number, number] = [0, 0];

    private _blitPipeline!: GPURenderPipeline;
    private _markPipeline!: GPURenderPipeline;
    private _compositePipeline!: GPURenderPipeline;
    private _blitBGLayout!: GPUBindGroupLayout;
    private _markBGLayout!: GPUBindGroupLayout;
    private _compositeBGLayout!: GPUBindGroupLayout;

    private _decalGpu: WeakMap<DecalComponent, DecalGpu> = new WeakMap();

    // Scratch list reused per-frame to avoid GC churn — populated by
    // ComponentCollect.collectByTypeLayered each execute().
    private _decalScratch: DecalComponent[] = [];

    private _mVP!: Matrix4;
    private _mInvVP!: Matrix4;
    private _mModel!: Matrix4;
    private _mInvModel!: Matrix4;

    public setup(b: RenderGraphBuilder): void {
        this._device = b.context3D.device as GPUDevice;
        this._useLogDepth = !!b.context3D.engine?.setting?.render?.useLogDepth;

        this._mVP = new Matrix4();
        this._mInvVP = new Matrix4();
        this._mModel = new Matrix4();
        this._mInvModel = new Matrix4();

        b.read(MAIN_DEPTH_TEXTURE);
        b.write(COLOR_BUFFER);            // legacy mutator-write
        b.useRenderTarget(MAIN_COLOR_RT); // typed mutator on the main RT
                                          // (execute still drives its own
                                          // multi-sub-pass encoder for the
                                          // blit/mark/composite stencil dance)

        const geo = buildUnitCubeGeometry();
        this._cubeIdxCount = geo.indexCount;
        this._cubeVB = this._device.createBuffer({
            label: 'DecalShadowVolume:CubeVB',
            size: geo.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this._device.queue.writeBuffer(this._cubeVB, 0, geo.vertices);

        this._cubeIB = this._device.createBuffer({
            label: 'DecalShadowVolume:CubeIB',
            size: geo.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        this._device.queue.writeBuffer(this._cubeIB, 0, geo.indices);

        this._decalSampler = this._device.createSampler({
            magFilter: 'linear', minFilter: 'linear',
            addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
        });

        this._createPipelines();
    }

    public destroy(): void {
        this._cubeVB?.destroy();
        this._cubeIB?.destroy();
        this._depthStencilTex?.destroy();
        this._depthStencilTex = null;
    }

    public execute(ctx: RenderGraphPassContext): void {
        const view = ctx.view;
        const camera = view.camera;

        // Per-view collect — the static activeRegistry it replaces was
        // shared across all views, which caused decals owned by one
        // view to be re-projected through every other view's camera.
        // ComponentCollect.componentsByType is keyed by View3D so each
        // pass-execute sees only this view's decals.
        const camMask = camera?.cullingMask ?? 0xFFFFFFFF;
        const mask = (this.layerMask & camMask) >>> 0;
        ComponentCollect.collectByTypeLayered<DecalComponent>(view, DecalComponent, mask, this._decalScratch);
        if (this._decalScratch.length === 0) return;

        const engine = view.engine3D;
        const device = this._device;
        const gpu = engine.context3D.gpuContext;

        const colorTex = ctx.get<RenderTexture>(COLOR_BUFFER);
        const sceneDepthTex = ctx.get<RenderTexture>(MAIN_DEPTH_TEXTURE);
        if (!colorTex || !sceneDepthTex) return;

        const [W, H] = engine.context3D.presentationSize as [number, number];
        const dsTex = this._ensureDepthStencil(W, H);
        const dsView = dsTex.createView({ aspect: 'all' });

        const sceneDepthView = sceneDepthTex.getGPUView() as GPUTextureView;
        const colorView = (colorTex.getGPUTexture() as GPUTexture).createView();

        const vp = this._mVP.multiplyMatrices(camera.projectionMatrix, camera.viewMatrix);
        const invVP = this._mInvVP.copy(vp);
        invVP.invert();
        const near = camera.near;
        const far = camera.far;

        const command = gpu.beginCommandEncoder();

        // Pass A: copy scene depth into the depth aspect of our scratch,
        // clear stencil to 0.
        {
            const blitBG = device.createBindGroup({
                layout: this._blitBGLayout,
                entries: [{ binding: 0, resource: sceneDepthView }],
            });
            const enc = command.beginRenderPass({
                label: 'DecalShadowVolume:DepthBlit',
                colorAttachments: [],
                depthStencilAttachment: {
                    view: dsView,
                    depthLoadOp: 'clear', depthClearValue: 1.0, depthStoreOp: 'store',
                    stencilLoadOp: 'clear', stencilClearValue: 0, stencilStoreOp: 'store',
                },
            });
            enc.setPipeline(this._blitPipeline);
            enc.setBindGroup(0, blitBG);
            enc.draw(3);
            enc.end();
        }

        // Per-decal: mark + composite. Each iteration clears stencil
        // first so decals don't interfere.
        let drawIdx = 0;
        for (const decal of this._decalScratch) {
            if (!decal.texture) continue;
            if (!decal.transform || !decal.transform.enable) continue;
            const gpuRes = this._updateDecalUniform(decal, vp, invVP, near, far);
            if (!gpuRes) continue;
            const label = decal.object3D?.name || `#${drawIdx++}`;

            {
                const bg = device.createBindGroup({
                    layout: this._markBGLayout,
                    entries: [{ binding: 0, resource: { buffer: gpuRes.uniformBuffer } }],
                });
                const enc = command.beginRenderPass({
                    label: `DecalShadowVolume:Mark[${label}]`,
                    colorAttachments: [],
                    depthStencilAttachment: {
                        view: dsView,
                        depthLoadOp: 'load', depthStoreOp: 'store',
                        stencilLoadOp: 'clear', stencilClearValue: 0, stencilStoreOp: 'store',
                    },
                });
                enc.setPipeline(this._markPipeline);
                enc.setBindGroup(0, bg);
                enc.setVertexBuffer(0, this._cubeVB);
                enc.setIndexBuffer(this._cubeIB, 'uint16');
                enc.setStencilReference(0);
                enc.drawIndexed(this._cubeIdxCount);
                enc.end();
            }

            // depthReadOnly/stencilReadOnly: WebGPU requires loadOp/storeOp
            // to be omitted on read-only aspects.
            {
                const bg = device.createBindGroup({
                    layout: this._compositeBGLayout,
                    entries: [
                        { binding: 0, resource: { buffer: gpuRes.uniformBuffer } },
                        { binding: 1, resource: sceneDepthView },
                        { binding: 2, resource: gpuRes.textureView },
                        { binding: 3, resource: this._decalSampler },
                    ],
                });
                const enc = command.beginRenderPass({
                    label: `DecalShadowVolume:Composite[${label}]`,
                    colorAttachments: [{
                        view: colorView,
                        loadOp: 'load', storeOp: 'store',
                    }],
                    depthStencilAttachment: {
                        view: dsView,
                        depthReadOnly: true,
                        stencilReadOnly: true,
                    },
                });
                enc.setPipeline(this._compositePipeline);
                enc.setBindGroup(0, bg);
                enc.setVertexBuffer(0, this._cubeVB);
                enc.setIndexBuffer(this._cubeIB, 'uint16');
                enc.setStencilReference(0);
                enc.drawIndexed(this._cubeIdxCount);
                enc.end();
            }
        }

        gpu.endCommandEncoder(command);
    }

    private _ensureDepthStencil(w: number, h: number): GPUTexture {
        if (this._depthStencilTex
            && this._depthStencilSize[0] === w
            && this._depthStencilSize[1] === h) {
            return this._depthStencilTex;
        }
        this._depthStencilTex?.destroy();
        this._depthStencilTex = this._device.createTexture({
            label: 'DecalShadowVolume:DS',
            size: [w, h, 1],
            format: DS_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this._depthStencilSize = [w, h];
        return this._depthStencilTex;
    }

    private _updateDecalUniform(decal: DecalComponent, vp: Matrix4, invVP: Matrix4, near: number, far: number): DecalGpu | null {
        const tex = decal.texture;
        if (!tex) return null;

        const m = this._mModel.copy(decal.transform.worldMatrix);
        const invM = this._mInvModel.copy(m);
        invM.invert();

        let gpuRes = this._decalGpu.get(decal);
        if (gpuRes && gpuRes.boundTexture !== tex) {
            gpuRes.textureView = tex.getGPUView() as GPUTextureView;
            gpuRes.boundTexture = tex;
        }
        if (!gpuRes) {
            const uniformBuffer = this._device.createBuffer({
                label: 'DecalShadowVolume:Uniform',
                size: UNIFORM_BYTES,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            gpuRes = {
                uniformBuffer,
                textureView: tex.getGPUView() as GPUTextureView,
                boundTexture: tex,
            };
            this._decalGpu.set(decal, gpuRes);
        }

        const cpu = TMP_UNIFORM_F32;
        cpu.set(vp.rawData, 0);
        cpu.set(invVP.rawData, 16);
        cpu.set(m.rawData, 32);
        cpu.set(invM.rawData, 48);
        cpu[64] = decal.tint.r; cpu[65] = decal.tint.g; cpu[66] = decal.tint.b; cpu[67] = decal.tint.a;
        // maxAngleDeg >= 90 → write -2 so `dot < params.x` in the FS is
        // never true. Avoids the cos(π/2) ≈ 6e-17 edge that produces
        // speckled drop-outs on near-perpendicular faces.
        cpu[68] = decal.maxAngleDeg >= 89.99
            ? -2.0
            : Math.cos(decal.maxAngleDeg * Math.PI / 180);
        cpu[69] = near;
        cpu[70] = far;
        cpu[71] = 0;
        this._device.queue.writeBuffer(gpuRes.uniformBuffer, 0, cpu.buffer, cpu.byteOffset, UNIFORM_BYTES);

        return gpuRes;
    }

    private _createPipelines(): void {
        const device = this._device;

        // Reuse the engine's macro preprocessor so this pass tracks the
        // same depth-encoding flags as RenderShaderPass-managed shaders.
        // BLIT is depth-only and ignores logdepth, but running it through
        // the preprocessor keeps a single code path.
        const defines = {
            USE_LOGDEPTH: this._useLogDepth,
        };
        const blitCode = Preprocessor.parse(BLIT_WGSL, defines);
        const markCode = Preprocessor.parse(MARK_WGSL, defines);
        const compositeCode = Preprocessor.parse(COMPOSITE_WGSL, defines);

        // A. Depth blit
        this._blitBGLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
            ],
        });
        const blitShader = device.createShaderModule({ code: blitCode });
        this._blitPipeline = device.createRenderPipeline({
            label: 'DecalShadowVolume:BlitPipeline',
            layout: device.createPipelineLayout({ bindGroupLayouts: [this._blitBGLayout] }),
            vertex: { module: blitShader, entryPoint: 'vs' },
            fragment: { module: blitShader, entryPoint: 'fs', targets: [] },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: {
                format: DS_FORMAT,
                depthCompare: 'always',
                depthWriteEnabled: true,
            },
        });

        // B. Stencil mark
        this._markBGLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
            ],
        });
        const markShader = device.createShaderModule({ code: markCode });
        this._markPipeline = device.createRenderPipeline({
            label: 'DecalShadowVolume:MarkPipeline',
            layout: device.createPipelineLayout({ bindGroupLayouts: [this._markBGLayout] }),
            vertex: {
                module: markShader, entryPoint: 'vs',
                buffers: [{
                    arrayStride: 12,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
                }],
            },
            fragment: { module: markShader, entryPoint: 'fs', targets: [] },
            // cullMode='none' so both stencilFront / stencilBack are hit.
            primitive: { topology: 'triangle-list', cullMode: 'none', frontFace: 'ccw' },
            depthStencil: {
                format: DS_FORMAT,
                depthCompare: 'less',
                depthWriteEnabled: false,
                stencilReadMask: 0xFF,
                stencilWriteMask: 0xFF,
                stencilFront: {
                    compare: 'always',
                    failOp: 'keep',
                    depthFailOp: 'decrement-wrap',
                    passOp: 'keep',
                },
                stencilBack: {
                    compare: 'always',
                    failOp: 'keep',
                    depthFailOp: 'increment-wrap',
                    passOp: 'keep',
                },
            },
        });

        // C. Composite
        this._compositeBGLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
            ],
        });
        const compositeShader = device.createShaderModule({ code: compositeCode });
        this._compositePipeline = device.createRenderPipeline({
            label: 'DecalShadowVolume:CompositePipeline',
            layout: device.createPipelineLayout({ bindGroupLayouts: [this._compositeBGLayout] }),
            vertex: {
                module: compositeShader, entryPoint: 'vs',
                buffers: [{
                    arrayStride: 12,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
                }],
            },
            fragment: {
                module: compositeShader, entryPoint: 'fs',
                targets: [{
                    format: COLOR_FORMAT,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    },
                    writeMask: GPUColorWrite.ALL,
                }],
            },
            // Back-face draw so the screen region is still covered when
            // the camera is inside the volume.
            primitive: { topology: 'triangle-list', cullMode: 'front', frontFace: 'ccw' },
            depthStencil: {
                format: DS_FORMAT,
                depthCompare: 'always',
                depthWriteEnabled: false,
                stencilReadMask: 0xFF,
                stencilWriteMask: 0x00,
                stencilFront: { compare: 'not-equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
                stencilBack: { compare: 'not-equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
            },
        });
    }
}

// Unit cube — 8 vertices, 12 triangles, |xyz| ≤ 0.5. Decal scale stretches
// it into the actual volume size.
function buildUnitCubeGeometry() {
    const vertices = new Float32Array([
        -0.5, -0.5, -0.5,
        0.5, -0.5, -0.5,
        0.5, 0.5, -0.5,
        -0.5, 0.5, -0.5,
        -0.5, -0.5, 0.5,
        0.5, -0.5, 0.5,
        0.5, 0.5, 0.5,
        -0.5, 0.5, 0.5,
    ]);
    const indices = new Uint16Array([
        0, 2, 1, 0, 3, 2,
        4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4,
        3, 6, 2, 3, 7, 6,
        1, 2, 6, 1, 6, 5,
        0, 4, 7, 0, 7, 3,
    ]);
    return { vertices, indices, indexCount: indices.length };
}

const BLIT_WGSL = /* wgsl */`
@group(0) @binding(0) var srcDepth: texture_depth_2d;

struct VOut {
    @builtin(position) pos: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) idx: u32) -> VOut {
    var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
    var out: VOut;
    out.pos = vec4f(p[idx], 0.0, 1.0);
    return out;
}

@fragment
fn fs(in: VOut) -> @builtin(frag_depth) f32 {
    let coord = vec2i(i32(in.pos.x), i32(in.pos.y));
    return textureLoad(srcDepth, coord, 0);
}
`;

const MARK_WGSL = /* wgsl */`
struct Uniforms {
    vp:       mat4x4f,
    invVP:    mat4x4f,
    model:    mat4x4f,
    invModel: mat4x4f,
    tint:     vec4f,
    params:   vec4f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@location(0) pos: vec3f) -> @builtin(position) vec4f {
    var clipPos = u.vp * (u.model * vec4f(pos, 1.0));
    #if USE_LOGDEPTH
        // Match the engine's log-z encoding (MathShader::log2Depth01):
        //   ndc.z = log2(1 + w) / log2(far + 1),  w = clip.w.
        // Same value the Common_frag FS writes into _MainDepthTexture,
        // so depthCompare='less' on the stencil mark is comparing apples
        // to apples.
        let far = u.params.z;
        let ndcZ = log2(max(1e-6, 1.0 + clipPos.w)) / log2(far + 1.0);
        clipPos.z = ndcZ * clipPos.w;
    #endif
    return clipPos;
}

@fragment
fn fs() {
    // No color output — fixed-function stencil updates only.
}
`;

const COMPOSITE_WGSL = /* wgsl */`
struct Uniforms {
    vp:       mat4x4f,
    invVP:    mat4x4f,
    model:    mat4x4f,
    invModel: mat4x4f,
    tint:     vec4f,
    params:   vec4f,
};

@group(0) @binding(0) var<uniform>      u:           Uniforms;
@group(0) @binding(1) var               sceneDepth:  texture_depth_2d;
@group(0) @binding(2) var               decalTex:    texture_2d<f32>;
@group(0) @binding(3) var               decalSamp:   sampler;

struct VOut {
    @builtin(position) pos: vec4f,
};

@vertex
fn vs(@location(0) pos: vec3f) -> VOut {
    var out: VOut;
    var clipPos = u.vp * (u.model * vec4f(pos, 1.0));
    #if USE_LOGDEPTH
        // Same encoding as MARK_WGSL — keeps the composite quad's depth
        // test (when one exists) in lock-step with _MainDepthTexture.
        let far = u.params.z;
        let ndcZ = log2(max(1e-6, 1.0 + clipPos.w)) / log2(far + 1.0);
        clipPos.z = ndcZ * clipPos.w;
    #endif
    out.pos = clipPos;
    return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
    let dim   = textureDimensions(sceneDepth);
    let pixel = vec2i(i32(in.pos.x), i32(in.pos.y));
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= i32(dim.x) || pixel.y >= i32(dim.y)) {
        discard;
    }
    let rawDepth = textureLoad(sceneDepth, pixel, 0);

    #if USE_LOGDEPTH
        // _MainDepthTexture stores ndc.z = log2(1+w) / log2(far+1) where
        // w = view-space distance — the encoding shared by VertexFunction_vert
        // (log2Depth) and Common_frag (log2DepthFixPersp); see also
        // GBufferStand::inverseLog2Depth which inverts the same curve for
        // gBuffer.x. Recover w, then re-project to the standard perspective
        // ndc.z so invVP rebuilds world position the same way as the
        // no-logdepth path.
        let near = u.params.y;
        let far  = u.params.z;
        let w    = pow(far + 1.0, rawDepth) - 1.0;
        let depth = (far / (far - near)) * (1.0 - near / max(w, 1e-6));
    #else
        let depth = rawDepth;
    #endif

    let uvScreen = (vec2f(in.pos.xy) + vec2f(0.5)) / vec2f(dim);
    let ndc = vec4f(uvScreen.x * 2.0 - 1.0, 1.0 - uvScreen.y * 2.0, depth, 1.0);
    let worldH = u.invVP * ndc;
    let world  = worldH.xyz / worldH.w;

    let localH = u.invModel * vec4f(world, 1.0);
    let local  = localH.xyz;
    if (abs(local.x) > 0.5 || abs(local.y) > 0.5 || abs(local.z) > 0.5) {
        discard;
    }

    let uv = vec2f(local.x + 0.5, 1.0 - (local.z + 0.5));
    let texCol = textureSample(decalTex, decalSamp, uv);

    let edgeFade = 1.0 - smoothstep(0.35, 0.5, abs(local.y));

    let rgb = texCol.rgb * u.tint.rgb;
    let a   = texCol.a * u.tint.a * edgeFade;
    return vec4f(rgb * a, a);
}
`;
