import { GPUCompareFunction, GPUCullMode } from "../../../../../gfx/graphics/webGpu/WebGPUConst";
import { RenderShaderPass } from "../../../../../gfx/graphics/webGpu/shader/RenderShaderPass";
import { RegisterShader } from "../../../../../util/SerializeDecoration";
import { Shader } from "../../../../../gfx/graphics/webGpu/shader/Shader";
import { Matrix4 } from "../../../../../math/Matrix4";


@RegisterShader
export class SkyShader extends Shader {
    private readonly _fixOrthMatrix: Matrix4;
    private _cacheData = { enable: false, aspect: 1.0, near: 1.0, far: 1000.0 };
    constructor() {
        super();
        this._fixOrthMatrix = new Matrix4();
        let colorShader = new RenderShaderPass('sky_vs_frag_wgsl', 'sky_fs_frag_wgsl');
        this.addRenderPass(colorShader);

        colorShader.setUniform('fixOrthProj', this._fixOrthMatrix.rawData);
        colorShader.setUniform('enableFixOrthProj', 0);
        colorShader.setUniformFloat(`exposure`, 1.0);
        colorShader.setUniformFloat(`roughness`, 0.0);

        let shaderState = colorShader.shaderState;
        shaderState.frontFace = `ccw`;
        shaderState.cullMode = GPUCullMode.front;
        shaderState.depthWriteEnabled = false;
        shaderState.depthCompare = GPUCompareFunction.less_equal;
    }

    //fix orth matrix
    public fixOrthProj(enable: boolean, aspect: number, near: number, far: number) {
        const cacheData = this._cacheData;
        if (cacheData.enable != enable
            || cacheData.aspect != aspect
            || cacheData.near != near
            || cacheData.far != far
        ) {
            cacheData.enable = enable;
            cacheData.aspect = aspect;
            cacheData.near = near;
            cacheData.far = far;

            this.setUniform('enableFixOrthProj', enable ? 1 : 0);
            this._fixOrthMatrix.perspective(90, aspect, near, far);
            this.setUniform('fixOrthProj', this._fixOrthMatrix.rawData);
        }

    }
}