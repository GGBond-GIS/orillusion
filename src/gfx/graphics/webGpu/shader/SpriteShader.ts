import { GPUCullMode } from "../WebGPUConst";
import { Texture } from "../core/texture/Texture";
import { RenderShaderPass } from "./RenderShaderPass";
import { BlendMode } from "../../../../materials/BlendMode";
import { Color } from "../../../../math/Color";
import { Vector2 } from "../../../../math/Vector2";
import { Vector4 } from "../../../../math/Vector4";
import { RegisterShader } from "../../../../util/SerializeDecoration";
import { Shader } from "./Shader";

/**
 * Default shader backing `SpriteMaterial`. One COLOR pass, no shadow /
 * reflection / GI / lighting — sprites are a flat textured quad in
 * world space.
 * @group GFX
 */
@RegisterShader
export class SpriteShader extends Shader {

    constructor() {
        super();
        let colorPass = new RenderShaderPass('Sprite', 'Sprite');
        colorPass.setShaderEntry(`VertMain`, `FragMain`);
        this.addRenderPass(colorPass);

        let state = colorPass.shaderState;
        state.acceptShadow = false;
        state.castShadow = false;
        state.receiveEnv = false;
        state.acceptGI = false;
        state.useLight = false;
        state.cullMode = GPUCullMode.none;
        state.depthWriteEnabled = false;
        colorPass.blendMode = BlendMode.NORMAL;

        this.setDefault();
    }

    /**
     * Apply the default uniform values for the sprite shader.
     */
    public setDefault() {
        this.setUniformColor(`color`, new Color(1, 1, 1, 1));
        this.setUniformVector4(`uvRect`, new Vector4(0, 0, 1, 1));
        this.setUniformVector2(`size`, new Vector2(1, 1));
        this.setUniformVector2(`pivot`, new Vector2(0.5, 0.5));
        this.setUniformFloat(`distanceInvariant`, 0.0);
        this.setUniformFloat(`cornerRadius`, 0.0);
        this.setUniformFloat(`spritePad0`, 0.0);
        this.setUniformFloat(`spritePad1`, 0.0);
    }

    /**
     * The base color texture of the sprite.
     */
    public set baseMap(value: Texture) {
        this.setTexture(`baseMap`, value);
    }

    public get baseMap(): Texture {
        return this.getTexture(`baseMap`);
    }
}
