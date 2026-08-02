import { Texture } from '../core/texture/Texture';
import { bindCtx } from '../Context3D';
import { Engine3D } from '../../../../Engine3D';
import { ShaderPassBase } from './ShaderPassBase';
import { ShaderReflection, ShaderReflectionVarInfo } from './value/ShaderReflectionInfo';
import { Preprocessor } from './util/Preprocessor';
import { CResizeEvent, Reference, Struct } from '../../../..';
import { StorageGPUBuffer } from '../core/buffer/StorageGPUBuffer';
import { StructStorageGPUBuffer } from '../core/buffer/StructStorageGPUBuffer';
import { UniformGPUBuffer } from '../core/buffer/UniformGPUBuffer';

/**
 * @internal
 * compute shader kernel
 */
export class ComputeShader extends ShaderPassBase {
    /**
     * Compute shader entry point name
     */
    public entryPoint: string = `CsMain`;

    /**
     * Compute shader x worker number
     */
    public workerSizeX: number = 1;

    /**
     * Compute shader y worker number
     */
    public workerSizeY: number = 0;

    /**
     * Compute shader z worker number
     */
    public workerSizeZ: number = 0;

    // Plan B: single compute pipeline bound to one Context3D.
    protected _computePipeline: GPUComputePipeline = null;
    protected _csShaderModule: GPUShaderModule;
    protected _destCS: string;
    protected _sourceCS: string;
    private _storageTextureDic: Map<string, Texture>;
    private _sampleTextureDic: Map<string, Texture>;
    private _groupsShaderReflectionVarInfos: ShaderReflectionVarInfo[][];
    private _groupCache: { [name: string]: { groupIndex: number, infos: any } } = {};

    /**
     *
     * @param computeShader wgsl compute shader
     */
    constructor(computeShader: string) {
        super();
        this._sourceCS = computeShader;
        ShaderReflection.getShaderReflection2(computeShader, this);
        this._storageTextureDic = new Map<string, Texture>();
        this._sampleTextureDic = new Map<string, Texture>();
    }

    /**
     * set write or read storage texture , use textureLod
     * @param name
     * @param texture
     */
    public setStorageTexture(name: string, texture: Texture) {
        // Overwriting is correct here — same semantics as setSamplerTexture.
        // Previously this was set-once (silently ignored repeat binds), which
        // broke any caller that wanted to re-point an output binding (e.g.
        // when the upstream chain changes and a post needs to rebind).
        this._storageTextureDic.set(name, texture);
    }

    /**
     * set samplerTexture , use textureSample or other sample texture api
     * @param name
     * @param texture
     */
    public setSamplerTexture(name: string, texture: Texture) {
        this._sampleTextureDic.set(name, texture);
    }

    /**
     * Record the compute shader distribution command
     * @param computePass Compute pass encoder
     */
    public compute(computePass: GPUComputePassEncoder) {
        if (!this._boundCtx) {
            // Derive ctx from any attached buffer or texture's bound context.
            for (const buf of this._bufferDic.values()) {
                if (buf._boundCtx) { bindCtx(this, buf._boundCtx); break; }
            }
            if (!this._boundCtx) {
                for (const tex of this._storageTextureDic.values()) {
                    if (tex._boundCtx) { bindCtx(this, tex._boundCtx); break; }
                }
            }
            if (!this._boundCtx) {
                for (const tex of this._sampleTextureDic.values()) {
                    if (tex._boundCtx) { bindCtx(this, tex._boundCtx); break; }
                }
            }
            // Fall back to the single-engine default when nothing attached has
            // been materialized yet (common for compute samples where buffers
            // are apply()'d with deferred upload).
            if (!this._boundCtx) bindCtx(this, Engine3D._defaultContext());
        }
        if (this._boundCtx) this._propagateCtx(this._boundCtx);
        if (!this._computePipeline) {
            this.genComputePipeline();
        }

        // Rebuild any bind groups that were invalidated since the last dispatch.
        // Callers (e.g. PostBase.bindUpstream) signal "re-bind needed" by
        // setting `this.bindGroups[i] = null` after updating the sampler /
        // storage texture dict. Without this rebuild loop, setBindGroup(null)
        // would crash the dispatch.
        for (let i = 0; i < this._groupsShaderReflectionVarInfos.length; ++i) {
            if (!this.bindGroups[i] && this._groupsShaderReflectionVarInfos[i]) {
                this.genGroups(i, this._groupsShaderReflectionVarInfos, true);
            }
        }

        computePass.setPipeline(this._computePipeline);
        for (let i = 0; i < this.bindGroups.length; ++i) {
            computePass.setBindGroup(i, this.bindGroups[i]);
        }

        if (this.workerSizeX && this.workerSizeY && this.workerSizeZ) {
            computePass.dispatchWorkgroups(this.workerSizeX, this.workerSizeY, this.workerSizeZ);
        } else if (this.workerSizeX && this.workerSizeY) {
            computePass.dispatchWorkgroups(this.workerSizeX, this.workerSizeY);
        } else {
            computePass.dispatchWorkgroups(this.workerSizeX);
        }
    }

