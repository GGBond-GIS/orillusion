import { RenderTexture } from "../../..";
import { Context3D } from "../../graphics/webGpu/Context3D";
import { GPUTextureFormat } from "../../graphics/webGpu/WebGPUConst";
import { RTDescriptor } from "../../graphics/webGpu/descriptor/RTDescriptor";
import { RTFrame } from "./RTFrame";

/**
 * G-buffer {@link RTFrame} used when rendering reflection / GI probes.
 * Allocates position, normal and color attachments (all rgba16float)
 * plus a depth texture, with `load` op so probe faces accumulate rather
 * than clear.
 *
 * @group GFX
 */
export class ProbeGBufferFrame extends RTFrame {

    constructor(rtWidth: number, rtHeight: number, autoResize: boolean = true, ctx?: Context3D) {
        super([], []);
        this.crateGBuffer(rtWidth, rtHeight, autoResize, ctx);
    }

    /** Allocate the probe G-buffer's position/normal/color attachments and depth texture. */
    crateGBuffer(rtWidth: number, rtHeight: number, autoResize: boolean, ctx?: Context3D) {
        let attachments = this.renderTargets;
        let rtDescriptors = this.rtDescriptors;
        let positionMap = new RenderTexture(rtWidth, rtHeight, GPUTextureFormat.rgba16float, false, undefined, 1, 0, true, autoResize, ctx);
        positionMap.name = `positionMap`;
        let posDec = new RTDescriptor();
        posDec.loadOp = `load`;

        let normalMap = new RenderTexture(rtWidth, rtHeight, GPUTextureFormat.rgba16float, false, undefined, 1, 0, true, autoResize, ctx);
        normalMap.name = `normalMap`;
        let normalDec = new RTDescriptor();
        normalDec.loadOp = `load`;

        let colorMap = new RenderTexture(rtWidth, rtHeight, GPUTextureFormat.rgba16float, false, undefined, 1, 0, true, autoResize, ctx);
        colorMap.name = `colorMap`;
        let colorDec = new RTDescriptor();
        colorDec.loadOp = `load`;

        let depthTexture = new RenderTexture(rtWidth, rtHeight, GPUTextureFormat.depth32float, false, undefined, 1, 0, true, autoResize, ctx);
        depthTexture.name = `depthTexture`;
        let depthDec = new RTDescriptor();
        depthDec.loadOp = `load`;

        attachments.push(positionMap);
        attachments.push(normalMap);
        attachments.push(colorMap);

        rtDescriptors.push(posDec);
        rtDescriptors.push(normalDec);
        rtDescriptors.push(colorDec);

        this.depthTexture = depthTexture;
    }
}