import { GPUCompareFunction, GPUCullMode } from "../../../../../gfx/graphics/webGpu/WebGPUConst";
import { RenderShaderPass } from "../../../../../gfx/graphics/webGpu/shader/RenderShaderPass";
import { Vector3 } from "../../../../../math/Vector3";
import { RegisterShader } from "../../../../../util/SerializeDecoration";
import { Shader } from "../../../../../gfx/graphics/webGpu/shader/Shader";
import { BlendMode } from "../../../../../materials/BlendMode";

/**
 * EarthAtm Shader
 * Renders atmospheric scattering for Earth atmosphere
 * Supports both view from space and view from ground
 * @internal
 */
@RegisterShader
export class EarthAtmShader extends Shader {
    constructor() {
        super();
        let colorShader = new RenderShaderPass('earthatm_vs_wgsl', 'earthatm_fs_wgsl');
        this.addRenderPass(colorShader);

        // Earth parameters (default: Earth-like planet)
        const EARTH_RADIUS = 6371000.0;
        const ATMOSPHERE_HEIGHT = 100000.0;
        
        // earthRadius, atmosphereRadius, sunIntensity, mieG
        colorShader.setUniformFloat(`earthRadius`, EARTH_RADIUS);
        colorShader.setUniformFloat(`atmosphereRadius`, EARTH_RADIUS + ATMOSPHERE_HEIGHT);
        colorShader.setUniformFloat(`sunIntensity`, 30.0);
        colorShader.setUniformFloat(`mieG`, 0.98);
        
        // sunDirectionX, sunDirectionY, sunDirectionZ, exposure
        colorShader.setUniformFloat(`sunDirectionX`, 0.0);
        colorShader.setUniformFloat(`sunDirectionY`, 1.0);
        colorShader.setUniformFloat(`sunDirectionZ`, 0.0);
        colorShader.setUniformFloat(`exposure`, 1.0);
        
        // rayleighCoeffX, rayleighCoeffY, rayleighCoeffZ, mieCoeff
        colorShader.setUniformFloat(`rayleighCoeffX`, 5.5e-6);
        colorShader.setUniformFloat(`rayleighCoeffY`, 13.0e-6);
        colorShader.setUniformFloat(`rayleighCoeffZ`, 22.4e-6);
        colorShader.setUniformFloat(`mieCoeff`, 50e-6);
        
        // rayleighScale, mieScale, earthCenterX, earthCenterY
        colorShader.setUniformFloat(`rayleighScale`, 8000.0);
        colorShader.setUniformFloat(`mieScale`, 1200.0);
        colorShader.setUniformFloat(`earthCenterX`, 0.0);
        colorShader.setUniformFloat(`earthCenterY`, 0.0);
        
        // earthCenterZ, padding1, padding2, padding3
        colorShader.setUniformFloat(`earthCenterZ`, 0.0);
        colorShader.setUniformFloat(`padding1`, 0.0);
        colorShader.setUniformFloat(`padding2`, 0.0);
        colorShader.setUniformFloat(`padding3`, 0.0);

        let shaderState = colorShader.shaderState;
        shaderState.frontFace = `ccw`;
        shaderState.cullMode = GPUCullMode.front;
        shaderState.depthWriteEnabled = false;
        shaderState.depthCompare = GPUCompareFunction.less_equal;
        shaderState.blendMode = BlendMode.ALPHA;
    }
}
