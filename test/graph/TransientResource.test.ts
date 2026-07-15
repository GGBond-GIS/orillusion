import { test, end, expect } from '../util'
import {
    LifetimeAnalyzer,
    RenderGraphPass,
    TransientResourceRegistry,
    computeBucketKey,
    resolveSizeSpec,
    roundUpToPow2,
    type RenderGraphBuilder,
    type RenderGraphPassContext,
    type ResourceLifetime,
    type TextureDesc,
    type TextureHandle,
    type BufferDesc,
} from '@orillusion/core'

// -----------------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------------

interface FakeAccess {
    reads?: string[]
    writes?: string[]
    lifetimeReads?: string[]
    lifetimeWrites?: string[]
}

class FakePass extends RenderGraphPass {
    public readonly name: string
    constructor(name: string, public readonly access: FakeAccess) {
        super()
        this.name = name
    }
    public setup(_b: RenderGraphBuilder): void { /* setup is bypassed; arrays seeded manually below */ }
    public execute(_ctx: RenderGraphPassContext): void { /* no-op */ }
}

/** Build a (passes, byName) pair with reads/writes/_lifetime* pre-stamped,
 *  bypassing the real RenderGraph.add wiring. Lets us drive the analyzer
 *  in isolation. */
function makePasses(specs: Array<{ name: string } & FakeAccess>): {
    order: string[]
    byName: Map<string, RenderGraphPass>
} {
    const order: string[] = []
    const byName = new Map<string, RenderGraphPass>()
    for (const s of specs) {
        const p = new FakePass(s.name, s)
        ;(p as any).reads = Object.freeze([...(s.reads ?? [])])
        ;(p as any).writes = Object.freeze([...(s.writes ?? [])])
        ;(p as any).creates = Object.freeze([...(s.writes ?? [])])
        if (s.lifetimeReads) (p as any)._lifetimeReads = Object.freeze([...s.lifetimeReads])
        if (s.lifetimeWrites) (p as any)._lifetimeWrites = Object.freeze([...s.lifetimeWrites])
        byName.set(s.name, p)
        order.push(s.name)
    }
    return { order, byName }
}

function texDesc(overrides: Partial<TextureDesc> = {}): TextureDesc {
    return {
        format: 'rgba16float',
        width: 'screen',
        height: 'screen',
        ...overrides,
    }
}

const SCREEN: [number, number] = [1920, 1080]

// -----------------------------------------------------------------------------
// resolveSizeSpec
// -----------------------------------------------------------------------------

await test('resolveSizeSpec: numeric token passes through', async () => {
    expect(resolveSizeSpec(512, 1920)).toEqual(512)
})

await test('resolveSizeSpec: screen tokens divide canvas dim', async () => {
    expect(resolveSizeSpec('screen', 1920)).toEqual(1920)
    expect(resolveSizeSpec('screen/2', 1920)).toEqual(960)
    expect(resolveSizeSpec('screen/4', 1920)).toEqual(480)
    expect(resolveSizeSpec('screen/8', 1920)).toEqual(240)
})

await test('resolveSizeSpec: clamps to >= 1 px', async () => {
    expect(resolveSizeSpec('screen/8', 4)).toEqual(1)
})

// -----------------------------------------------------------------------------
// computeBucketKey + roundUpToPow2
// -----------------------------------------------------------------------------

await test('computeBucketKey: identical descs produce identical keys', async () => {
    const d = texDesc({ format: 'r8unorm', mipLevelCount: 2 })
    const a = computeBucketKey(d, 1920, 1080, GPUTextureUsage.TEXTURE_BINDING)
    const b = computeBucketKey(d, 1920, 1080, GPUTextureUsage.TEXTURE_BINDING)
    expect(a).toEqual(b)
})

