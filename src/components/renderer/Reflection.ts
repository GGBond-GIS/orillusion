
import { View3D } from '../../core/View3D';
import { BoundingBox } from '../../core/bound/BoundingBox';
import { EntityCollect } from '../../gfx/renderJob/collect/EntityCollect';
import { ClusterLightingBuffer } from '../../gfx/renderJob/passRenderer/cluster/ClusterLightingBuffer';
import { RendererMask } from '../../gfx/renderJob/passRenderer/state/RendererMask';
import { RendererPassState } from '../../gfx/renderJob/passRenderer/state/RendererPassState';
import { PassType } from '../../gfx/renderJob/passRenderer/state/PassType';
import { Vector3 } from '../../math/Vector3';
import { RenderNode } from './RenderNode';
import { mergeFunctions } from '../../util/Global';

/**
 * Reflection probe render node. Captures the surrounding scene into a
 * reflection G-Buffer so reflective materials can sample real-time
 * environment reflections.
 * @group Components
 */
export class Reflection extends RenderNode {
    /** Global reflection probe id assigned by the reflection system. */
    public gid: number = 0;
    /** Whether this probe needs to be re-captured on the next frame. */
    public needUpdate: boolean = true;
    /** When true, the probe re-captures automatically every frame. */
    public autoUpdate: boolean = false;
    /** Radius of the probe's influence volume. */
    public radius: number = 500;
    /** Initialize the reflection mask, bounds and position-change tracking. */
    public init(): void {
        super.init();
        this.addRendererMask(RendererMask.Reflection);
        this.alwaysRender = true;
        this.object3D.bound = new BoundingBox(Vector3.ZERO.clone(), Vector3.MAX);

        mergeFunctions(this.transform.onPositionChange, () => {
            this.needUpdate = true;
        });
    }

    /** Register this probe as a render node when enabled. */
    public onEnable(): void {
        EntityCollect.instance.addRenderNode(this.transform.scene3D, this);
    }

    /** Unregister this probe from the render node list when disabled. */
    public onDisable(): void {
        EntityCollect.instance.removeRenderNode(this.transform.scene3D, this);
    }

    public renderPass2(view: View3D, passType: PassType, rendererPassState: RendererPassState, clusterLightingBuffer: ClusterLightingBuffer, encoder: GPURenderPassEncoder, useBundle: boolean = false) {
        super.renderPass2(view, passType, rendererPassState, clusterLightingBuffer, encoder, useBundle);
    }

}
