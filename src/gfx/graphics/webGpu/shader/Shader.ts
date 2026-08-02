import { RenderShaderCompute } from "../compute/RenderShaderCompute";
import { GPUBufferBase } from "../core/buffer/GPUBufferBase";
import { StorageGPUBuffer } from "../core/buffer/StorageGPUBuffer";
import { StructStorageGPUBuffer } from "../core/buffer/StructStorageGPUBuffer";
import { UniformGPUBuffer } from "../core/buffer/UniformGPUBuffer";
import { Texture } from "../core/texture/Texture";
import { RenderShaderPass } from "./RenderShaderPass";
import { UniformValue } from "./value/UniformValue";
import { PassType } from "../../../renderJob/passRenderer/state/PassType";
import { Color } from "../../../../math/Color";
import { Vector2 } from "../../../../math/Vector2";
import { Vector3 } from "../../../../math/Vector3";
import { Vector4 } from "../../../../math/Vector4";
import { Struct } from "../../../../util/struct/Struct";

/**
 * A shader is the collection of render passes (grouped by {@link PassType}) and
 * compute passes that drive a material's rendering. It exposes convenience
 * methods that forward uniform, texture, buffer and define changes to all of
 * its render passes.
 * @group GFX
 */
export class Shader {


    /** Compute passes attached to this shader. */
    public computes: RenderShaderCompute[];

    /** Render passes grouped by pass type. */
    public passShader: Map<PassType, RenderShaderPass[]>;

    constructor() {
        this.computes = [];
        this.passShader = new Map<PassType, RenderShaderPass[]>();
    }

    /**
     * Add a render pass to this shader.
     * @param renderShader the render pass to add
     * @param index optional insertion index; appended when -1
     */
    public addRenderPass(renderShader: RenderShaderPass, index: number = -1) {
        let subShader: RenderShaderPass[] = this.passShader.get(renderShader.passType) || [];
        if (index == -1) {
            subShader.push(renderShader);
        } else {
            subShader.splice(index, -1, renderShader);
        }
        this.passShader.set(renderShader.passType, subShader);
    }

    /**
     * Remove a render pass from this shader.
     * @param renderShader the render pass to remove
     * @param index optional index within the pass type bucket
     */
    public removeShader(renderShader: RenderShaderPass, index: number = -1) {
        let subShader: RenderShaderPass[] = this.passShader.get(renderShader.passType);
        if (subShader) {
            if (index == -1) {
                let index = subShader.indexOf(renderShader);
                if (index != -1) {
                    subShader.splice(index);
                }
            } else {
                subShader.splice(index, 1);
            }
        }
    }

    /**
     * Remove a render pass by pass type and index.
     * @param passType the pass type bucket
     * @param index optional index; removes the whole bucket when -1
     */
    public removeShaderByIndex(passType: PassType, index: number = -1) {
        let subShader: RenderShaderPass[] = this.passShader.get(passType);
        if (subShader) {
            if (index == -1) {
                this.passShader.delete(passType);
            } else {
                subShader.splice(index, 1);
            }
        }
    }

    /**
     * Get the render passes registered for the given pass type.
     * @param passType the pass type bucket
     */
    public getSubShaders(passType: PassType): RenderShaderPass[] {
        return this.passShader.get(passType) || [];
    }

    /**
     * Whether any render pass is registered for the given pass type.
     * @param passType the pass type bucket
     */
    public hasSubShaders(passType: PassType): boolean {
        let subs = this.passShader.get(passType);
        return subs.length > 0;
    }

    /**
     * Get the default (COLOR) render passes.
     */
    public getDefaultShaders(): RenderShaderPass[] {
        return this.passShader.get(PassType.COLOR);
    }

    /**
     * Get the first default (COLOR) render pass.
     */
    public getDefaultColorShader(): RenderShaderPass {
        return this.passShader.get(PassType.COLOR)[0];
    }

