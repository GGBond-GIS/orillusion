import { DirectLight } from '../../../../components/lights/DirectLight';
import { PointLight } from '../../../../components/lights/PointLight';
import { SpotLight } from '../../../../components/lights/SpotLight';

/**
 * @internal
 * RFC-003 Layer C — auto bias derivation.
 *
 * shadowBias: NDC depth offset, sampled as `depthRef - shadowBias`.
 * normalBias: world-space receiver offset along the surface normal, applied
 * in the shader as `worldPos + N * normalBias` before transforming to light space.
 *
 * Auto formulas use texelSize-relative defaults so changing shadow map
 * resolution or frustum extent does not require re-tuning bias.
 *
 * @group GFX
 */
export class ShadowBiasCalculator {

    /**
     * Resolve per-cascade NDC depth bias for a directional light's cascade.
     * Returns a value suitable for `depthRef - shadowBias` in the shader.
     */
    static resolveDirectShadowBias(light: DirectLight, cascadeIndex: number): number {
        const baseline = ShadowBiasCalculator.directBaselineBias(light);
        const scale = ShadowBiasCalculator.directCascadeScale(light, cascadeIndex);
        return baseline * scale;
    }

    /**
     * Resolve per-cascade world-space normal bias for a directional light.
     * Same value across all cascades; smaller cascades naturally have less
     * acne so a single world-space offset works.
     */
    static resolveDirectNormalBias(light: DirectLight, cascadeIndex: number): number {
        const baseline = ShadowBiasCalculator.directBaselineNormalBias(light);
        const scale = ShadowBiasCalculator.directCascadeScale(light, cascadeIndex);
        return baseline * scale;
    }

    /**
     * Resolve point light shadow bias (world-space distance offset).
     */
    static resolvePointShadowBias(light: PointLight | SpotLight, pointShadowMapSize: number): number {
        const v = (light as any)._shadowBias;
        if (typeof v === 'number') return v;
        // Cube texel angular size = 2/mapSize rad; at distance r its footprint
        // perpendicular to the face direction spans (2*r/mapSize). Coefficient
        // 0.5 makes the baseline = half a texel footprint at worst-case
        // distance (len=range), which matches the analytic receiver-plane
        // depth variation inside one texel at perpendicular view (NoL=1).
        // Shader amplifies by 1/NoL for grazing surfaces.
        const texelSize = (2 * (light.lightData.range || 1)) / Math.max(pointShadowMapSize, 1);
        return texelSize * 0.5;
    }

    /**
     * Resolve point light normal bias (world-space distance offset).
     */
    static resolvePointNormalBias(light: PointLight | SpotLight, pointShadowMapSize: number): number {
        const v = (light as any)._normalBias;
        if (typeof v === 'number') return v;
        const texelSize = (2 * (light.lightData.range || 1)) / Math.max(pointShadowMapSize, 1);
        return texelSize * 0.05;
    }

    private static directBaselineBias(light: DirectLight): number {
        const v = (light as any)._shadowBias;
        if (typeof v === 'number') return v;
        // Directional shadow stays on front-face rasterization (supports single-
        // sided terrain / planes / grass blades), so bias carries texel
        // quantization + fp-precision margin. Shader adds dpdx/dpdy slope on
        // top for grazing amplification, so this is a pure quantization floor.
        // Use max(|extentX|, |extentY|) — a non-square ortho frustum (common
        // with sphere-fit + texel snap) otherwise mis-sizes the texel.
        const cam = (light.enableCSM && light.csmShadowCamera?.length ? light.csmShadowCamera[0] : light.shadowCamera);
        if (!cam) return 0.0005;
        const extent = Math.max(Math.abs(cam.right - cam.left), Math.abs(cam.top - cam.bottom));
        const depth = Math.max(cam.far - cam.near, 1e-6);
        const texelSize = extent / Math.max(light.shadowMapWidth || 1, 1);
        return (texelSize * 1.5) / depth;
    }

    private static directBaselineNormalBias(light: DirectLight): number {
        const v = (light as any)._normalBias;
        if (typeof v === 'number') return v;
        const cam = (light.enableCSM && light.csmShadowCamera?.length ? light.csmShadowCamera[0] : light.shadowCamera);
        if (!cam) return 0.05;
        const extent = Math.max(Math.abs(cam.right - cam.left), Math.abs(cam.top - cam.bottom));
        const texelSize = extent / Math.max(light.shadowMapWidth || 1, 1);
        // 2x texel offset along the receiver normal before shadow sample.
        // Directional cast now renders front faces (for peter-panning
        // resistance), so the receiver is in the shadow map at its own
        // depth — self-shadow moire is suppressed primarily by pushing
        // the sample point along the normal so the compare is done
        // against a neighbouring texel's depth instead of the texel that
        // contains the receiver itself. Larger than the typical 0.5
        // because our scenes use a wider range of lighting angles in
        // tests; reduce per-light via light.normalBias if needed.
        return texelSize * 2.0;
    }

    /**
     * Per-cascade scale factor relative to cascade 0. Larger cascades cover
     * more world space per texel, so they need proportionally more bias to
     * avoid acne. Cascade 0 returns 1.0.
     */
    private static directCascadeScale(light: DirectLight, cascadeIndex: number): number {
        if (!light.enableCSM || !light.csmShadowCamera || light.csmShadowCamera.length <= cascadeIndex) return 1.0;
        const base = light.csmShadowCamera[0];
        const cur = light.csmShadowCamera[cascadeIndex];
        if (!base || !cur) return 1.0;
        const baseW = base.right - base.left;
        const curW = cur.right - cur.left;
        if (baseW <= 0) return 1.0;
        return curW / baseW;
    }
}