await test('computeBucketKey: any attribute change isolates bucket', async () => {
    const base = texDesc()
    const k0 = computeBucketKey(base, 1920, 1080, GPUTextureUsage.TEXTURE_BINDING)
    const kFormat = computeBucketKey(texDesc({ format: 'rgba8unorm' }), 1920, 1080, GPUTextureUsage.TEXTURE_BINDING)
    const kSize = computeBucketKey(base, 960, 1080, GPUTextureUsage.TEXTURE_BINDING)
    const kSample = computeBucketKey(texDesc({ sampleCount: 4 }), 1920, 1080, GPUTextureUsage.TEXTURE_BINDING)
    const kUsage = computeBucketKey(base, 1920, 1080, GPUTextureUsage.STORAGE_BINDING)
    expect(k0 !== kFormat).toEqual(true)
    expect(k0 !== kSize).toEqual(true)
    expect(k0 !== kSample).toEqual(true)
    expect(k0 !== kUsage).toEqual(true)
})

await test('roundUpToPow2: typical sizes', async () => {
    expect(roundUpToPow2(1)).toEqual(1)
    expect(roundUpToPow2(2)).toEqual(2)
    expect(roundUpToPow2(3)).toEqual(4)
    expect(roundUpToPow2(1024)).toEqual(1024)
    expect(roundUpToPow2(1025)).toEqual(2048)
})

// -----------------------------------------------------------------------------
// TransientResourceRegistry
// -----------------------------------------------------------------------------

await test('TransientResourceRegistry: declareTexture stores entry + creator', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('SSAO', texDesc(), 'SSAOPass')
    const decl = r.get('SSAO')!
    expect(decl.name).toEqual('SSAO')
    expect(decl.kind).toEqual('texture')
    expect(decl.persistent).toEqual(false)
    expect(decl.creatorPass).toEqual('SSAOPass')
})

await test('TransientResourceRegistry: redeclaring same name throws', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('SSAO', texDesc(), 'PassA')
    let threw: Error | null = null
    try { r.declareTexture('SSAO', texDesc(), 'PassB') } catch (e) { threw = e as Error }
    if (!threw) throw new Error('expected single-creator error')
    expect(threw.message.includes('SSAO')).toEqual(true)
    expect(threw.message.includes('PassA')).toEqual(true)
})

await test('TransientResourceRegistry: recordAccessHint unions usage bits', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('Pyramid', texDesc(), 'PyramidPass')
    r.recordAccessHint('Pyramid', 'texture', 'storage', 'write')
    r.recordAccessHint('Pyramid', 'texture', 'sample', 'read')
    const u = r.hintUsageOf('Pyramid')
    expect((u & GPUTextureUsage.STORAGE_BINDING) !== 0).toEqual(true)
    expect((u & GPUTextureUsage.TEXTURE_BINDING) !== 0).toEqual(true)
    expect((u & GPUTextureUsage.COPY_SRC) !== 0).toEqual(true)
    expect((u & GPUTextureUsage.COPY_DST) !== 0).toEqual(true)
})

await test('TransientResourceRegistry: recordAccessHint on unknown name is no-op', async () => {
    const r = new TransientResourceRegistry()
    r.recordAccessHint('NotDeclared', 'texture', 'sample', 'read')
    expect(r.hintUsageOf('NotDeclared')).toEqual(0)
})

// -----------------------------------------------------------------------------
// LifetimeAnalyzer
// -----------------------------------------------------------------------------

await test('LifetimeAnalyzer: single-use resource gets [i, i] interval', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('X', texDesc(), 'P')
    r.recordAccessHint('X', 'texture', 'storage', 'write')
    const { order, byName } = makePasses([
        { name: 'A' },
        { name: 'P', writes: ['X'] },
        { name: 'B' },
    ])
    const lts = LifetimeAnalyzer.analyze(order, byName, r, SCREEN)
    const lt = lts.find(l => l.name === 'X')!
    expect(lt.firstUseIdx).toEqual(1)
    expect(lt.lastUseIdx).toEqual(1)
    expect(lt.persistent).toEqual(false)
})

