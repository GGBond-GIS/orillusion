import { Texture } from '../../graphics/webGpu/core/texture/Texture';

import { TextureCubeUtils } from './TextureCubeUtils';
import { IBLEnvMapCreator_cs } from '../../../assets/shader/compute/IBLEnvMapCreator_cs';

/**
 * @internal
 */
export class IBLEnvMapCreator {
    static importantSample(image: { width: number; height: number; erpTexture: Texture }, dstSize: number, roughness: number, dstView: GPUTextureView): void {
        const ctx = image.erpTexture._boundCtx!;
        const device = ctx.device;
        const gpu = ctx.gpuContext;
        const state = ctx.cache(IBLEnvMapCreator, () => ({
            configBuffer: null as GPUBuffer,
            quaternionBuffer: null as GPUBuffer,
            blurSettingBuffer: null as GPUBuffer,
            pipeline: null as GPUComputePipeline,
            quaternionUploaded: false,
        }));

        if (state.pipeline == null) {
            state.pipeline = device.createComputePipeline({
                layout: `auto`,
                compute: {
                    module: device.createShaderModule({
                        code: IBLEnvMapCreator_cs,
                    }),
                    entryPoint: 'main',
                },
            });
        }
        const computePipeline = state.pipeline;

        //config
        const configStride = 4 * 4; //4 float
        state.configBuffer ||= device.createBuffer({
            size: configStride,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(state.configBuffer, 0, new Uint32Array([image.width, image.height, dstSize, dstSize]));

        const quaternionSize = 4 * 6; ////xyzw * float
        //quaternion
        if (!state.quaternionBuffer) {
            state.quaternionBuffer = device.createBuffer({
                size: quaternionSize * 4 * 6,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            let qArray = new Float32Array(4 * 6);
            for (let i = 0; i < 6; i++) {
                let q = TextureCubeUtils.getRotationToFace(i);
                qArray[i * 4 + 0] = q.x;
                qArray[i * 4 + 1] = q.y;
                qArray[i * 4 + 2] = q.z;
                qArray[i * 4 + 3] = q.w;
            }
            device.queue.writeBuffer(state.quaternionBuffer, 0, qArray);
        }

        //roughness
        state.blurSettingBuffer ||= device.createBuffer({
            size: configStride,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(state.blurSettingBuffer, 0, new Float32Array([roughness, 0, 0, 0]));

        //image
        const inputImageBuffer = image.erpTexture;

        let entries0 = [
            {
                binding: 0,
                resource: {
                    buffer: state.configBuffer,
                    size: 4 * 4,
                },
            },
            {
                binding: 1,
                resource: {
                    buffer: state.quaternionBuffer,
                    size: quaternionSize * 4,
                },
            },
            {
                binding: 2,
                resource: inputImageBuffer.gpuSampler,
            },
            {
                binding: 3,
                resource: inputImageBuffer.getGPUView(),
            },
        ];

        let entries1 = [
            {
                binding: 0,
                resource: {
                    buffer: state.blurSettingBuffer,
                    size: 4 * 4,
                },
            },
            {
                binding: 1,
                resource: dstView,
            },
        ];

        const computeBindGroup0 = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: entries0,
        });

        const computeBindGroup1 = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(1),
            entries: entries1,
        });

        const commandEncoder = gpu.beginCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, computeBindGroup0);
        computePass.setBindGroup(1, computeBindGroup1);
        computePass.dispatchWorkgroups(dstSize / 8, dstSize / 8, 6);

        computePass.end();
        gpu.endCommandEncoder(commandEncoder);
    }
}
