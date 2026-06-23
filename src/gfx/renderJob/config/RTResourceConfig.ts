/**
 * Canonical string keys for the engine's well-known render-target
 * textures (G-buffer attachments, z-buffers, the post output target).
 * Used as lookup names in {@link RTResourceMap} so passes and materials
 * refer to the same RT by a stable identifier.
 *
 * @group GFX
 */
export class RTResourceConfig {
    /** Key for the packed/compressed G-buffer texture. */
    public static compressGBufferTex_NAME: string = 'compressGBufferTex_NAME';
    /** Key for the scene color attachment. */
    public static colorBufferTex_NAME: string = 'colorBufferTex';
    /** Key for the world-position G-buffer attachment. */
    public static positionBufferTex_NAME: string = 'positionBufferTex';
    /** Key for the world-normal G-buffer attachment. */
    public static normalBufferTex_NAME: string = 'normalBufferTex';
    /** Key for the material-parameter G-buffer attachment. */
    public static materialBufferTex_NAME: string = 'materialBufferTex';
    /** Key for the main depth (z) buffer texture. */
    public static zBufferTexture_NAME: string = 'zBufferTexture';
    /** Key for the z-prepass depth texture. */
    public static zPreDepthTexture_NAME: string = 'zPreDepthTexture';
    /** Key for the post-processing output texture. */
    public static outTex_NAME: string = 'outTex';
}
