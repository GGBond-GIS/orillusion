import { Texture } from './Texture';
/**
 * @internal
 * @group GFX
 */
export class TextureMipmapGenerator {
    private static mipmapShader = `
        var<private> pos : array<vec2<f32>, 4> = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0));

        struct VertexOutput {
        @builtin(position) position : vec4<f32>,
        @location(0) texCoord : vec2<f32>
        };

        @vertex
        fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
        var output : VertexOutput;
        output.texCoord = pos[vertexIndex] * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);
        output.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        return output;
        }

        @binding(0) @group(0) var imgSampler : sampler;
        @binding(1) @group(0) var img : texture_2d<f32>;

        @fragment
        fn fragmentMain(@location(0) texCoord : vec2<f32>) -> @location(0) vec4<f32> {
        var outColor: vec4<f32> = textureSampleLevel(img, imgSampler, texCoord , 0.0 );
        return outColor;
        }
      `;
    public static getMipmapPipeline(texture: Texture) {
        const ctx = texture._boundCtx!;
        let gpuDevice = ctx.device;
        let cache = ctx.cache(TextureMipmapGenerator, () => ({} as { [key: string]: GPURenderPipeline }));
        let pipeline: GPURenderPipeline = cache[texture.format];
        if (!pipeline) {
            // Create a simple shader that renders a fullscreen textured quad.
            const mipmapShaderModule = gpuDevice.createShaderModule({
                code: TextureMipmapGenerator.mipmapShader,
            });

            let textureLayout = gpuDevice.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        //TODO : After adding a shadow reflection, it is necessary to know that the vertex is used | the segment is used
                        visibility: texture.visibility,
                        // use GPUSamplerBindingLayout = { type:`filtering`} error
                        sampler: texture.samplerBindingLayout,
                    },
                    {
                        binding: 1,
                        //TODO : After adding a shadow reflection, it is necessary to know that the vertex is used | the segment is used
                        visibility: texture.visibility,
                        // use GPUTextureBindingLayout = { sampleType:`float`} error
                        texture: texture.textureBindingLayout,
                    },
                ],
            });

            // Need a separate bind group for each level to ensurev
            // we're only sampling from the previous level.
            let layouts = gpuDevice.createPipelineLayout({
                bindGroupLayouts: [textureLayout],
            });

            pipeline = gpuDevice.createRenderPipeline({
                layout: layouts,
                vertex: {
                    module: mipmapShaderModule,
                    entryPoint: 'vertexMain',
                },
                fragment: {
                    module: mipmapShaderModule,
                    entryPoint: 'fragmentMain',
                    targets: [
                        {
                            format: texture.format, // Make sure to use the same format as the texture
                        },
                    ],
                },
                primitive: {
                    topology: 'triangle-strip',
                    stripIndexFormat: 'uint32',
                },
            });
            cache[texture.format] = pipeline;
        }
        return pipeline;
    }

    // TextureDescriptor should be the descriptor that the texture was created with.
    // This version only works for basic 2D textures.
    public static webGPUGenerateMipmap(texture: Texture) {
        const ctx = texture._boundCtx!;
        let gpuDevice = ctx.device;
        let textureDescriptor = texture.textureDescriptor;
        // let pipeline = TextureMipmapGenerator.pipeline;
        let pipeline = TextureMipmapGenerator.getMipmapPipeline(texture);

        let srcView = texture.getGPUTexture().createView({
            baseMipLevel: 0,
            mipLevelCount: 1,
        });

        // Mipmap gen can fire lazily from a `gpuTexture` getter that happens
        // to resolve in the middle of a main-loop render pass (e.g. a texture
        // materializes inside a bind-group walk). The shared
        // GPUContextInstance.LastCommand encoder would get auto-finished here
        // and the live RenderPassEncoder would then fail its end() with
        // "parent encoder already finished". Use a standalone encoder so
        // mipmap upload is serialized at queue level without touching the
        // in-flight main-loop encoder.
        const commandEncoder = gpuDevice.createCommandEncoder();
        for (let i = 1; i < textureDescriptor.mipLevelCount; ++i) {
            const dstView = texture.getGPUTexture().createView({
                baseMipLevel: i, // Make sure we're getting the right mip level...
                mipLevelCount: 1, // And only selecting one mip level
            });

            const passEncoder = commandEncoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: dstView, // Render pass uses the next mip level as it's render attachment.
                        clearValue: [0, 0, 0, 0],
                        loadOp: `clear`,
                        storeOp: 'store',
                    },
                ],
            });

            let textureLayout = gpuDevice.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        //TODO : After adding a shadow reflection, it is necessary to know that the vertex is used | the segment is used
                        visibility: texture.visibility,
                        // use GPUSamplerBindingLayout = { type:`filtering`} error
                        sampler: texture.samplerBindingLayout,
                    },
                    {
                        binding: 1,
                        //TODO : After adding a shadow reflection, it is necessary to know that the vertex is used | the segment is used
                        visibility: texture.visibility,
                        // use GPUTextureBindingLayout = { sampleType:`float`} error
                        texture: texture.textureBindingLayout,
                    },
                ],
            });

            // Need a separate bind group for each level to ensurev
            // we're only sampling from the previous level.
            const bindGroup = gpuDevice.createBindGroup({
                layout: textureLayout,
                entries: [
                    {
                        binding: 0,
                        resource: texture.gpuSampler,
                    },
                    {
                        binding: 1,
                        resource: srcView,
                    },
                ],
            });

            // Render
            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.draw(4);
            passEncoder.end();

            // The source texture view for the next iteration of the loop is the
            // destination view for this one.
            srcView = dstView;
        }
        gpuDevice.queue.submit([commandEncoder.finish()]);
    }

    public static getMipmapCount(width: number, height: number) {
        let w = width;
        let h = height;
        let maxSize = Math.max(w, h);
        return 1 + Math.log2(maxSize) | 0;
    }

}
