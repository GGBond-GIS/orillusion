
import { RenderTexture } from "../../../textures/RenderTexture";
import { Context3D } from "../../graphics/webGpu/Context3D";
import { GPUTextureFormat } from "../../graphics/webGpu/WebGPUConst";
import { RTDescriptor } from "../../graphics/webGpu/descriptor/RTDescriptor";
import { RTResourceConfig } from "../config/RTResourceConfig";
import { RTFrame } from "./RTFrame";
import { RTResourceMap } from "./RTResourceMap";

/**
 * A G-buffer {@link RTFrame}: a color attachment plus a packed/compressed
 * G-buffer attachment and a matching depth (or depth+stencil) texture.
 * Instances are cached per Context3D and per string key via
 * {@link getGBufferFrame}, so passes that name the same key share one
 * G-buffer within an engine without leaking across engines.
 *
 * @group GFX
 */
export class GBufferFrame extends RTFrame {
    /** Shared key for the main color-pass G-buffer. */
    public static colorPass_GBuffer: string = "ColorPassGBuffer";
    /** Shared key for the reflection-probe G-buffer. */
    public static reflections_GBuffer: string = "reflections_GBuffer";
    /** Cache of G-buffers for the most recently queried context (see {@link getGBufferFrame}). */
    public static gBufferMap: Map<string, GBufferFrame> = new Map<string, GBufferFrame>();
    private static _perContext: WeakMap<Context3D, Map<string, GBufferFrame>> = new WeakMap();

    private static _mapFor(ctx: Context3D): Map<string, GBufferFrame> {
        let m = GBufferFrame._perContext.get(ctx);
        if (!m) {
            m = new Map<string, GBufferFrame>();
            GBufferFrame._perContext.set(ctx, m);
        }
        return m;
    }
    // public static bufferTexture: boolean = false;

    private _colorBufferTex: RenderTexture;
    private _compressGBufferTex: RenderTexture;

    constructor() {
        super([], []);
    }

    /**
     * Allocate this G-buffer's attachments and depth texture. Optionally
     * creates the color attachment (`outColor`), always creates the
     * compressed G-buffer attachment, and creates a depth (or
     * depth+stencil) texture unless `depthTexture` is supplied. `sampleCount`
     * is captured on the frame so the render pass state can pick up the MSAA
     * sample count without re-reading the engine setting.
     */
    createGBuffer(ctx: Context3D, key: string, rtWidth: number, rtHeight: number, _autoResize: boolean = true, outColor: boolean = true, depthTexture?: RenderTexture, sampleCount: number = 0) {
        let attachments = this.renderTargets;
        let reDescriptors = this.rtDescriptors;
        this.sampleCount = sampleCount;
        if (outColor) {
            let colorDec = new RTDescriptor();
            colorDec.loadOp = 'clear';
            // Color buffer is the "primary" attachment and is always
            // created as a non-MSAA single-sample texture; when MSAA is
            // enabled the render pass allocates a side-band multisample
            // texture in WebGPUDescriptorCreator and resolves into this
            // one so downstream post passes sample a normal 2D texture.
            this._colorBufferTex = RTResourceMap.createRTTexture(ctx, key + RTResourceConfig.colorBufferTex_NAME, rtWidth, rtHeight, GPUTextureFormat.rgba16float, true);
            attachments.push(this._colorBufferTex);
            reDescriptors.push(colorDec);
        }

        this._compressGBufferTex = new RenderTexture(rtWidth, rtHeight, GPUTextureFormat.rgba32float, false, undefined, 1, 0, true, true, ctx);
        attachments.push(this._compressGBufferTex);

        if (depthTexture) {
            this.depthTexture = depthTexture;
        } else {
            // Depth attachment must match the color attachments' sample
            // count when MSAA is enabled — WebGPU validates them together.
            // `useStencil` swaps in a combined depth+stencil format so
            // material-level stencil state is actually validated by the
            // pipeline; otherwise the cheaper depth-only format wins.
            const depthFormat = ctx.engine?.setting.render.useStencil
                ? GPUTextureFormat.depth24plus_stencil8
                : GPUTextureFormat.depth32float;
            this.depthTexture = new RenderTexture(rtWidth, rtHeight, depthFormat, false, undefined, 1, sampleCount, true, true, ctx);
            this.depthTexture.name = key + `_depthTexture`;
        }

        let compressGBufferRTDes: RTDescriptor;
        compressGBufferRTDes = new RTDescriptor();

        reDescriptors.push(compressGBufferRTDes);
    }

    /** The world-position attachment (render target index 1). */
    public getPositionMap() {
        return this.renderTargets[1];
    }

    /** The world-normal attachment (render target index 2). */
    public getNormalMap() {
        return this.renderTargets[2];
    }

    /** The scene color attachment, or undefined when created with `outColor=false`. */
    public getColorTexture() {
        return this._colorBufferTex;
    }

    /** The packed/compressed G-buffer attachment. */
    public getCompressGBufferTexture() {
        return this._compressGBufferTex;
    }

    /**
     * @internal
     */
    public static getGBufferFrame(key: string, ctx: Context3D, fixedWidth: number = 0, fixedHeight: number = 0, outColor: boolean = true, depthTexture?: RenderTexture, sampleCount: number = 0): GBufferFrame {
        let map = GBufferFrame._mapFor(ctx);
        GBufferFrame.gBufferMap = map;
        let gBuffer: GBufferFrame;
        if (!map.has(key)) {
            gBuffer = new GBufferFrame();
            let size = ctx.presentationSize;
            gBuffer.createGBuffer(
                ctx,
                key,
                fixedWidth == 0 ? size[0] : fixedWidth,
                fixedHeight == 0 ? size[1] : fixedHeight,
                fixedWidth != 0 && fixedHeight != 0,
                outColor,
                depthTexture,
                sampleCount
            );
            map.set(key, gBuffer);
        } else {
            gBuffer = map.get(key);
        }
        return gBuffer;
    }


    /** Create a new GBufferFrame sharing this frame's attachment/descriptor setup. */
    public clone() {
        let gBufferFrame = new GBufferFrame();
        this.clone2Frame(gBufferFrame);
        return gBufferFrame;
    }
}