    /**
     * Bind all attached buffers/textures to the ComputeShader's Context3D so
     * their `.buffer` / `.gpuTexture` getters materialize on the correct device.
     */
    private _propagateCtx(ctx: import('../Context3D').Context3D) {
        for (const buf of this._bufferDic.values()) {
            if (!buf._boundCtx) bindCtx(buf, ctx);
        }
        for (const tex of this._storageTextureDic.values()) {
            if (!tex._boundCtx) bindCtx(tex, ctx);
        }
        for (const tex of this._sampleTextureDic.values()) {
            if (!tex._boundCtx) bindCtx(tex, ctx);
        }
    }

    private createBufferBindGroup(groupIndex: number, varName: string, binding: number, entries: GPUBindGroupEntry[]) {
        let buffer = this._bufferDic.get(varName);
        if (buffer) {
            let entry: GPUBindGroupEntry = {
                binding: binding,
                resource: {
                    buffer: buffer.buffer,
                    offset: 0,//buffer.memory.shareFloat32Array.byteOffset,
                    size: buffer.memory.shareDataBuffer.byteLength,
                },
            }
            entries.push(entry);
        } else {
            console.error(`ComputeShader(${this.instanceID})`, `buffer ${varName} is missing!`);
        }
    }

    protected noticeBufferChange(name: string) {
        let bindGroupCache = this._groupCache[name];
        if (bindGroupCache) {
            this.genGroups(bindGroupCache.groupIndex, bindGroupCache.infos, true);
        }
    }

