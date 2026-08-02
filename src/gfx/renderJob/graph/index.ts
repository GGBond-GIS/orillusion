export {
    RenderGraphPass,
    type RenderGraphPassContext,
    type RenderGraphBuilder,
} from './RenderGraphPass';
export { RenderGraphResourcePool, type ResourceKind } from './RenderGraphResourcePool';
export type { SizeSpec, AccessHint, TextureDesc, BufferDesc } from './transient/ResourceDesc';
export type { TextureHandle, BufferHandle } from './transient/ResourceHandle';
export {
    TransientResourceRegistry,
    type TransientResourceKind,
    type TransientResourceDeclaration,
} from './transient/TransientResourceRegistry';
export {
    LifetimeAnalyzer,
    resolveSizeSpec,
    type ResourceLifetime,
} from './transient/LifetimeAnalyzer';
export {
    TransientTexturePool,
    computeBucketKey,
    estimateTextureBytes,
    type PooledTexture,
    type TransientTextureAssignment,
} from './transient/TransientTexturePool';
export {
    TransientBufferPool,
    roundUpToPow2,
    type PooledBuffer,
    type TransientBufferAssignment,
} from './transient/TransientBufferPool';
export { TextureIdentityWatcher, type WatchedTexture } from './transient/TextureIdentityWatcher';
export {
    GraphCompileError,
    CyclicDependencyError,
    UnresolvedResourceError,
    MissingCreatorError,
    DuplicateCreatorError,
    WrongResourceKindError,
    GraphValidator,
    topoSort,
} from './GraphValidator';
export { RenderGraph } from './RenderGraph';
export {
    RenderGraphRenderTarget,
    type RenderGraphRenderTargetDesc,
    type RTColorAttachmentDesc,
    type RTDepthAttachmentDesc,
    type BeginPassOptions,
    type OpenedRenderPass,
} from './RenderGraphRenderTarget';
export {
    RenderGraphRenderPass,
    type RenderPipelineDesc,
    type RenderDrawCall,
} from './RenderGraphRenderPass';
export {
    RenderGraphComputePass,
    type ComputePipelineDesc,
    type ComputeDispatchCall,
} from './RenderGraphComputePass';
export { ClusterLightingPass, CLUSTER_LIGHTING_BUFFER } from './passes/ClusterLightingPass';
export { PreDepthPass, MAIN_DEPTH_TEXTURE, Z_BUFFER_TEXTURE, PRE_DEPTH_RT } from './passes/PreDepthPass';
export { ShadowPass, MAIN_SHADOW_MAP } from './passes/ShadowPass';
export { PointShadowPass, POINT_SHADOW_CUBE_ARRAY } from './passes/PointShadowPass';
export { ReflectionPass, REFLECTION_CUBE_MAP } from './passes/ReflectionPass';
export { GIPass, DDGI_IRRADIANCE_MAP, DDGI_DEPTH_MAP } from './passes/GIPass';
export { ColorPass, COLOR_BUFFER, NORMAL_BUFFER } from './passes/ColorPass';
export { GBufferResourcePass, MAIN_COLOR_RT } from './passes/GBufferResourcePass';
export { SkyPass } from './passes/SkyPass';
export { ClearDepthPass, type ClearDepthPassConfig } from './passes/ClearDepthPass';
export {
    TRANSPARENT_DRAW_CTX,
    type TransparentDrawContext,
    drawNodes,
    drawNodesEncoder,
    drawSortedTransparent,
    drawTransmissionContinuation,
    type DrawNodesOptions,
    type OitFilter,
    type TransmissionFilter,
} from './passes/_transparentDraw';
export { PostPass, FINAL_COLOR } from './passes/PostPass';
export { GUIPass, CANVAS_TEXTURE } from './passes/GUIPass';
