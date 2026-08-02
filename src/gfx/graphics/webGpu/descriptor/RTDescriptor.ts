/**
 * Describes the load/store operations and clear value for a render target attachment.
 * @group GFX
 */
export class RTDescriptor {
    /** Store operation applied at the end of the render pass. */
    public storeOp: string = 'store';
    /** Load operation applied at the start of the render pass. */
    public loadOp: GPULoadOp = `clear`;
    /** Clear color used when the load operation is `clear`. */
    public clearValue: GPUColor = [0, 0, 0, 0];
}