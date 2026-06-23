// Fullscreen-quad swapchain blit. Used by passes that need to copy a
// scene texture to the canvas — currently {@link GUIPass} at the tail
// of the graph. Free functions instead of methods on PostPass so the
// final present step doesn't depend on PostPass being in the graph.

import { View3D } from '../../../../core/View3D';
import { ViewQuad } from '../../../../core/ViewQuad';
import { Context3D } from '../../../graphics/webGpu/Context3D';
import { Texture } from '../../../graphics/webGpu/core/texture/Texture';
import { RTFrame } from '../../frame/RTFrame';

/** Build a fullscreen quad bound to `Quad_vert_wgsl` /
 *  `Quad_frag_wgsl` — the present blit shaders registered in
 *  `ShaderLib` at engine init. The returned quad has no RT
 *  attachments because the swapchain view is acquired per-frame from
 *  `Context3D.context.getCurrentTexture()`. */
export function createPresentQuad(ctx: Context3D): ViewQuad {
    return new ViewQuad(ctx, `Quad_vert_wgsl`, `Quad_frag_wgsl`, new RTFrame([], []), 0, false);
}

/** Copy `texture` to the swapchain via the present quad. Issues its
 *  own command encoder begin/end. */
export function presentTexture(view: View3D, quad: ViewQuad, texture: Texture): void {
    const gpu = view.engine3D.context3D.gpuContext;
    const command = gpu.beginCommandEncoder();
    quad.renderToViewQuad(view, quad, command, texture);
    gpu.endCommandEncoder(command);
}
