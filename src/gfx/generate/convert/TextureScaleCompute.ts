import { ComputeShader, textureCompress } from "../../..";
import { Texture } from "../../graphics/webGpu/core/texture/Texture";

/**
 * Builds a compute shader that scales/compresses a set of input textures into output textures.
 * @group GFX
 */
export class TextureScaleCompute {

    /**
     * The underlying compute shader created from the input/output textures.
     */
    public computeShader: ComputeShader;

    /**
     * Configure the compute shader inputs and outputs.
     * @param colorMap optional color map sampled by the shader
     * @param inputs source textures bound as sampled textures
     * @param outputs destination textures bound as storage textures
     */
    public setInputes(colorMap: Texture, inputs: Texture[], outputs: Texture[]) {
        this.computeShader = new ComputeShader(textureCompress(colorMap, inputs, outputs, 8, 8, 1));
        for (let i = 0; i < inputs.length; i++) {
            this.computeShader.setSamplerTexture(`source${i}Map`, inputs[i]);
        }
        for (let i = 0; i < outputs.length; i++) {
            this.computeShader.setStorageTexture(`dest${i}Map`, outputs[i]);
        }

        if (colorMap) {
            this.computeShader.setSamplerTexture(`colorMap`, colorMap);
        }

        this.computeShader.workerSizeX = outputs[0].width / 8;
        this.computeShader.workerSizeY = outputs[0].height / 8;
        this.computeShader.workerSizeZ = 1;
    }


}