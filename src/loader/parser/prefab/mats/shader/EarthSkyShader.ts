import { GPUCompareFunction, GPUCullMode } from "../../../../../gfx/graphics/webGpu/WebGPUConst";
import { RenderShaderPass } from "../../../../../gfx/graphics/webGpu/shader/RenderShaderPass";
import { Vector3 } from "../../../../../math/Vector3";
import { RegisterShader } from "../../../../../util/SerializeDecoration";
import { Shader } from "../../../../../gfx/graphics/webGpu/shader/Shader";

/**
 * EarthSky Shader
 * Renders backface of a sphere sampling cube texture
 * @internal
 */
@RegisterShader
export class EarthSkyShader extends Shader {
    constructor() {
        super();
        let colorShader = new RenderShaderPass('earthsky_vs_wgsl', 'earthsky_fs_wgsl');
        this.addRenderPass(colorShader);

        colorShader.setUniformFloat(`exposure`, 1.0);
        colorShader.setUniformFloat(`roughness`, 0.0);
        colorShader.setUniformFloat(`yaw`, 0.0);
        colorShader.setUniformFloat(`pitch`, 0.0);

        let shaderState = colorShader.shaderState;
        shaderState.frontFace = `ccw`;
        shaderState.cullMode = GPUCullMode.front;
        shaderState.depthWriteEnabled = true;
        shaderState.depthCompare = GPUCompareFunction.less_equal;
    }
}
