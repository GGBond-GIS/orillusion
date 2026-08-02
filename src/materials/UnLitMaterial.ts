import { Engine3D } from '../Engine3D';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { Color } from '../math/Color';
import { BlendMode } from './BlendMode';
import { AlphaMode } from './LitMaterial';
import { Material } from './Material';
import { UnLitShader } from '..';

/**
 * Unlit Material
 * A non glossy surface material without specular highlights.
 * @group Material
 */
export class UnLitMaterial extends Material {
    private _alphaMode: AlphaMode = 'OPAQUE';

    /**
     * @constructor
     */
    constructor(ctx?: Context3D) {
        super();
        this.shader = new UnLitShader();
        // default value
        this.baseMap = Engine3D.resFor(ctx).whiteTexture;
    }

    /** glTF-aligned alpha handling. Mirrors LitMaterial.alphaMode so
     *  unlit-shaded transparency uses the same routing rules. */
    public get alphaMode(): AlphaMode {
        return this._alphaMode;
    }

    /** Sets the glTF alpha mode and reconfigures blend/depth/define state. */
    public set alphaMode(mode: AlphaMode) {
        // Idempotent guard — see LambertMaterial.alphaMode for rationale.
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
                // UnLit shader has its own built-in alphaCutoff discard
                // (see UnLit.ts). MASK just configures state — no
                // shader-level USE_ALPHACUT toggle needed here.
                state.transparent = false;
                state.alphaToCoverageEnabled = true;
                state.blendMode = BlendMode.NONE;
                state.depthWriteEnabled = true;
                colorPass.setDefine('USE_ALPHAHASH', false);
                colorPass.renderOrder = 0;
                break;
            case 'HASH':
                // Stochastic transparency: routes through the opaque
                // queue with per-fragment hash discard. Pairs with TAA
                // for temporal convergence. See AlphaHash_frag.
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
                // Same EntityCollect routing rule as LitMaterial:
                // alphaMode='BLEND' → renderOrder=3000 → transparent
                // queue. NORMAL blendMode itself doesn't bump
                // renderOrder (it's shared with discard sprites).
                colorPass.renderOrder = 3000;
                break;
        }
        // Live alphaMode toggles change which EntityCollect bucket
        // attached renderers should be in. See LitMaterial setter.
        this._notifyRenderClassificationDirty();
    }

    /** Sets the base color map texture. */
    public set baseMap(texture: Texture) {
        this.shader.setTexture(`baseMap`, texture);
    }

    /** Gets the base color map texture. */
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