await test('LifetimeAnalyzer: lifetime spans first writer to last reader', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('Y', texDesc(), 'Writer')
    r.recordAccessHint('Y', 'texture', 'attachment', 'write')
    r.recordAccessHint('Y', 'texture', 'sample', 'read')
    const { order, byName } = makePasses([
        { name: 'Writer', writes: ['Y'] },
        { name: 'Middle' },
        { name: 'Reader', reads: ['Y'] },
    ])
    const lt = LifetimeAnalyzer.analyze(order, byName, r, SCREEN).find(l => l.name === 'Y')!
    expect(lt.firstUseIdx).toEqual(0)
    expect(lt.lastUseIdx).toEqual(2)
    expect((lt.resolvedUsage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toEqual(true)
    expect((lt.resolvedUsage & GPUTextureUsage.TEXTURE_BINDING) !== 0).toEqual(true)
})

await test('LifetimeAnalyzer: persistent gets full [0, N-1] envelope', async () => {
    const r = new TransientResourceRegistry()
    // Synthesize an importExternalTexture-style declaration by hand.
    ;(r as any)._declarations.set('GBuffer', {
        name: 'GBuffer',
        kind: 'texture',
        desc: texDesc({ aliasable: false }),
        persistent: true,
        creatorPass: 'Adopter',
    })
    const { order, byName } = makePasses([
        { name: 'A' }, { name: 'B' }, { name: 'C' },
    ])
    const lt = LifetimeAnalyzer.analyze(order, byName, r, SCREEN).find(l => l.name === 'GBuffer')!
    expect(lt.persistent).toEqual(true)
    expect(lt.firstUseIdx).toEqual(0)
    expect(lt.lastUseIdx).toEqual(2)
})

await test('LifetimeAnalyzer: resolves screen/2 token against presentationSize', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('Half', texDesc({ width: 'screen/2', height: 'screen/4' }), 'P')
    r.recordAccessHint('Half', 'texture', 'storage', 'write')
    const { order, byName } = makePasses([{ name: 'P', writes: ['Half'] }])
    const lt = LifetimeAnalyzer.analyze(order, byName, r, SCREEN).find(l => l.name === 'Half')!
    expect(lt.resolvedWidth).toEqual(960)
    expect(lt.resolvedHeight).toEqual(270)
})

await test('LifetimeAnalyzer: explicit usage unions with hint usage', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('Z', texDesc({ usage: GPUTextureUsage.RENDER_ATTACHMENT }), 'P')
    r.recordAccessHint('Z', 'texture', 'sample', 'read')
    const { order, byName } = makePasses([
        { name: 'P', writes: ['Z'] },
        { name: 'R', reads: ['Z'] },
    ])
    const lt = LifetimeAnalyzer.analyze(order, byName, r, SCREEN).find(l => l.name === 'Z')!
    expect((lt.resolvedUsage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0).toEqual(true)
    expect((lt.resolvedUsage & GPUTextureUsage.TEXTURE_BINDING) !== 0).toEqual(true)
})

await test('LifetimeAnalyzer: _lifetimeReads widens envelope without appearing in reads', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('B', texDesc(), 'P')
    r.recordAccessHint('B', 'texture', 'attachment', 'write')
    const { order, byName } = makePasses([
        { name: 'P', writes: ['B'] },
        { name: 'Borrow', lifetimeReads: ['B'] }, // not in reads array
    ])
    const lt = LifetimeAnalyzer.analyze(order, byName, r, SCREEN).find(l => l.name === 'B')!
    expect(lt.firstUseIdx).toEqual(0)
    expect(lt.lastUseIdx).toEqual(1)
})

