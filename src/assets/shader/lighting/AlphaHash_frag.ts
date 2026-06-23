/**
 * Alpha Hash (stochastic transparency) — Wyman 2017,
 * "Hashed Alpha Testing"
 * https://casual-effects.com/research/Wyman2017Hashed/index.html
 *
 * Produces a per-pixel binary discard threshold derived from a spatial
 * hash of world position. Combined with TAA's sub-pixel camera jitter
 * (the projection matrix is shifted each frame, so the same screen
 * pixel sees a slightly different world position frame-to-frame), the
 * threshold also varies temporally — and TAA's history blend averages
 * the resulting noise into a smooth alpha-correct image over a few
 * frames.
 *
 * Properties vs. alpha blend / WBOIT:
 *   - depth-correct (writes depth) — interacts properly with shadows,
 *     SSR, SSAO, transmission G-buffer, etc.
 *   - no sorting required
 *   - converged image is identical to true alpha
 *   - downside: single-frame output is dithered noise; needs TAA
 *
 * Shader contract: shaders that include this file should call
 *   if (ORI_ShadingInput.BaseColor.a < alphaHashThreshold(worldPos)) {
 *       discard;
 *   }
 * after BaseColor is finalised.
 *
 * @internal
 */
export let AlphaHash_frag: string = /*wgsl*/ `
  fn alphaHash3D(p: vec3<f32>) -> f32 {
      // 3-component fract-sin hash — cheap and produces a uniform
      // distribution across [0,1] with no banding once TAA averages
      // adjacent samples. The constants are the standard "shadertoy"
      // integers; any pseudo-random hash works as long as it's
      // deterministic per (worldPos, frame).
      return fract(sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453);
  }
`
