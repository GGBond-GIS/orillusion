import { CEvent } from "../../../../event/CEvent";
import { CEventDispatcher } from "../../../../event/CEventDispatcher";
import { RenderTexture } from "../../../../textures/RenderTexture";
import { bindCtx, Context3D } from "../../../graphics/webGpu/Context3D";
import { GIPass, GIRenderCompleteEvent } from "../../graph/passes/GIPass";

export let IrradianceDataReaderCompleteEvent: CEvent = new CEvent('IrradianceDataReaderCompleteEvent');
/**
 * Reads the DDGI probe irradiance/depth octahedral maps back from the GPU
 * into CPU Float32Arrays. Listens for the {@link GIPass} render-complete
 * event, copies the color and depth textures into mappable buffers, and
 * dispatches {@link IrradianceDataReaderCompleteEvent} once both arrays
 * are populated.
 *
 * @group GFX
 */
export class DDGIIrradianceGPUBufferReader extends CEventDispatcher {
    private readFlag = false;
    private probeRenderer: GIPass;
    private opColorBuffer: GPUBuffer;
    private opDepthBuffer: GPUBuffer;
    private srcColorMap: RenderTexture;
    private srcDepthMap: RenderTexture;

    /** CPU copy of the probe depth octahedral map. */
    public opDepthArray: Float32Array;
    /** CPU copy of the probe irradiance (color) octahedral map. */
    public opColorArray: Float32Array;
    /** Context3D this reader's GPU buffers are bound to. */
    public _boundCtx: Context3D | null = null;

    /** Allocate the readback buffers and subscribe to the GI pass's render-complete event. */
    public initReader(ctx: Context3D, probeRender: GIPass, colorMap: RenderTexture, depthMap: RenderTexture) {
        this.probeRenderer = probeRender;
        this.srcColorMap = colorMap;
        this.srcDepthMap = depthMap;
        let giSetting = ctx.engine!.setting.gi;
        let pixelCount = giSetting.octRTMaxSize * giSetting.octRTMaxSize;

        bindCtx(this, ctx);
        let device = this._boundCtx!.device;

        this.opColorBuffer = device.createBuffer({
            size: pixelCount * 4 * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            mappedAtCreation: false,
        });
        this.opColorArray = new Float32Array(pixelCount * 4);

        this.opDepthBuffer = device.createBuffer({
            size: pixelCount * 4 * 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            mappedAtCreation: false,
        });
        this.opDepthArray = new Float32Array(pixelCount * 4);

        //listener
        this.probeRenderer.addEventListener(
            GIRenderCompleteEvent.type,
            () => {
                this.onProbeRenderComplete();
            },
            this,
        );

    }

    private async onProbeRenderComplete() {
        if (!this.readFlag) {
            this.readFlag = true;
            await this.read(this.srcColorMap.getGPUTexture(), this.opColorBuffer, this.opColorArray);
            await this.read(this.srcDepthMap.getGPUTexture(), this.opDepthBuffer, this.opDepthArray);
            this.readFlag = false;
            this.dispatchEvent(IrradianceDataReaderCompleteEvent);
        }
    }

    private async read(srcTexture: GPUTexture, dstBuffer: GPUBuffer, output: Float32Array) {
        const gpu = this._boundCtx!.gpuContext;
        let command = gpu.beginCommandEncoder();
        command.copyTextureToBuffer({ texture: srcTexture }, { buffer: dstBuffer, bytesPerRow: srcTexture.width * 16 }, [srcTexture.width, srcTexture.height]);
        gpu.endCommandEncoder(command);

        await dstBuffer.mapAsync(GPUMapMode.READ);
        const copyArrayBuffer = dstBuffer.getMappedRange();
        output.set(new Float32Array(copyArrayBuffer), 0);
        dstBuffer.unmap();
    }
}

export let irradianceDataReader: DDGIIrradianceGPUBufferReader = new DDGIIrradianceGPUBufferReader();
