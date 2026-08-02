import { PassType, Shader } from '..';
import { GIProbeShader } from '../assets/shader/materials/GIProbeShader';
import { ShaderLib } from '../assets/shader/ShaderLib';
import { Engine3D } from '../Engine3D';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { RenderShaderPass } from '../gfx/graphics/webGpu/shader/RenderShaderPass';
import { Vector4 } from '../math/Vector4';
import { Material } from './Material';

/**
 * @internal
 * @group Material
 */
export enum GIProbeMaterialType {
    CastGI = 0,
    ReceiveGI = 1,
    CastDepth = 2,
    Other = 3,
}

/**
 * Material used when rendering geometry into global illumination probes.
 * @group Material
 */
export class GIProbeMaterial extends Material {
    static count = 0;

    constructor(type: GIProbeMaterialType = GIProbeMaterialType.CastGI, index: number = 0, ctx?: Context3D) {
        super();
        ShaderLib.register("GIProbeShader", GIProbeShader);

        let newShader = new Shader();

        let colorShader = new RenderShaderPass('GIProbeShader', 'GIProbeShader');
        colorShader.passType = PassType.COLOR;
        newShader.addRenderPass(colorShader);

        colorShader.setDefine('USE_BRDF', true);
        colorShader.setShaderEntry(`VertMain`, `FragMain`);
        colorShader.setUniformVector4('probeUniform', new Vector4(index, type, 0, 0));
        let shaderState = colorShader.shaderState;
        shaderState.acceptShadow = false;
        shaderState.castShadow = false;
        shaderState.receiveEnv = false;
        shaderState.acceptGI = false;
        shaderState.useLight = false;

        const res = Engine3D.resFor(ctx);
        newShader.setTexture("baseMap", res.whiteTexture);
        newShader.setTexture("normalMap", res.normalTexture);
        newShader.setTexture("emissiveMap", res.blackTexture);

        this.shader = newShader;
    }

}
