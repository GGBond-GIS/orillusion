import { GPUBufferBase } from "../core/buffer/GPUBufferBase";
import { UUID } from "../../../../util/Global";
import { Color } from "../../../../math/Color";
import { Vector2 } from "../../../../math/Vector2";
import { Vector3 } from "../../../../math/Vector3";
import { Vector4 } from "../../../../math/Vector4";
import { Struct } from "../../../../util/struct/Struct";
import { StorageGPUBuffer } from "../core/buffer/StorageGPUBuffer";
import { StructStorageGPUBuffer } from "../core/buffer/StructStorageGPUBuffer";
import { UniformGPUBuffer } from "../core/buffer/UniformGPUBuffer";
import { UniformNode } from "../core/uniforms/UniformNode";
import { ShaderReflection } from "./value/ShaderReflectionInfo";
import { UniformType, UniformValue } from "./value/UniformValue";
import { MaterialDataUniformGPUBuffer } from "../core/buffer/MaterialDataUniformGPUBuffer";
import { Context3D } from "../Context3D";

/**
 * Base class for a single shader pass. Holds the pass's uniforms, GPU buffers,
 * shader reflection data, precompile defines/constants and bind groups, and
 * exposes helpers to set and read uniform values and to track shader/value changes.
 * @group GFX
 */
export class ShaderPassBase {
    /**
     * Shader Unique instance id
     */
    public readonly instanceID: string;

    /**
     * Shader variant value
     */
    public shaderVariant: string;

    /**
     * Vertex stage entry point name
     */
    public vsEntryPoint: string = `main`;

    /**
     * Fragment stage entry point name
     */
    public fsEntryPoint: string = `main`;

    /**
     * The Context3D this pass is bound to. Set on first GPU use via bindCtx.
     * Plan B: a ShaderPass may only be used by one Engine3D.
     */
    public _boundCtx: Context3D | null = null;

    /**
     * BindGroups — single array owned by the bound Context3D.
     */
    public bindGroups: GPUBindGroup[] = [];

    /**
     * Shader reflection info
     */
    public shaderReflection: ShaderReflection;

    /**
     * The defined syntax value of the Shader when it is precompiled
     */
    public defineValue: { [name: string]: any };

    /**
     * The constant value of the Shader when it is precompiled
     */
    public constValues: { [name: string]: any };

    /**
     * Uniforms data collection
     */
    public uniforms: { [name: string]: UniformNode };

    /**
       * Uniform data for materials
       */
    public materialDataUniformBuffer: MaterialDataUniformGPUBuffer;

    /**
     * Internal registry mapping buffer names to their GPU buffer instances.
     */
    protected _bufferDic: Map<string, GPUBufferBase>;
    /**
     * Flag indicating the shader needs to be recompiled.
     */
    protected _shaderChange: boolean = true;
    /**
     * Flag indicating uniform values changed and need to be reapplied.
     */
    protected _valueChange: boolean = false;

    constructor() {
        this.instanceID = UUID();
        this.defineValue = {};
        this.constValues = {};
        this.uniforms = {};
        this._bufferDic = new Map<string, GPUBufferBase>();
        // bindGroups routes through per-context Map; no eager init needed.
    };

    /**
     * notice shader change
     */
    public noticeShaderChange() {
        this._shaderChange = true;
    }

    /**
     * notice shader state change
     */
    public noticeValueChange() {
        this._valueChange = true;
    }

    /**
    * set storage gpu buffer
    * @param name buffer name
    * @param buffer storage useAge gpu buffer
    */
    public setStorageBuffer(name: string, buffer: StorageGPUBuffer) {
        if (!this._bufferDic.has(name)) {
            this._bufferDic.set(name, buffer);
            this.noticeBufferChange(name);
        } else {
            this._bufferDic.set(name, buffer);
        }
    }

    /**
     * Get a previously set storage gpu buffer by name.
     * @param name buffer name
     */
    public getStorageBuffer(name: string): StorageGPUBuffer {
        return this._bufferDic.get(name) as StorageGPUBuffer;
    }

    /**
     * set struct storage gpu buffer
     * @param name buffer name
     * @param buffer struct storage useAge gpu buffer
     */
    public setStructStorageBuffer<T extends Struct>(name: string, buffer: StructStorageGPUBuffer<T>) {
        if (this._bufferDic.has(name)) {
            this._bufferDic.set(name, buffer);
            this.noticeBufferChange(name);
        } else {
            this._bufferDic.set(name, buffer);
        }
    }

    /**
     * set uniform gpu buffer min size 256
     * @param name
     * @param buffer
     */
    public setUniformBuffer(name: string, buffer: UniformGPUBuffer) {
        if (this._bufferDic.has(name)) {
            this._bufferDic.set(name, buffer);
            this.noticeBufferChange(name);
        } else {
            this._bufferDic.set(name, buffer);
        }
    }

    /**
     * Get a previously set uniform gpu buffer by name.
     * @param name buffer name
     */
    public getUniformBuffer(name: string): UniformGPUBuffer {
        return this._bufferDic.get(name) as UniformGPUBuffer;
    }

