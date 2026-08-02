import { StorageGPUBuffer } from "../gfx/graphics/webGpu/core/buffer/StorageGPUBuffer";
import { UniformGPUBuffer } from "../gfx/graphics/webGpu/core/buffer/UniformGPUBuffer";
import { Texture } from "../gfx/graphics/webGpu/core/texture/Texture";
import { RenderShaderPass } from "../gfx/graphics/webGpu/shader/RenderShaderPass";
import { PassType } from "../gfx/renderJob/passRenderer/state/PassType";
import { Shader } from "../gfx/graphics/webGpu/shader/Shader";
import { Color } from "../math/Color";
import { Vector2 } from "../math/Vector2";
import { Vector3 } from "../math/Vector3";
import { Vector4 } from "../math/Vector4";
import { BlendMode } from "./BlendMode";
import { UUID } from "../util/Global";
import { Reference } from "../util/Reference";

/**
 * Base class for all materials. A material owns a set of render shader passes
 * and exposes shared rendering state such as blend mode, cull mode and texture bindings.
 * @group Material
 */
export class Material {

    /**
     *
     * Material Unique Identifier
     */
    public instanceID: string;

    /**
      *
      * name of this material
      */
    public name: string;

    /** Whether this material is enabled for rendering. */
    public enable: boolean = true;

    private _oitMode: 'sorted' | 'weighted' | 'depth-peel' = 'sorted';

    /** Order-independent transparency mode opt-in.
     *
     *  - `'sorted'` (default): back-to-front sorted alpha-blend. Cheap,
     *    correct between meshes, but in-mesh triangle order is geometry-
     *    based not depth-based so self-overlapping meshes (spheres,
     *    torus) show banding.
     *  - `'weighted'`: McGuire-Bavoil 2013 Weighted-Blended OIT. Single-
     *    pass, order-independent, no in-mesh banding. Approximate —
     *    accum.rgb/accum.a degenerates to a depth-weighted average so
     *    α=1 looks averaged-milky at small scene scales (the front-vs-
     *    back depth-weight ratio saturates the paper's z/200 norm).
     *    Use for unbounded transparent layer counts: particles, smoke,
     *    foliage, hair cards.
     *  - `'depth-peel'`: Dual depth peeling. Multi-pass
     *    (passCount × 2 layers), order-correct over operator. α=1 is
     *    cleanly opaque — front fragment dominates because subsequent
     *    layers get multiplied by (1 - frontColor.a) = 0. Hard layer
     *    count limit (default 10). Use for hero glass, scientific
     *    visualization, layered architectural geometry.
     *
     *  All three only take effect when `engine.setting.render.useOIT`
     *  is true (otherwise everything falls through the sorted path).
     *
     *  Setter notifies attached renderers so the corresponding derived
     *  pass(es) get lazily generated when flipping mode at runtime.
     *  Without this, callers had to follow up with an alphaMode setter
     *  call to provoke `refreshRenderClassification` → `castNeedPass`.
     *
     *  Documented at Material-level (not LitMaterial) so any future
     *  material subclass (particle, decal) can opt in. */
    public get oitMode(): 'sorted' | 'weighted' | 'depth-peel' {
        return this._oitMode;
    }

    /** Set the order-independent transparency mode, notifying renderers to re-classify the affected passes. */
    public set oitMode(value: 'sorted' | 'weighted' | 'depth-peel') {
        if (this._oitMode === value) return;
        this._oitMode = value;
        this._notifyRenderClassificationDirty();
    }

    private _defaultSubShader: RenderShaderPass;

    /** The shader instance backing this material. */
    protected _shader: Shader;

    constructor() {
        this.instanceID = UUID();
    }

    /** Set the shader for this material and cache its default sub-shader. */
    public set shader(shader: Shader) {
        this._shader = shader;
        this._defaultSubShader = shader.getDefaultShaders()[0];
    }

    /** Get the shader bound to this material. */
    public get shader(): Shader {
        return this._shader;
    }

    /** Whether the default sub-shader renders both faces (no back-face culling). */
    public get doubleSide(): boolean {
        return this._defaultSubShader.doubleSide;
    }

    /** Enable or disable double-sided rendering on the default sub-shader. */
    public set doubleSide(value: boolean) {
        this._defaultSubShader.doubleSide = value;
    }

    /** Whether this material casts shadows. */
    public get castShadow(): boolean {
        return this._defaultSubShader.shaderState.castShadow;
    }

    /** Enable or disable shadow casting for this material. */
    public set castShadow(value: boolean) {
        let shaderState = this._defaultSubShader.shaderState;
        if (value != shaderState.castShadow) {
            shaderState.castShadow = value;
        }
    }

    /** Whether this material receives shadows from other casters. */
    public get acceptShadow(): boolean {
        return this._defaultSubShader.shaderState.acceptShadow;
    }