    /**
     * Set a preprocessor define on all render passes.
     * @param arg0 the define name
     * @param arg1 the define value
     */
    public setDefine(arg0: string, arg1: boolean) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setDefine(arg0, arg1);
            }
        }
    }

    /**
     * Get the value of a preprocessor define from the render passes.
     * @param arg0 the define name
     */
    public getDefine(arg0: string): boolean {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                if (rd.defineValue[arg0] != null)
                    return rd.defineValue[arg0];
            }
        }
        return false;
    }

    /**
     * Whether any render pass declares the given preprocessor define.
     * @param arg0 the define name
     */
    public hasDefine(arg0: string) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                let has = rd.hasDefine(arg0);
                if (has)
                    return has;
            }
        }
        return false
    }

    /**
     * Remove a preprocessor define from all render passes.
     * @param arg0 the define name
     */
    public deleteDefine(arg0: string) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.deleteDefine(arg0);
            }
        }
    }

    /**
     * Set a uniform value on all render passes.
     * @param arg0 the uniform name
     * @param arg1 the uniform value
     */
    public setUniform(arg0: string, arg1: UniformValue) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setUniform(arg0, arg1);
            }
        }
    }

    /**
     * Set a float uniform on all render passes.
     * @param arg0 the uniform name
     * @param arg1 the float value
     */
    public setUniformFloat(arg0: string, arg1: number) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setUniformFloat(arg0, arg1);
            }
        }
    }

    /**
     * Set a 32-bit integer uniform on all render passes.
     * @param arg0 the uniform name
     * @param arg1 the integer value
     */
    public setUniformInt32(arg0: string, arg1: number) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setUniformInt32(arg0, arg1);
            }
        }
    }

    /**
     * Set a Vector2 uniform on all render passes.
     * @param arg0 the uniform name
     * @param arg1 the vector value
     */
    public setUniformVector2(arg0: string, arg1: Vector2) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setUniformVector2(arg0, arg1);
            }
        }
    }

    /**
     * Set a Vector3 uniform on all render passes.
     * @param arg0 the uniform name
     * @param arg1 the vector value
     */
    public setUniformVector3(arg0: string, arg1: Vector3) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setUniformVector3(arg0, arg1);
            }
        }
    }

    /**
     * Set a Vector4 uniform on all render passes.
     * @param arg0 the uniform name
     * @param arg1 the vector value
     */
    public setUniformVector4(arg0: string, arg1: Vector4) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setUniformVector4(arg0, arg1);
            }
        }
    }

    /**
     * Set a color uniform on all render passes.
     * @param arg0 the uniform name
     * @param arg1 the color value
     */
    public setUniformColor(arg0: string, arg1: Color) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setUniformColor(arg0, arg1);
            }
        }
    }

    /**
     * Get a uniform value from the default color pass.
     * @param arg0 the uniform name
     */
    public getUniform(arg0: string): any {
        return this.getDefaultColorShader().getUniform(arg0);
    }

    /**
     * Get a float uniform from the default color pass.
     * @param arg0 the uniform name
     */
    public getUniformFloat(arg0: string): number {
        return this.getDefaultColorShader().getUniformFloat(arg0);
    }

    /**
     * Get a Vector2 uniform from the default color pass.
     * @param arg0 the uniform name
     */
    public getUniformVector2(arg0: string): Vector2 {
        return this.getDefaultColorShader().getUniformVector2(arg0);
    }

    /**
     * Get a Vector3 uniform from the default color pass.
     * @param arg0 the uniform name
     */
    public getUniformVector3(arg0: string): Vector3 {
        return this.getDefaultColorShader().getUniformVector3(arg0);
    }

    /**
     * Get a Vector4 uniform from the default color pass.
     * @param arg0 the uniform name
     */
    public getUniformVector4(arg0: string): Vector4 {
        return this.getDefaultColorShader().getUniformVector4(arg0);
    }

    /**
     * Get a color uniform from the default color pass.
     * @param arg0 the uniform name
     */
    public getUniformColor(arg0: string): Color {
        return this.getDefaultColorShader().getUniformColor(arg0);
    }

    /**
     * Set a texture on all render passes and enable its `USE_*` define.
     * @param arg0 the texture name
     * @param arg1 the texture
     */
    public setTexture(arg0: string, arg1: Texture) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setTexture(arg0, arg1);
            }
        }
        this.setDefine(`USE_${arg0.toLocaleUpperCase()}`, true);
    }

    /**
     * Get a texture from the default color pass.
     * @param arg0 the texture name
     */
    public getTexture(arg0: string): Texture {
        return this.getDefaultColorShader().textures[arg0];
    }

    /**
     * Set a uniform buffer on all render passes.
     * @param arg0 the buffer name
     * @param arg1 the uniform buffer
     */
    public setUniformBuffer(arg0: string, arg1: UniformGPUBuffer) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setUniformBuffer(arg0, arg1);
            }
        }
    }

    /**
     * Get a uniform buffer from the default color pass.
     * @param arg0 the buffer name
     */
    public getUniformBuffer(arg0: string): GPUBufferBase {
        return this.getDefaultColorShader().getBuffer(arg0);
    }

    /**
     * Set a storage buffer on all render passes.
     * @param arg0 the buffer name
     * @param arg1 the storage buffer
     */
    public setStorageBuffer(arg0: string, arg1: StorageGPUBuffer) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setStorageBuffer(arg0, arg1);
            }
        }
    }

    /**
     * Get a storage buffer from the default color pass.
     * @param arg0 the buffer name
     */
    public getStorageBuffer(arg0: string): StorageGPUBuffer {
        return this.getDefaultColorShader().getBuffer(arg0);
    }

    /**
     * Set a struct storage buffer on all render passes.
     * @param arg0 the buffer name
     * @param arg1 the struct storage buffer
     */
    public setStructStorageBuffer<T extends Struct>(arg0: string, arg1: StructStorageGPUBuffer<T>) {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.setStructStorageBuffer(arg0, arg1);
            }
        }
    }

    /**
     * Get a struct storage buffer from the default color pass.
     * @param arg0 the buffer name
     */
    public getStructStorageBuffer(arg0: string): GPUBufferBase {
        return this.getDefaultColorShader().getBuffer(arg0);
    }

    /**
     * Notify all render passes that uniform values have changed.
     */
    public noticeValueChange() {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.noticeValueChange();
            }
        }
    }

    /**
     * Destroy all render passes and clear the pass map.
     * @param force force destruction of GPU resources
     */
    public destroy(force?: boolean) {
        // Destroy ALL passes — COLOR, OIT_ACCUM, SHADOW, REFLECTION,
        // DEPTH, GI, etc. The previous implementation only destroyed
        // the COLOR pass, leaking RenderShaderPass instances and their
        // GPU resources (uniform buffers, bind groups, pipelines,
        // textures, materialDataUniformBuffer). This bit hardest on
        // material-type swaps (e.g. PBR → UnLit via buildSpheres
        // destroy+rebuild) where N derived passes per renderer × N
        // renderers leaked per swap.
        for (const passList of this.passShader.values()) {
            for (const pass of passList) {
                pass.destroy(force);
            }
        }
        this.passShader.clear();
    }

    /**
     * Deep-clone this shader, copying every render pass.
     */
    public clone() {
        // Deep-copy every pass (COLOR, SHADOW, REFLECTION, DEPTH,
        // OIT_ACCUM, GI, …). The previous implementation pushed the
        // SAME RenderShaderPass refs into the new Shader and only
        // copied the COLOR bucket, which (a) leaked SHADOW/REFLECTION
        // passes from the source, and (b) made `material.destroy()` on
        // any clone tear down the shared pass — breaking the source
        // material and any subsequently-created clones (the
        // Sample_AddRemove add → remove → add crash).
        let newShader = new Shader();
        for (const passes of this.passShader.values()) {
            for (const pass of passes) {
                newShader.addRenderPass(pass.clone());
            }
        }
        return newShader;
    }

    /**
     * Apply pending uniform values to all render passes.
     */
    applyUniform() {
        for (const pass of this.passShader) {
            for (const rd of pass[1]) {
                rd.applyUniform();
            }
        }
    }
}