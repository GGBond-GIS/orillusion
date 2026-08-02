/**
 * Composite shader for the Dual Depth Peeling resolve feature.
 *
 * Reads `_DDPFront` (premultiplied RGBA16F — the front-most peeled
 * layer's `(rgb·α, α)`) and outputs it directly. Hardware blend
 * `srcFactor=ONE, dstFactor=ONE_MINUS_SRC_ALPHA` then does the over
 * operator against the existing `_ColorBuffer`:
 *
 *   final = front.rgb·1 + bg·(1 - front.a)
 *
 * At α=1 → front.a=1 → bg multiplied by 0 → fully opaque.
 * At α<1 → front.a<1 → bg shows through.
 *
 * Stage 3 only composes the front layer. When stage 5 expands the
 * renderer to N-iteration peeling with a back-color accum, this
 * shader gains a second `_DDPBack` sample and the formula extends to
 * `final = front + (1 - front.a) · back + bg · (1 - front.a - back.a)`.
 *
 * @internal
 */
export const DDPResolveShader: string = /*wgsl*/ `
@group(0) @binding(0) var frontSampler: sampler;
@group(0) @binding(1) var frontTexture: texture_2d<f32>;

struct VsOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Big-triangle fullscreen vertex layout — three vertices cover the
// viewport without needing a vertex buffer.
@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VsOut {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 3.0,  1.0),
    );
    let p = positions[vid];
    var out: VsOut;
    out.pos = vec4<f32>(p, 0.0, 1.0);
    out.uv = (p * 0.5 + vec2<f32>(0.5, 0.5)) * vec2<f32>(1.0, -1.0) + vec2<f32>(0.0, 1.0);
    return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let front = textureSample(frontTexture, frontSampler, in.uv);
    return front;
}
`;
