import { RenderShaderPass } from '../../gfx/graphics/webGpu/shader/RenderShaderPass';
import { PassType } from '../../gfx/renderJob/passRenderer/state/PassType';
import { Vector3 } from '../../math/Vector3';

/**
 * @internal
 * CastShadowMaterialPass
 */
export class CastShadowMaterialPass extends RenderShaderPass {
    constructor() {
        super(`shadowCastMap_vert`, `directionShadowCastMap_frag`);
        this.passType = PassType.SHADOW;
        // Include the fragment stage explicitly (both entry points = "main").
        // Previously fsEntryPoint was unset, producing a vertex-only pipeline.
        // On Dawn's D3D12 backend that path appears to silently skip the depth
        // write (no validation error, adapter is fine, features present), so
        // the shadow map stayed at its cleared far value and every receiver
        // tested "fully lit" → no shadows on Windows. Metal handled the same
        // pipeline correctly, which is why Mac worked. An explicit no-output
        // fragment stage works on both backends.
        this.setShaderEntry("main", "main");
        this.setUniformFloat("cameraFar", 5000);
        this.setUniformVector3("lightWorldPos", Vector3.ZERO);

        this.shaderState.receiveEnv = false;
        this.shaderState.castShadow = false;
        this.shaderState.acceptShadow = false;

        // Directional shadow cast uses the traditional front-face path
        // (cullMode inherited from ShaderState default = back, i.e. renders
        // front faces). This is the common shadow-cast convention.
        //
        // Why not back-face (cullMode='front'), despite it eliminating
        // self-shadow moire: back-face cast stores the far side of each
        // caster in the shadow map, so any caster whose geometry extends
        // below / past its visual "base" on the receiver produces
        // peter-panning — the stored depth sits "behind" the receiver and
        // the receiver fragment compares as lit when it should be
        // shadowed. This is scene-authoring dependent (buried meshes,
        // intersecting receivers, clipping-plane geometry) and users
        // cannot reasonably be expected to re-author every asset to
        // avoid it. Front-face cast is robust to scene content and
        // relies on the receiver-side pipeline to hide moire:
        //   - Hardware LINEAR compare (Depth2DTextureArray).
        //   - Tent-weighted PCF 3x3.
        //   - Hybrid NoL + screen-space slope bias, capped at 32x
        //     baseline.
        //   - Aggressive normalBias (ShadowBiasCalculator).
        //
        // Trade-off: narrow self-shadow seams may still appear on
        // heavily tilted receivers under extreme main-camera zoom. If
        // a specific material needs back-face cast (e.g. thick solid
        // architecture that never embeds into receivers), add a
        // per-material override in a follow-up — default stays safe.
        //
        // Rasterizer depth-bias stays disabled. For depth32float the
        // WebGPU spec says depthBias * r uses an implementation-defined r
        // (smallest representable depth delta at 1.0). Metal treats r as
        // ~1.19e-7 (f32 ULP at 1.0), Dawn D3D12 historically used integer
        // depthBias literally for float formats — the same value saturates
        // depth to 1.0 on Windows but is harmless on Mac. Shader-side
        // `shadowBias / NoL` is backend-portable, so rasterizer bias is
        // redundant.
        this.shaderState.depthBias = 0;
        this.shaderState.depthBiasSlopeScale = 0;
        this.shaderState.depthBiasClamp = 0;

        this.setDefine(`USE_ALPHACUT`, true);
        // this.alphaCutoff = 0.5 ;
    }
}
