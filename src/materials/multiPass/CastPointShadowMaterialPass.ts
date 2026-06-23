import { GPUCullMode } from "../../gfx/graphics/webGpu/WebGPUConst";
import { RenderShaderPass } from "../../gfx/graphics/webGpu/shader/RenderShaderPass";
import { PassType } from "../../gfx/renderJob/passRenderer/state/PassType";
import { Vector3 } from "../../math/Vector3";

/**
 * @internal
 * CastPointShadowMaterialPass
 */
export class CastPointShadowMaterialPass extends RenderShaderPass {
    constructor() {
        super(`castPointShadowMap_vert`, `shadowCastMap_frag`);
        this.passType = PassType.POINT_SHADOW;
        this.setShaderEntry("main", "main");
        this.setUniformFloat("cameraFar", 5000);
        this.setUniformVector3("lightWorldPos", Vector3.ZERO);
        this.shaderState.receiveEnv = false;
        this.shaderState.castShadow = false;
        this.shaderState.acceptShadow = false;

        // Cube shadow map stores BACK-FACE depth (see CastShadowMaterialPass for
        // full rationale). Mesh thickness is the primary bias; rasterizer slope
        // bias is kept tiny as a grazing-angle safety net.
        this.shaderState.cullMode = GPUCullMode.front;
        this.shaderState.depthBias = 0;
        this.shaderState.depthBiasSlopeScale = 0.5;
        this.shaderState.depthBiasClamp = 0;

        this.setDefine(`USE_ALPHACUT`, true);
    }
}
