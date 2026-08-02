import { View3D } from '../../../../core/View3D';
import { RenderTexture } from '../../../../textures/RenderTexture';
import { GlobalBindGroup } from '../../../graphics/webGpu/core/bindGroups/GlobalBindGroup';
import { ClusterLightingBuffer } from '../../passRenderer/cluster/ClusterLightingBuffer';
import { PassType } from '../../passRenderer/state/PassType';
import { RendererPassState } from '../../passRenderer/state/RendererPassState';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';
import { BeginPassOptions, RenderGraphRenderTarget } from '../RenderGraphRenderTarget';
import { buildOpBundles, dependOnIfRegistered } from './_helpers';
import { ClusterLightingPass, CLUSTER_LIGHTING_BUFFER } from './ClusterLightingPass';
import { MAIN_COLOR_RT } from './GBufferResourcePass';
import { MAIN_SHADOW_MAP } from './ShadowPass';
import { POINT_SHADOW_CUBE_ARRAY } from './PointShadowPass';
import { REFLECTION_CUBE_MAP } from './ReflectionPass';
import { DDGI_DEPTH_MAP, DDGI_IRRADIANCE_MAP } from './GIPass';
import { drawNodesEncoder, TRANSPARENT_DRAW_CTX, TransparentDrawContext } from './_transparentDraw';

// Re-export the shared draw-context contract through ColorPass so users
// hitting the package barrel (`@orillusion/core`) can resolve
// TRANSPARENT_DRAW_CTX / TransparentDrawContext without reaching into
// the `_transparentDraw` module (which sits beneath a leading-underscore
// filename convention that the public export aggregator skips).
export {
    TRANSPARENT_DRAW_CTX,
    type TransparentDrawContext,
    drawNodes,
    drawSortedTransparent,
    drawTransmissionContinuation,
    type DrawNodesOptions,
    type OitFilter,
    type TransmissionFilter,
} from './_transparentDraw';

/**
 * Published handle names for the main color pass outputs.
 *
 * - `_ColorBuffer`: the final shaded color target (rgba16float,
 *   scene-sized). Post passes read this as their first input.
 * - `_NormalBuffer`: the compressed G-buffer attachment that packs
 *   normal + position + material data (rgba32float). Post passes
 *   that need geometry info (SSR, SSGI, outline) decode it themselves.
 *
 * @group Graph
 */
export const COLOR_BUFFER = '_ColorBuffer';
export const NORMAL_BUFFER = '_NormalBuffer';

/**
 * Main forward color pass. Single responsibility: draw the opaque half
 * of the scene (transmission materials excluded so the
 * {@link SceneColorPyramidPass} snapshot that follows sees the world
 * *behind* the glass, not the glass itself).
 *
 * Sky is rendered separately by {@link SkyPass} — chain it after this
 * pass in the renderer job. Transparent / transmission halves
 * ({@link TransmissionOpaquePass}, {@link SortedTransparentPass})
 * reopen the color attachment with `loadOp='load'` via the shared
 * {@link TRANSPARENT_DRAW_CTX}.
 *
 * The shared g-buffer + render-context plumbing this pass draws into
 * is owned by {@link GBufferResourcePass}. Multiple ColorPass
 * instances can coexist in one graph (e.g. terrain → clear-depth →
 * world) since none of them are the resource creator.
 *
 * @group Graph
 */
export class ColorPass extends RenderGraphPass {
    public readonly name: string = 'ColorPass';

    /** Bound color render target. Encoder opened per frame in
     *  {@link execute} via `target.beginPass(...)`. */
    protected _target!: RenderGraphRenderTarget;
    /** Live {@link RendererPassState} for the in-flight pass — set on
     *  every {@link execute} between begin and end. */
    protected _passState: RendererPassState | null = null;

    protected readonly _passType: PassType = PassType.COLOR;
    protected readonly _giEnabled: boolean;

    constructor(public readonly config: { giEnabled: boolean } = { giEnabled: false }) {
        super();
        this._giEnabled = config.giEnabled;
    }

    public get rendererPassState(): RendererPassState | null {
        return this._passState;
    }

