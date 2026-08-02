import { Engine3D } from "../../../../Engine3D";
import { Camera3D } from "../../../../core/Camera3D";

import { RenderTexture } from "../../../../textures/RenderTexture";
import { Context3D } from "../../../graphics/webGpu/Context3D";
import { Texture } from "../../../graphics/webGpu/core/texture/Texture";
import { RTDescriptor } from "../../../graphics/webGpu/descriptor/RTDescriptor";
import { RTFrame } from "../../frame/RTFrame";

/**
 * @internal
 */
export class RendererPassState {

    public label: string = "";
    public customSize: boolean = false;
    public zPreTexture: RenderTexture = null;
    public depthTexture: RenderTexture = null;
    public renderTargetTextures: GPUColorTargetState[];
    public outColor: number = -1;
    public renderTargets: Texture[];
    public rtTextureDescriptors: RTDescriptor[];
    public irradianceBuffer: Texture[];
    public multisample: number = 0;
    public multiTexture: GPUTexture;
    /** Per-color-attachment MSAA side-band textures, populated by
     *  {@link WebGPUDescriptorCreator} when `multisample > 0` and the
     *  pass has multiple color attachments. Index matches `renderTargets`.
     *  Unused entries stay undefined so begin-pass can distinguish. */
    public multiTextures: GPUTexture[];
    public depthViewIndex: number = 0;
    public depthCleanValue: number = 0;
    public isOutTarget: boolean = true;
    public camera3D: Camera3D;
    public rtFrame: RTFrame;
    public renderPassDescriptor: GPURenderPassDescriptor;
    public renderBundleEncoderDescriptor: GPURenderBundleEncoderDescriptor;
    public depthLoadOp: GPULoadOp;
    /** Monotonically increasing counter. Bumped by
     *  WebGPUDescriptorCreator whenever the owning pass descriptor
     *  or bundle descriptor is built / rebuilt. Consumers (render
     *  bundle caches) use it as part of the composite cache key so
     *  bundles from a stale state are not reused. */
    public stateVersion: number = 0;

    getLastRenderTexture(ctx?: Context3D) {
        if (this.renderTargets) {
            return this.renderTargets.length > 0 ? this.renderTargets[0] : Engine3D.resFor(ctx).redTexture;
        } else {
            return Engine3D.resFor(ctx).redTexture
        }
    }
}
