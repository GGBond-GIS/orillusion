import { ShaderLib } from '../assets/shader/ShaderLib';
import { MirrorShader as MirrorShaderSource } from '../assets/shader/materials/MirrorShader';
import { Engine3D } from '../Engine3D';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { GPUCullMode } from '../gfx/graphics/webGpu/WebGPUConst';
import { RenderShaderPass } from '../gfx/graphics/webGpu/shader/RenderShaderPass';
import { Shader } from '../gfx/graphics/webGpu/shader/Shader';
import { PassType } from '../gfx/renderJob/passRenderer/state/PassType';
import { Color } from '../math/Color';
import { Vector4 } from '../math/Vector4';
import { Material } from './Material';

/**
 * @internal
 *
 * Shader subclass owning the COLOR pass for {@link MirrorMaterial}.
 * Adds the pass in the constructor (mirroring `UnLitShader`) so the
 * material's `set shader` setter sees a non-empty `passShader` map
 * and can resolve `getDefaultShaders()[0]` without throwing.
 */
class MirrorRenderShader extends Shader {
    constructor() {
        super();
        ShaderLib.register('MirrorShader', MirrorShaderSource);
        const colorPass = new RenderShaderPass('MirrorShader', 'MirrorShader');
        colorPass.passType = PassType.COLOR;
        colorPass.setShaderEntry('VertMain', 'FragMain');
        this.addRenderPass(colorPass);

        const ss = colorPass.shaderState;
        ss.acceptShadow = false;
        ss.castShadow = false;
        ss.receiveEnv = false;
        ss.acceptGI = false;
        ss.useLight = false;
        // The captured RT already contains a fully shaded scene; the
        // mirror surface only needs to sample it. Cull the back face so
        // the underside (which a below-mirror capture camera would see)
        // doesn't draw into ColorPass and double-fill the floor.
        ss.cullMode = GPUCullMode.back;

        // `UnLitMaterialUniform_frag` declares MaterialUniform with these
        // four fields; uniforms must be set in the same order so the
        // packed uniform-buffer layout matches the shader's struct.
        this.setUniformVector4('transformUV1', new Vector4(0, 0, 1, 1));
        this.setUniformVector4('transformUV2', new Vector4(0, 0, 1, 1));
        this.setUniformColor('baseColor', new Color(1, 1, 1, 1));
        this.setUniformFloat('alphaCutoff', 0);
    }
}

/**
 * Planar-mirror material. Samples a render target (typically the
 * output of a {@link SceneCaptureCameraComponent} attached to a
 * mirror-image of the main camera) in screen space, producing a
 * per-pixel planar reflection.
 *
 * Pipeline expectations
 * ---------------------
 *
 * The caller is responsible for:
 *
 * 1. Setting up a second {@link Camera3D} that mirrors the main camera
 *    across the surface plane (e.g. y=0 for a horizontal floor) and
 *    aiming it at the mirrored look-at target with a flipped up vector.
 * 2. Attaching a {@link SceneCaptureCameraComponent} to that camera
 *    object so the scene is rendered into an RT once per frame, with
 *    `excludeMask` set so the surface itself is skipped.
 * 3. Binding the resulting capture texture into this material via
 *    {@link MirrorMaterial.mirrorMap} once the capture pass has run
 *    at least once (the SceneCaptureCameraComponent allocates its RT
 *    lazily).
 *
 * The surface's UVs are ignored — sampling is screen-space — so any
 * geometry can be used (planes, terrains, irregular puddles).
 *
 * @group Material
 */
export class MirrorMaterial extends Material {
    /** Creates the material and binds a white placeholder until a capture RT is wired in. */
    constructor(_ctx?: Context3D) {
        super();
        this.shader = new MirrorRenderShader();
        // Default the capture binding to the engine's shared white
        // texture so the material renders cleanly as a flat tint until
        // the user wires the real capture RT in. Without this, the
        // unbound `mirrorMap` would either produce a validation
        // failure on the first draw or sample uninitialized device
        // memory.
        const res = Engine3D.resFor(_ctx);
        this.mirrorMap = res.whiteTexture;
    }

    /** Capture render target sampled in screen space. Bind the texture
     *  produced by your mirror-camera's {@link SceneCaptureCameraComponent.getCaptureTexture}
     *  here. Defaults to a white placeholder. */
    public set mirrorMap(texture: Texture) {
        this.shader.setTexture('mirrorMap', texture);
    }

    /** Gets the capture render target sampled in screen space. */
    public get mirrorMap(): Texture {
        return this.shader.getTexture('mirrorMap');
    }

    /** Tint multiplied into the sampled reflection color (alpha
     *  ignored — the surface is opaque). Default white = unit
     *  passthrough. Use a slight desaturation / dim to read as
     *  "polished surface" rather than a 1:1 photo mirror. */
    public set baseColor(color: Color) {
        this.shader.setUniformColor('baseColor', color);
    }

    /** Gets the tint multiplied into the sampled reflection color. */
    public get baseColor(): Color {
        return this.shader.getUniformColor('baseColor');
    }
}