    public setup(b: RenderGraphBuilder): void {
        // borrowRenderTarget (not useRenderTarget): ColorPass deliberately
        // does NOT register a mutator-write on MAIN_COLOR_RT. Subclasses
        // in chained-opaque setups (Globe → ClearDepth → World) would
        // otherwise join the transparent passes' mutator chain by
        // insertedOrder and break the explicit `transparent.dependsOn(world)`
        // edge with a CyclicDependencyError. Ordering between ColorPass /
        // SkyPass / transparent halves is held by the renderer job's add()
        // sequence (insertedOrder Kahn tie-break) — same contract as the
        // pre-refactor design described in the original ColorPass.setup
        // comment.
        this._target = b.borrowRenderTarget(MAIN_COLOR_RT);
        this.declareShadingReads(b);
        this.declareSideEffects(b);
    }

    /** Per-frame loadOp/clearValue options applied when opening the
     *  bound target. Default returns `undefined` so the framework's
     *  auto-derive rule applies. Override to force e.g.
     *  `colorLoadOps:['load']` for a chained opaque pass that draws on
     *  top of a previous half. */
    protected getRenderTargetOptions(): BeginPassOptions | undefined {
        return undefined;
    }

    /** Declare the per-frame shading inputs this pass reads. Override
     *  to add/remove shading deps (e.g. skip shadow read in a depth-only
     *  variant). */
    protected declareShadingReads(b: RenderGraphBuilder): void {
        b.read(CLUSTER_LIGHTING_BUFFER);
        b.read(MAIN_SHADOW_MAP);
        b.read(POINT_SHADOW_CUBE_ARRAY);
        b.read(REFLECTION_CUBE_MAP);
        if (this._giEnabled) {
            b.read(DDGI_IRRADIANCE_MAP);
            b.read(DDGI_DEPTH_MAP);
        }
    }

    /** Declare any non-resource ordering constraints. SceneCapturePass
     *  renders off-screen RTs that this frame's lit materials sample
     *  directly via SceneCaptureCameraComponent (no graph-pool handle).
     *  GPUCullPass (when present) populates the indirect draw buffers
     *  consumed through GlobalBindGroup. Neither flows as a `b.read`, so
     *  we declare the ordering explicitly. */
    protected declareSideEffects(b: RenderGraphBuilder): void {
        dependOnIfRegistered(b, 'SceneCapturePass', 'GPUCullPass');
    }

    public execute(ctx: RenderGraphPassContext): void {
        const view = ctx.view;
        const camera = view.camera;
        const cluster = this._getCluster(view);

        const opened = this._target.beginPass(ctx, this.getRenderTargetOptions() ?? {});
        const { encoder, passState } = opened;
        this._passState = passState;

        // Wire DDGI irradiance through the pool every frame so a future
        // GI swap takes effect on the next frame (edit GIPass →
        // irradiance updates, no restart).
        if (this._giEnabled) {
            const irradianceColor = ctx.get<RenderTexture>(DDGI_IRRADIANCE_MAP);
            const irradianceDepth = ctx.get<RenderTexture>(DDGI_DEPTH_MAP);
            if (irradianceColor && irradianceDepth) {
                passState.irradianceBuffer = [irradianceColor, irradianceDepth];
            }
        }

        GlobalBindGroup.updateCameraGroup(camera);
        passState.camera3D = camera;

        const layered = this.collectLayered(view);

        const opBundles = buildOpBundles(view, camera, this._passType, passState, cluster);

        const gpu = view.engine3D.context3D.gpuContext;

        if (opBundles.length > 0) {
            encoder.executeBundles(opBundles);
        }

        // bindCamera is unconditional: the per-camera bind group must
        // be live at group 0 for any per-node draw below to read
        // camera uniforms, independent of whether the opaque list was
        // empty this frame.
        gpu.bindCamera(encoder, camera);
        if (layered.opaque.length > 0) {
            // Use the encoder-driven draw helper (calls renderPass2,
            // which doesn't engage the splitTexture mid-pass split).
            // Safe for ColorPass because `transmissionFilter='exclude'`
            // already filters out glass / transmission materials —
            // splitTexture is only set on those.
            drawNodesEncoder(
                view,
                encoder,
                passState,
                layered.opaque,
                cluster,
                { transmissionFilter: 'exclude', passType: this._passType },
            );
        }

        this._target.endPass(ctx, opened);
        this._passState = null;
    }

    protected _getCluster(view: View3D): ClusterLightingBuffer | undefined {
        return view.renderGraph?.getPass<ClusterLightingPass>('ClusterLightingPass')?.clusterLightingBuffer;
    }
}