    /**
     * set define value
     * @param defineName 
     * @param value 
     */
    public setDefine(defineName: string, value: any) {
        if (this.defineValue[defineName] == null || this.defineValue[defineName] != value) {
            this.defineValue[defineName] = value;
            this.noticeValueChange();
            this.noticeShaderChange();
        }
        this.defineValue[defineName] = value;
    }

    /**
     * Whether there is a define key
     * @param defineName 
     * @returns 
     */
    public hasDefine(defineName: string) {
        return this.defineValue[defineName] != null;
    }

    /**
     * delete define value
     * @param defineName 
     */
    public deleteDefine(defineName: string) {
        delete this.defineValue[defineName];
        this.noticeShaderChange();
    }

    /**
     * set uniform float value
     * @param name 
     * @param value 
     */
    public setUniformFloat(name: string, value: number) {
        if (!this.uniforms[name]) {
            this.uniforms[name] = new UniformNode(value);
            this.noticeValueChange();
        } else {
            this.uniforms[name].value = value;
        }
    }

    /**
     * set uniform int32 value
     * @param name 
     * @param value 
     */
    public setUniformInt32(name: string, value: number) {
        if (!this.uniforms[name]) {
            this.uniforms[name] = new UniformNode(value, UniformType.Int32);
            this.noticeValueChange();
        } else {
            this.uniforms[name].value = value;
        }
    }

    /**
     * set uniform vector2 value
     * @param name 
     * @param value 
     */
    public setUniformVector2(name: string, value: Vector2) {
        if (!this.uniforms[name]) {
            this.uniforms[name] = new UniformNode(value);
            this.noticeValueChange();
        } else {
            this.uniforms[name].vector2 = value;
        }
    }

    /**
     * set uniform vector3 value
     * @param name 
     * @param value 
     */
    public setUniformVector3(name: string, value: Vector3) {
        if (!this.uniforms[name]) {
            this.uniforms[name] = new UniformNode(value);
        } else {
            this.uniforms[name].vector3 = value;
        }
    }

    /**
     * set uniform vector4 value
     * @param name 
     * @param value 
     */
    public setUniformVector4(name: string, value: Vector4) {
        if (!this.uniforms[name]) {
            this.uniforms[name] = new UniformNode(value);
        } else {
            this.uniforms[name].vector4 = value;
        }
    }

    /**
     * set uniform color value
     * @param name 
     * @param value 
     */
    public setUniformColor(name: string, value: Color) {
        if (!this.uniforms[name]) {
            this.uniforms[name] = new UniformNode(value);
        } else {
            this.uniforms[name].color = value;
        }
    }

    /**
     * set uniform array value
     * @param name 
     * @param value 
     */
    public setUniformArray(name: string, value: Float32Array) {
        if (!this.uniforms[name]) {
            this.uniforms[name] = new UniformNode(value);
        } else {
            this.uniforms[name].float32Array(value);
        }
    }

    /**
     * Set a uniform value of an arbitrary supported type.
     * @param name uniform name
     * @param value uniform value
     */
    public setUniform(name: string, value: UniformValue) {
        if (!this.uniforms[name]) {
            this.uniforms[name] = new UniformNode(value);
        } else {
            this.uniforms[name].data = value;
        }
    }

    /**
     * Get a uniform value by name.
     * @param name uniform name
     */
    public getUniform(name: string): UniformValue {
        return this.uniforms[name].data;
    }

    /**
     * Get a uniform float value by name.
     * @param name uniform name
     */
    public getUniformFloat(name: string): number {
        return this.uniforms[name].data;
    }

    /**
     * Get a uniform vector2 value by name.
     * @param name uniform name
     */
    public getUniformVector2(name: string): Vector2 {
        return this.uniforms[name].data;
    }

    /**
     * Get a uniform vector3 value by name.
     * @param name uniform name
     */
    public getUniformVector3(name: string): Vector3 {
        return this.uniforms[name].data;
    }

    /**
     * Get a uniform vector4 value by name.
     * @param name uniform name
     */
    public getUniformVector4(name: string): Vector4 {
        return this.uniforms[name].data;
    }

    /**
     * Get a uniform color value by name.
     * @param name uniform name
     */
    public getUniformColor(name: string): Color {
        return this.uniforms[name].color;
    }

    /**
     * Get a registered gpu buffer by name.
     * @param name buffer name
     */
    public getBuffer(name: string): GPUBufferBase {
        return this._bufferDic[name].data;
    }

    /**
     * Hook invoked when a buffer is added or replaced. Subclasses may override.
     * @param name buffer name
     */
    protected noticeBufferChange(name: string) {

    }

    /**
     * Apply pending material uniform data to the GPU when values have changed.
     */
    public applyUniform() {
        if (this.materialDataUniformBuffer && this._valueChange) {
            this.materialDataUniformBuffer.apply();
        }
    }

    /**
     * destroy
     */
    public destroy(force?: boolean) {
    }
}