    protected genGroups(groupIndex: number, infos: ShaderReflectionVarInfo[][], force: boolean = false) {
        if (!this.bindGroups[groupIndex] || force) {
            const shaderRefs: ShaderReflectionVarInfo[] = infos[groupIndex];

            let entries: GPUBindGroupEntry[] = [];
            for (let j = 0; j < shaderRefs.length; ++j) {
                const refs = shaderRefs[j];
                if (!refs) continue;

                switch (refs.varType) {
                    case `uniform`:
                    case `storage-read`:
                    case `storage-read_write`:
                        {
                            this.createBufferBindGroup(groupIndex, refs.varName, refs.binding, entries);
                            this._groupCache[refs.varName] = { groupIndex: groupIndex, infos: infos };
                        }
                        break;
                    case `var`:
                        {
                            if (refs.dataType == `sampler`) {
                                let textureName = refs.varName.replace(`Sampler`, ``);
                                let texture = this._sampleTextureDic.get(textureName);
                                if (texture) {
                                    let entry: GPUBindGroupEntry = {
                                        binding: refs.binding,
                                        resource: texture.gpuSampler,
                                    }
                                    entries.push(entry);
                                } else {
                                    console.error(`ComputeShader(${this.instanceID})`, `texture ${refs.varName} is missing! `);
                                }
                            } else if (refs.dataType == `sampler_comparison`) {
                                let textureName = refs.varName.replace(`Sampler`, ``);
                                let texture = this._sampleTextureDic.get(textureName);
                                if (texture) {
                                    let entry: GPUBindGroupEntry = {
                                        binding: refs.binding,
                                        resource: texture.gpuSampler_comparison,
                                    }
                                    entries.push(entry);
                                } else {
                                    console.error(`ComputeShader(${this.instanceID})`, `texture ${refs.varName} is missing! `);
                                }
                            } else if (refs.dataType.indexOf('texture_storage') != -1) {
                                let texture = this._storageTextureDic.get(refs.varName);
                                if (texture) {
                                    let entry: GPUBindGroupEntry = {
                                        binding: refs.binding,
                                        resource: texture.getGPUView(),
                                    }
                                    entries.push(entry);
                                    Reference.getInstance().attached(texture, this);
                                } else {
                                    console.error(`ComputeShader(${this.instanceID})`, `texture ${refs.varName} is missing! `);
                                }
                            } else if (refs.dataType.indexOf('texture') != -1) {
                                let texture = this._sampleTextureDic.get(refs.varName);
                                if (texture) {
                                    let entry: GPUBindGroupEntry = {
                                        binding: refs.binding,
                                        resource: texture.getGPUView(),
                                    }
                                    entries.push(entry);
                                    Reference.getInstance().attached(texture, this);
                                } else {
                                    console.error(`ComputeShader(${this.instanceID})`, `texture ${refs.varName} is missing! `);
                                }
                            }
                        }
                        break;
                    default:
                        console.error(`unprocessed type:`, refs.varType);
                        break;
                }
            }

            const device = this._boundCtx!.device;
            let gpubindGroup = device.createBindGroup({
                layout: this._computePipeline.getBindGroupLayout(groupIndex),
                entries: entries
            });

            this.bindGroups[groupIndex] = gpubindGroup;
        }
    }

    protected genComputePipeline() {
        this.preCompileShader(this._sourceCS);
        this.genReflection();

        const device = this._boundCtx!.device;
        this._computePipeline = device.createComputePipeline({
            layout: `auto`,
            compute: {
                module: this.compileShader(),
                entryPoint: this.entryPoint,
            },
        });

        this._groupsShaderReflectionVarInfos = [];
        let shaderReflection = this.shaderReflection;

        this.bindGroups = [];
        for (let i = 0; i < shaderReflection.groups.length; ++i) {
            let srvs = shaderReflection.groups[i];
            this._groupsShaderReflectionVarInfos[i] = srvs;
            this.genGroups(i, this._groupsShaderReflectionVarInfos);
        }

        this._boundCtx!.addEventListener(CResizeEvent.RESIZE, (e) => {
            for (let i = 0; i < shaderReflection.groups.length; ++i) {
                let srvs = shaderReflection.groups[i];
                this._groupsShaderReflectionVarInfos[i] = srvs;
                this.genGroups(i, this._groupsShaderReflectionVarInfos, true);
            }
        }, this);
    }

    protected preCompileShader(shader: string) {
        for (const key in this.constValues) {
            if (Object.prototype.hasOwnProperty.call(this.constValues, key)) {
                const value = this.constValues[key];
                shader = shader.replaceAll(`&${key}`, value.toString());
            }
        }
        this._destCS = Preprocessor.parseComputeShader(shader, this.defineValue);
    }

    protected compileShader(): GPUShaderModule {
        const device = this._boundCtx!.device;
        let shaderModule = device.createShaderModule({
            label: `ComputeShader(${this.instanceID})`,
            code: this._destCS,
        });

        shaderModule.getCompilationInfo().then((e) => {
            if (e.messages.length > 0) {
                console.warn('[shader error]', e, this._destCS);
            }
        });

        this._csShaderModule = shaderModule;
        return shaderModule;
    }

    private genReflection() {
        this.shaderVariant += ShaderReflection.genComputeShaderVariant(this);
        let reflection = ShaderReflection.poolGetReflection(this.shaderVariant);
        if (!reflection) {
            ShaderReflection.getShaderReflection2(this._destCS, this);
            ShaderReflection.combineShaderReflectionVarInfo(this.shaderReflection, this.shaderReflection.cs_variables);
        } else {
            this.shaderReflection = reflection;
        }
    }
}
