import { GPUCompareFunction, GPUCullMode } from "../../../../../gfx/graphics/webGpu/WebGPUConst";
import { RenderShaderPass } from "../../../../../gfx/graphics/webGpu/shader/RenderShaderPass";
import { RegisterShader } from "../../../../../util/SerializeDecoration";
import { Shader } from "../../../../../gfx/graphics/webGpu/shader/Shader";
import { Matrix4 } from "../../../../../math/Matrix4";


/**
 * Internal sky shader used by the prefab material pipeline. Renders the
 * environment skybox and manages a private orthographic-projection fix matrix.
 * @internal
 */
@RegisterShader
export class SkyShader extends Shader {
    private _fixOrthMatrix: Matrix4;
    // Stable JS-owned mirror of _fixOrthMatrix.rawData. The Matrix4's rawData
    // is a Float32Array view into wasm.HEAPF32.buffer, which detaches when
    // the WASM heap grows (e.g. scenes with >1k matrices). Binding rawData
    // directly as a uniform leaves UniformNode holding a dead view; we copy
    // values into _fixOrthData and bind THAT instead.
    private _fixOrthData: Float32Array = new Float32Array(16);
    private _cacheData = { enable: false, aspect: 1.0, near: 1.0, far: 1000.0 };
    constructor() {
        super();
        this._fixOrthMatrix = new Matrix4();
        this._fixOrthData.set(this._fixOrthMatrix.rawData);
        let colorShader = new RenderShaderPass('sky_vs_frag_wgsl', 'sky_fs_frag_wgsl');
        this.addRenderPass(colorShader);

        colorShader.setUniform('fixOrthProj', this._fixOrthData);
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
            this._fixOrthData.set(this._fixOrthMatrix.rawData);
            this.setUniform('fixOrthProj', this._fixOrthData);
        }

    }

    public destroy(force?: boolean) {
        // Release the sky shader's private orth-proj matrix back to the
        // static table. Base Shader.destroy() doesn't know about it.
        if (this._fixOrthMatrix) {
            Matrix4.freeIndex(this._fixOrthMatrix);
            this._fixOrthMatrix = null;
        }
        super.destroy(force);
    }
}