    /** Enable or disable shadow receiving for this material. */
    public set acceptShadow(value: boolean) {
        let shaderState = this._defaultSubShader.shaderState;
        if (shaderState.acceptShadow != value) {
            shaderState.acceptShadow = value;
            this._defaultSubShader.noticeShaderChange();
            this._defaultSubShader.noticeValueChange();
        }
    }

    /** Whether this material contributes to reflection probes. */
    public get castReflection(): boolean {
        return this._defaultSubShader.shaderState.castReflection;
    }

    /** Enable or disable reflection casting for this material. */
    public set castReflection(value: boolean) {
        this._defaultSubShader.shaderState.castReflection = value;
    }

    /** The blend mode of the default sub-shader. */
    public get blendMode(): BlendMode {
        return this._defaultSubShader.blendMode;
    }

    /** Set the blend mode of the default sub-shader. */
    public set blendMode(value: BlendMode) {
        this._defaultSubShader.blendMode = value;
    }

    /** The depth comparison function of the default sub-shader. */
    public get depthCompare(): GPUCompareFunction {
        return this._defaultSubShader.depthCompare;
    }

    /** Set the depth comparison function across all passes of this material. */
    public set depthCompare(value: GPUCompareFunction) {
        this._defaultSubShader.depthCompare = value;
        for (let item of this._shader.passShader.values()) {
            for (let s of item) {
                s.depthCompare = value;
            }
        }
    }


    /** Whether this material is rendered as transparent. */
    public get transparent(): boolean {
        return this._defaultSubShader.shaderState.transparent;
    }

    /** Enable or disable transparency, moving the pass to the transparent queue when enabled. */
    public set transparent(value: boolean) {
        this._defaultSubShader.shaderState.transparent = value;
        if (value) {
            this._defaultSubShader.renderOrder = 3000;
        }
    }

    /** The face culling mode of the default sub-shader. */
    public get cullMode(): GPUCullMode {
        return this._defaultSubShader.cullMode;
    }

    /** Set the face culling mode across all passes of this material. */
    public set cullMode(value: GPUCullMode) {
        if (this._defaultSubShader.cullMode != value) {
            for (let list of this._shader.passShader.values()) {
                for (let pass of list) {
                    pass.cullMode = value;
                }
            }
            this._defaultSubShader.cullMode = value;
        }
    }

    /** Whether depth writing is enabled for the default sub-shader. */
    public get depthWriteEnabled(): boolean {
        return this._defaultSubShader.depthWriteEnabled;
    }

    /** Enable or disable depth writing for the default sub-shader. */
    public set depthWriteEnabled(value: boolean) {
        this._defaultSubShader.depthWriteEnabled = value;
    }

    /**
     * Stencil front face state
     */
    public get stencilFront(): GPUStencilFaceState {
        return this._defaultSubShader.stencilFront;
    }

    /** Set the stencil front face state. */
    public set stencilFront(value: GPUStencilFaceState) {
        this._defaultSubShader.stencilFront = value;
    }

    /**
     * Stencil back face state
     */
    public get stencilBack(): GPUStencilFaceState {
        return this._defaultSubShader.stencilBack;
    }

    /** Set the stencil back face state. */
    public set stencilBack(value: GPUStencilFaceState) {
        this._defaultSubShader.stencilBack = value;
    }

    /**
     * Stencil read mask
     */
    public get stencilReadMask(): number {
        return this._defaultSubShader.stencilReadMask;
    }

    /** Set the stencil read mask. */
    public set stencilReadMask(value: number) {
        this._defaultSubShader.stencilReadMask = value;
    }

    /**
     * Stencil write mask
     */
    public get stencilWriteMask(): number {
        return this._defaultSubShader.stencilWriteMask;
    }

    /** Set the stencil write mask. */
    public set stencilWriteMask(value: number) {
        this._defaultSubShader.stencilWriteMask = value;
    }

    /**
     * Stencil reference value
     */
    public get stencilRef(): number {
        return this._defaultSubShader.stencilRef;
    }

    /** Set the stencil reference value. */
    public set stencilRef(value: number) {
        this._defaultSubShader.stencilRef = value;
    }

    /** Enable or disable billboard orientation via the USE_BILLBOARD shader define. */
    public set useBillboard(value: boolean) {
        this._defaultSubShader.setDefine("USE_BILLBOARD", value);
    }

    /** The primitive topology of the default sub-shader. */
    public get topology() {
        return this._defaultSubShader.topology;
    }

    /** Set the primitive topology of the default sub-shader. */
    public set topology(value: GPUPrimitiveTopology) {
        this._defaultSubShader.topology = value;
    }

    /** Set the base color uniform. */
    public set baseColor(color: Color) {
        this.shader.setUniformColor(`baseColor`, color);
    }

    /** Get the base color uniform. */
    public get baseColor() {
        return this.shader.getUniformColor("baseColor");
    }

    /**
     * get render pass by renderType
     * @param passType 
     * @returns 
     */
    public getPass(passType: PassType) {
        return this._shader.getSubShaders(passType);
    }

