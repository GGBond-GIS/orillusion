/**
 * Branded handle types for transient resources. A handle is what
 * `b.declareTexture(name, desc)` and friends return from `setup()`;
 * it carries the resource's logical name but **never** the underlying
 * GPU resource. Pass authors thread the handle into subsequent
 * `b.read(handle, hint)` / `b.write(handle, hint)` / `b.readWrite(handle, hint)`
 * calls so that the compiler can type-check the access target
 * separately from raw string lookups in the pool.
 *
 * Branding via `unique symbol` properties prevents an accidental
 * `b.read(textureHandle as BufferHandle, ...)` mix-up at compile time.
 * The brand is phantom — there's no runtime field, so the in-memory
 * representation is just `{ name }`.
 *
 * @group Graph
 */

declare const __texBrand: unique symbol;
declare const __bufBrand: unique symbol;

/**
 * Opaque handle to a transient (or imported) texture resource owned by
 * the {@link RenderGraph}. Pass it to `b.read` / `b.write` /
 * `b.readWrite` to declare an access, then resolve to the actual
 * {@link RenderTexture} via `ctx.getTexture(handle.name)` inside
 * `execute()`.
 *
 * @group Graph
 */
export interface TextureHandle {
    readonly [__texBrand]: void;
    readonly name: string;
}

/**
 * Opaque handle to a transient (or imported) buffer resource owned by
 * the {@link RenderGraph}. Symmetric with {@link TextureHandle}.
 *
 * @group Graph
 */
export interface BufferHandle {
    readonly [__bufBrand]: void;
    readonly name: string;
}

/**
 * Internal helper to mint a TextureHandle. The cast is the price for
 * the phantom brand; only the builder should call this.
 *
 * @internal
 */
export function makeTextureHandle(name: string): TextureHandle {
    return { name } as TextureHandle;
}

/**
 * Internal helper to mint a BufferHandle. See {@link makeTextureHandle}.
 *
 * @internal
 */
export function makeBufferHandle(name: string): BufferHandle {
    return { name } as BufferHandle;
}

/**
 * Narrow a {@link TextureHandle} / {@link BufferHandle} or bare string
 * down to the underlying resource name. Used internally by the builder
 * `read` / `write` overloads so the implementation can take a single
 * code path regardless of which form the caller used.
 *
 * @internal
 */
export function resourceName(target: string | TextureHandle | BufferHandle): string {
    return typeof target === 'string' ? target : target.name;
}