await test('LifetimeAnalyzer: orphan declaration (unused) is skipped with warning', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('Dead', texDesc(), 'P')
    r.recordAccessHint('Dead', 'texture', 'storage', 'write')
    // P does not actually write the resource (we omit it from writes array).
    const { order, byName } = makePasses([{ name: 'P' }])
    const lts = LifetimeAnalyzer.analyze(order, byName, r, SCREEN)
    // Should not include 'Dead' because it was never referenced.
    expect(lts.find(l => l.name === 'Dead')).toEqual(undefined)
})

await test('LifetimeAnalyzer: readWrite (same pass reads+writes) collapses to single idx', async () => {
    const r = new TransientResourceRegistry()
    r.declareTexture('M', texDesc(), 'P')
    r.recordAccessHint('M', 'texture', 'storage', 'write')
    r.recordAccessHint('M', 'texture', 'storage', 'read')
    const { order, byName } = makePasses([
        { name: 'P', reads: ['M'], writes: ['M'] },
    ])
    const lt = LifetimeAnalyzer.analyze(order, byName, r, SCREEN).find(l => l.name === 'M')!
    expect(lt.firstUseIdx).toEqual(0)
    expect(lt.lastUseIdx).toEqual(0)
})

// -----------------------------------------------------------------------------
// Aliasing reasoning (synthetic lifetimes; no GPU allocation)
// -----------------------------------------------------------------------------

await test('Aliasing principle: same bucket, disjoint intervals are alias candidates', async () => {
    // Two transient resources of identical shape with disjoint lifetimes
    // should produce the same bucketKey, which is the condition the
    // pool uses to alias them onto a single physical slot. We don't
    // exercise the pool's RenderTexture allocation here (needs a real
    // GPU); we just assert the bucket-key precondition.
    const desc: TextureDesc = texDesc({ format: 'r8unorm' })
    const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
    const k1 = computeBucketKey(desc, 1920, 1080, usage)
    const k2 = computeBucketKey(desc, 1920, 1080, usage)
    expect(k1).toEqual(k2)

    // Lifetime intervals: [0,1] and [2,3] do not overlap → aliasable.
    const a: Pick<ResourceLifetime, 'firstUseIdx' | 'lastUseIdx'> = { firstUseIdx: 0, lastUseIdx: 1 }
    const b: Pick<ResourceLifetime, 'firstUseIdx' | 'lastUseIdx'> = { firstUseIdx: 2, lastUseIdx: 3 }
    expect(a.lastUseIdx < b.firstUseIdx).toEqual(true)
})

await test('Aliasing principle: overlapping intervals are NOT alias candidates', async () => {
    const a = { firstUseIdx: 0, lastUseIdx: 3 }
    const b = { firstUseIdx: 2, lastUseIdx: 5 }
    expect(a.lastUseIdx >= b.firstUseIdx).toEqual(true) // overlap → not aliasable
})

// -----------------------------------------------------------------------------
// BufferDesc round-trip
// -----------------------------------------------------------------------------

await test('LifetimeAnalyzer: buffer kind resolves size, ignores width/height', async () => {
    const r = new TransientResourceRegistry()
    const desc: BufferDesc = { size: 12345, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }
    r.declareBuffer('Scratch', desc, 'P')
    r.recordAccessHint('Scratch', 'buffer', 'storage', 'write')
    const { order, byName } = makePasses([{ name: 'P', writes: ['Scratch'] }])
    const lt = LifetimeAnalyzer.analyze(order, byName, r, SCREEN).find(l => l.name === 'Scratch')!
    expect(lt.kind).toEqual('buffer')
    expect(lt.resolvedSize).toEqual(12345)
    expect(lt.resolvedWidth).toEqual(undefined)
})

// -----------------------------------------------------------------------------
// Branded handle: just a structural compile-time check
// -----------------------------------------------------------------------------

await test('TextureHandle is structurally a {name: string}', async () => {
    // Manually mint via the public makeTextureHandle helper is not
    // re-exported (internal); construct shape and trust the brand.
    const h: TextureHandle = { name: 'X' } as TextureHandle
    expect(h.name).toEqual('X')
})

end()
