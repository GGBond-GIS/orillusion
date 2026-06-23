import { Engine3D } from '../Engine3D';
import { Context3D } from '../gfx/graphics/webGpu/Context3D';
import { Texture } from '../gfx/graphics/webGpu/core/texture/Texture';
import { RenderShaderPass } from '../gfx/graphics/webGpu/shader/RenderShaderPass';
import { UnLitTexArrayShader } from '../loader/parser/prefab/mats/shader/UnLitTexArrayShader';
import { Color } from '../math/Color';
import { Vector4 } from '../math/Vector4';
import { Material } from './Material';

/**
 * Unlit Material
 * A non glossy surface material without specular highlights.
 * @group Material
 */
export class UnLitTexArrayMaterial extends Material {
    /**
     * @constructor
     */
    constructor(ctx?: Context3D) {
        super();
        this.shader = new UnLitTexArrayShader();
        // default value
        this.baseMap = Engine3D.resFor(ctx).whiteTexture;
    }

    /** Sets the base color map texture array. */
    public set baseMap(texture: Texture) {
        this.shader.setTexture(`baseMap`, texture);
    }

    /** Gets the base color map texture array. */
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

    // /**
    //  * set environment texture, usually referring to cubemap
    //  */
    // public set envMap(texture: Texture) {
    //     //not need env texture
    // }

    /**
     * @internal
     * set shadow map
     */
    public set shadowMap(texture: Texture) {
        //not need shadowMap texture
    }
}
