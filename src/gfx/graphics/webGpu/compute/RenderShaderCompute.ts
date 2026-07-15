import { Shader } from "../../../..";
import { View3D } from "../../../../core/View3D";
import { ComputeShader } from "../shader/ComputeShader";

/**
 * Drives a compute shader derived from a source render shader, running once and/or per frame.
 * @group GFX
 */
export class RenderShaderCompute {

    protected sourceShader: Shader;
    protected compute: ComputeShader;

    protected needUpdate: boolean = true;

    constructor(shaderStr: string, sourceShader: Shader) {
        this.sourceShader = sourceShader;
        this.compute = new ComputeShader(shaderStr);
        this.init();
    }

    protected init() {

    }

    protected onOnce?(view: View3D): void

    protected onFrame?(view: View3D): void

    public onUpdate(view: View3D) {
        if (this.onFrame) {
            this.onFrame(view);
        }

        if (this.onOnce && this.needUpdate) {
            this.needUpdate = false;
            this.onFrame(view);
        }
    }
}