import { RenderTexture } from "../../../textures/RenderTexture";
import { RTDescriptor } from "../../graphics/webGpu/descriptor/RTDescriptor";

/**
 * A render-target frame: the set of color attachments (with their
 * per-attachment {@link RTDescriptor}s) plus the depth/z textures and
 * depth load behaviour that define one render pass's output. Subclasses
 * such as {@link GBufferFrame} and {@link ProbeGBufferFrame} populate
 * specific attachment layouts.
 *
 * @group GFX
 */
export class RTFrame {
    /** Optional debug label for this frame. */
    public label: string;
    /** When true the attachments are a fixed custom size rather than tracking the canvas. */
    public customSize: boolean = false;
    /** The color attachments rendered into by this frame. */
    public renderTargets: RenderTexture[];
    /** Per-attachment load/store/clear descriptors, parallel to {@link renderTargets}. */
    public rtDescriptors: RTDescriptor[];

    /** Optional z-prepass depth texture sampled by this frame. */
    public zPreTexture: RenderTexture;
    /** The depth (or depth+stencil) attachment for this frame. */
    public depthTexture: RenderTexture;

    /** Array-layer / face index of the depth view to attach. */
    public depthViewIndex: number = 0;
    /** Clear value used when the depth load op is `clear`. */
    public depthCleanValue: number = 1;
    /** Load op for the depth attachment (`clear` by default). */
    public depthLoadOp: GPULoadOp = `clear`;
    /** Whether this frame writes the final output target (vs. an intermediate). */
    public isOutTarget: boolean = true;
    /** MSAA sample count — 0 disables MSAA (default). When non-zero,
     *  {@link WebGPUDescriptorCreator} allocates side-band multisample
     *  textures and flags the pass state so pipelines compile with the
     *  matching sample count. */
    public sampleCount: number = 0;

    constructor(attachments: RenderTexture[], rtDescriptors: RTDescriptor[], depthTexture?: RenderTexture, zPreTexture?: RenderTexture, isOutTarget: boolean = true) {
        this.renderTargets = attachments;
        this.rtDescriptors = rtDescriptors;
        this.depthTexture = depthTexture;
        this.zPreTexture = zPreTexture;
        this.isOutTarget = isOutTarget;
    }

    /** Copy this frame's attachments, descriptors and depth/z textures into `rtFrame`. */
    public clone2Frame(rtFrame: RTFrame) {
        rtFrame.renderTargets.push(...this.renderTargets.concat());
        for (let i = 0; i < this.rtDescriptors.length; i++) {
            const des = this.rtDescriptors[i];
            let rtDes = new RTDescriptor();
            rtDes.loadOp = des.loadOp;
            rtDes.storeOp = des.storeOp;
            rtDes.clearValue = des.clearValue;
            rtFrame.rtDescriptors.push(rtDes);
        }
        rtFrame.depthTexture = this.depthTexture;
        rtFrame.zPreTexture = this.zPreTexture;
        rtFrame.customSize = this.customSize;
    }

    /** Return a new RTFrame copied from this one via {@link clone2Frame}. */
    public clone() {
        let rtFrame = new RTFrame([], []);
        this.clone2Frame(rtFrame);
        return rtFrame;
    }
}