    /**
     * get all color render pass
     * @returns 
     */
    public getAllPass(): RenderShaderPass[] {
        return this._shader.getSubShaders(PassType.COLOR);
    }

    /**
     * clone one material
     * @returns Material
     */
    public clone() {
        let newMat = new Material();
        newMat.shader = this.shader.clone();
        return newMat;
    }


    /** Release this material's shader and clear its identifying fields. */
    destroy(force: boolean) {
        this.name = null;
        this.instanceID = null;
        this._shader.destroy(force);
        this._shader = null;
    }


    /** Set a shader define flag on this material's shader. */
    public setDefine(define: string, value: boolean) {
        this.shader.setDefine(define, value);
    }

    /** Get the value of a shader define flag. */
    public getDefine(define: string): boolean {
        return this.shader.getDefine(define);
    }

    /** Bind a texture to the named shader property. */
    public setTexture(propertyName: string, texture: Texture) {
        this._shader.setTexture(propertyName, texture);
    }

    /** Bind a storage GPU buffer to the named shader property. */
    public setStorageBuffer(propertyName: string, buffer: StorageGPUBuffer) {
        this._shader.setStorageBuffer(propertyName, buffer);
    }

    /** Bind a uniform GPU buffer to the named shader property. */
    public setUniformBuffer(propertyName: string, buffer: UniformGPUBuffer) {
        this._shader.setStorageBuffer(propertyName, buffer);
    }


    /** Set a float uniform on the named shader property. */
    public setUniformFloat(propertyName: string, value: number) {
        this._shader.setUniformFloat(propertyName, value);
    }

    /** Set a 32-bit integer uniform on the named shader property. */
    public setUniformInt32(propertyName: string, value: number) {
        this._shader.setUniformInt32(propertyName, value);
    }

    /** Set a Vector2 uniform on the named shader property. */
    public setUniformVector2(propertyName: string, value: Vector2) {
        this._shader.setUniformVector2(propertyName, value);
    }

    /** Set a Vector3 uniform on the named shader property. */
    public setUniformVector3(propertyName: string, value: Vector3) {
        this._shader.setUniformVector3(propertyName, value);
    }

    /** Set a Vector4 uniform on the named shader property. */
    public setUniformVector4(propertyName: string, value: Vector4) {
        this._shader.setUniformVector4(propertyName, value);
    }

    /** Set a color uniform on the named shader property. */
    public setUniformColor(propertyName: string, value: Color) {
        this._shader.setUniformColor(propertyName, value);
    }

    /** Get the float value of the named uniform. */
    public getUniformFloat(str: string) {
        return this._shader.getUniform(str).data;
    }

    /** Get the 32-bit integer value of the named uniform. */
    public getUniformInt32(str: string) {
        return this._shader.getUniform(str).data;
    }

    /** Get the Vector2 value of the named uniform. */
    public getUniformV2(str: string): Vector2 {
        return this._shader.getUniformVector2(str);
    }

    /** Get the Vector3 value of the named uniform. */
    public getUniformV3(str: string): Vector3 {
        return this._shader.getUniformVector3(str);
    }

    /** Get the Vector4 value of the named uniform. */
    public getUniformV4(str: string): Vector4 {
        return this._shader.getUniformVector4(str);
    }

    /** Get the color value of the named uniform. */
    public getUniformColor(str: string) {
        return this._shader.getUniformColor(str);
    }

    /** Get the texture bound to the named shader property. */
    public getTexture(str: string) {
        return this._shader.getTexture(str);
    }

    /** Get the storage buffer bound to the named shader property. */
    public getStorageBuffer(str: string) {
        return this._shader.getStorageBuffer(str);
    }

    /** Get the struct storage buffer bound to the named shader property. */
    public getStructStorageBuffer(str: string) {
        return this._shader.getStructStorageBuffer(str);
    }

    /** Get the uniform buffer bound to the named shader property. */
    public getUniformBuffer(str: string) {
        return this._shader.getUniformBuffer(str);
    }

    /** Upload pending uniform changes to the GPU. */
    public applyUniform() {
        this._shader.applyUniform();
    }

    /**
     * Re-bucket every renderer holding this material into the right
     * EntityCollect queue (opaque vs transparent). Subclass alphaMode
     * setters call this after flipping pass.renderOrder so live
     * `alphaMode = 'BLEND'` ↔ `'HASH'` toggles take effect on the
     * frame they fire — no rebuild required.
     *
     * Walks `Reference.getReference(this)` (the material→user back-
     * channel populated by RenderNode `set materials`) and calls
     * `refreshRenderClassification()` on each user. The duck-type
     * check avoids importing RenderNode here (cyclic).
     */
    protected _notifyRenderClassificationDirty() {
        const refs = Reference.getInstance().getReference(this);
        if (!refs) return;
        refs.forEach((_, target) => {
            if (target && typeof (target as any).refreshRenderClassification === 'function') {
                (target as any).refreshRenderClassification();
            }
        });
    }
}