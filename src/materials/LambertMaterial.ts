
import { Lambert_shader, Material, PassType, RenderShaderPass, Shader } from '..';
import { ShaderLib } from '../assets/shader/ShaderLib';
import { Engine3D } from '../Engine3D';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { Color } from '../math/Color';
import { Vector4 } from '../math/Vector4';
import { BlendMode } from './BlendMode';
import { AlphaMode } from './LitMaterial';


/**
 * Lambert Material
 * A non glossy surface material without specular highlights.
 * @group Material
 */
export class LambertMaterial extends Material {
    private _alphaMode: AlphaMode = 'OPAQUE';

    /**
     * @constructor
     */
    constructor(ctx?: Context3D) {
        super();
        let colorPass = new RenderShaderPass(`LambertShader`, `LambertShader`);
        colorPass.setShaderEntry(`VertMain`, `FragMain`)
        colorPass.passType = PassType.COLOR;
        colorPass.setUniformVector4(`transformUV1`, new Vector4(0, 0, 1, 1));
        colorPass.setUniformVector4(`transformUV2`, new Vector4(0, 0, 1, 1));
        colorPass.setUniformColor(`baseColor`, new Color(1, 1, 1, 1));
        colorPass.setUniformFloat(`alphaCutoff`, 0.5);

        let shaderState = colorPass.shaderState;
        shaderState.acceptShadow = false;
        shaderState.castShadow = false;
        shaderState.receiveEnv = false;
        shaderState.acceptGI = false;
        // Lambert_shader.ts iterates cluster lights via getCluster() /
        // getLight() to compute the diffuse term. `useLight=false`
        // gates the cluster-light buffer binding; turning it off here
        // meant the shader looped over a never-bound buffer, every
        // light.lightType compared to garbage data, and the
        // accumulator stayed at zero — so Lambert spheres came out
        // grey (only the env irradiance contributed). Lambert needs
        // lights, leave useLight at its `true` default.

        let newShader = new Shader();
        newShader.addRenderPass(colorPass);
        this.shader = newShader;
        this.baseMap = Engine3D.resFor(ctx).grayTexture;
    }

    /** glTF-aligned alpha handling. Mirrors LitMaterial.alphaMode so
     *  Lambert-shaded transparency uses the same routing rules. */
    public get alphaMode(): AlphaMode {
        return this._alphaMode;
    }

    /** Sets the glTF alpha mode and reconfigures blend/depth/define state. */
    public set alphaMode(mode: AlphaMode) {
        // Idempotent guard: setting the same mode twice in a row was
        // running the full state-mutation switch + firing
        // _notifyRenderClassificationDirty on every renderer holding
        // this material. With Sample_WBOIT's 27-sphere lattice, a
        // GUI mode flip was triggering 27 × 2 = 54 reclassifications
        // even when most of those were no-ops. Skipping the no-op
        // path collapses the cost to the spheres that actually needed
        // a queue change.
        if (this._alphaMode === mode) return;
        this._alphaMode = mode;
        const colorPass = this.shader.getDefaultColorShader();
        const state = colorPass.shaderState;
        switch (mode) {
            case 'OPAQUE':
                state.transparent = false;
                state.alphaToCoverageEnabled = false;
                state.blendMode = BlendMode.NONE;
                state.depthWriteEnabled = true;
                colorPass.setDefine('USE_ALPHAHASH', false);
                colorPass.renderOrder = 0;
                break;
            case 'MASK':
                state.transparent = false;
                state.alphaToCoverageEnabled = true;
                state.blendMode = BlendMode.NONE;
                state.depthWriteEnabled = true;
                colorPass.setDefine('USE_ALPHAHASH', false);
                colorPass.renderOrder = 0;
                break;
            case 'HASH':
                state.transparent = false;
                state.alphaToCoverageEnabled = false;
                state.blendMode = BlendMode.NONE;
                state.depthWriteEnabled = true;
                colorPass.setDefine('USE_ALPHAHASH', true);
                colorPass.renderOrder = 0;
                break;
            case 'BLEND':
                state.transparent = true;
                state.alphaToCoverageEnabled = false;
                state.blendMode = BlendMode.NORMAL;
                state.depthWriteEnabled = false;
                colorPass.setDefine('USE_ALPHAHASH', false);
                colorPass.renderOrder = 3000;
                break;
        }
        this._notifyRenderClassificationDirty();
    }

    /**
     * set base color map texture
     */
    public set baseMap(tex: Texture) {
        this.shader.setTexture(`baseMap`, tex);
    }

    /**
     * get base color map texture
     */
    public get baseMap() {
        return this.shader.getTexture(`baseMap`);
    }

    /**
     * set base color (tint color)
     */
    public set baseColor(color: Color) {
        this.shader.setUniformColor(`baseColor`, color);
    }

    /**
     * get base color (tint color)
     */
    public get baseColor() {
        return this.shader.getUniformColor("baseColor");
    }

    /**
     * set environment texture, usually referring to cubemap
     */
    public set envMap(texture: Texture) {
        //not need env texture
    }

    /**
     * @internal
     * set shadow map
     */
    public set shadowMap(texture: Texture) {
        //not need shadowMap texture
    }
}