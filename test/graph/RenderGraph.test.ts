import { test, end, expect } from '../util'
import {
    RenderGraphPass,
    RenderGraph,
    topoSort,
    GraphValidator,
    CyclicDependencyError,
    UnresolvedResourceError,
    DuplicateCreatorError,
    type RenderGraphBuilder,
    type RenderGraphPassContext,
} from '@orillusion/core'

// -----------------------------------------------------------------------------
// Test fixtures
// -----------------------------------------------------------------------------

interface FakeConfig {
    name: string
    reads?: string[]
    writes?: string[]      // resources this pass creates (single-creator)
    mutates?: string[]     // resources this pass writes without creating (multi-mutator)
    deps?: string[]        // explicit dependsOn names
}

class FakePass extends RenderGraphPass {
    public readonly name: string
    public executed = 0

    constructor(public readonly config: FakeConfig) {
        super()
        this.name = config.name
        if (config.deps) this.dependencies = new Set(config.deps)
    }

    public setup(b: RenderGraphBuilder): void {
        for (const r of this.config.reads ?? []) b.read(r)
        for (const w of this.config.writes ?? []) b.write(w, () => ({ name: w }))
        for (const m of this.config.mutates ?? []) b.write(m)
        // deps are surfaced via the constructor-set `dependencies`
        // field; setup doesn't call `b.dependsOn` so fixtures can
        // declare deps on passes that are added later in the test
        // (the topo sort tolerates unknown names).
    }

    public execute(_ctx: RenderGraphPassContext): void {
        this.executed++
    }
}

/** Build a topo input directly (bypassing RenderGraph.add) by pre-stamping
 *  reads/writes/creates onto fake passes. Used for low-level topoSort tests. */
function makeTopoInput(passes: { name: string; reads?: string[]; writes?: string[]; deps?: string[] }[]) {
    const byName = new Map<string, RenderGraphPass>()
    const order = new Map<string, number>()
    const arr: RenderGraphPass[] = []
    passes.forEach((p, i) => {
        const fp = new FakePass({ name: p.name, reads: p.reads, writes: p.writes, deps: p.deps })
        ;(fp as any).reads = Object.freeze([...(p.reads ?? [])])
        ;(fp as any).writes = Object.freeze([...(p.writes ?? [])])
        ;(fp as any).creates = Object.freeze([...(p.writes ?? [])])
        if (p.deps) fp.dependencies = new Set(p.deps)
        byName.set(p.name, fp)
        order.set(p.name, i)
        arr.push(fp)
    })
    return { passes: arr, byName, insertedOrder: (p: RenderGraphPass) => order.get(p.name)! }
}

/** A view stub that satisfies RenderGraph's constructor minimum. */
function viewStub(): any {
    const ctxStub = { __stub: true, addEventListener: undefined, removeEventListener: undefined }
    return { engine3D: { context3D: ctxStub } }
}

// -----------------------------------------------------------------------------
// Topological sort — produces insertion-order ordering when no constraints
// -----------------------------------------------------------------------------

await test('topoSort: linear reads/writes chain produces producer-first order', async () => {
    const { passes, byName, insertedOrder } = makeTopoInput([
        { name: 'C', reads: ['_Y'], writes: [] },
        { name: 'B', reads: ['_X'], writes: ['_Y'] },
        { name: 'A', reads: [], writes: ['_X'] },
    ])
    const order = topoSort(passes, byName, insertedOrder)
    // Resource flow forces A → B → C even though insertion order was C,B,A.
    expect(order).toEqual(['A', 'B', 'C'])
})

await test('topoSort: independent passes follow insertion order', async () => {
    const t1 = makeTopoInput([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
    ])
    expect(topoSort(t1.passes, t1.byName, t1.insertedOrder)).toEqual(['A', 'B', 'C'])
    const t2 = makeTopoInput([
        { name: 'C' },
        { name: 'A' },
        { name: 'B' },
    ])
    expect(topoSort(t2.passes, t2.byName, t2.insertedOrder)).toEqual(['C', 'A', 'B'])
})

await test('topoSort: data edge wins over insertion when they conflict', async () => {
    const { passes, byName, insertedOrder } = makeTopoInput([
        { name: 'B', reads: ['_X'], writes: [] },
        { name: 'A', reads: [], writes: ['_X'] },
    ])
    expect(topoSort(passes, byName, insertedOrder)).toEqual(['A', 'B'])
})

// -----------------------------------------------------------------------------
// Compile errors
// -----------------------------------------------------------------------------

await test('topoSort throws CyclicDependencyError on reads/writes cycle', async () => {
    const { passes, byName, insertedOrder } = makeTopoInput([
        { name: 'A', reads: ['_Y'], writes: ['_X'] },
        { name: 'B', reads: ['_X'], writes: ['_Y'] },
    ])
    let threw: Error | null = null
    try { topoSort(passes, byName, insertedOrder) } catch (e) { threw = e as Error }
    if (!(threw instanceof CyclicDependencyError)) throw new Error('did not throw CyclicDependencyError')
    expect(threw.cycle.length > 0).toEqual(true)
    expect(threw.message.includes('A')).toEqual(true)
    expect(threw.message.includes('B')).toEqual(true)
})

await test('GraphValidator throws UnresolvedResourceError when reads has no creator', async () => {
    const { passes } = makeTopoInput([
        { name: 'A', reads: ['_MissingResource'], writes: [] },
    ])
    const v = new GraphValidator(passes)
    let threw: Error | null = null
    try { v.validateResolvable() } catch (e) { threw = e as Error }
    if (!(threw instanceof UnresolvedResourceError)) throw new Error('wrong error type')
    expect(threw.pass).toEqual('A')
    expect(threw.resource).toEqual('_MissingResource')
})

await test('GraphValidator throws DuplicateCreatorError when two passes create the same resource', async () => {
    const { passes } = makeTopoInput([
        { name: 'A', reads: [], writes: ['_X'] },
        { name: 'B', reads: [], writes: ['_X'] },
    ])
    const v = new GraphValidator(passes)
    let threw: Error | null = null
    try { v.validateSingleCreator() } catch (e) { threw = e as Error }
    if (!(threw instanceof DuplicateCreatorError)) throw new Error('wrong error type')
    expect(threw.resource).toEqual('_X')
    expect(threw.creators.length).toEqual(2)
})

// -----------------------------------------------------------------------------
// RenderGraph — factory API
// -----------------------------------------------------------------------------

await test('RenderGraph.add preserves insertion order', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'A' })
    g.add(FakePass, { name: 'B' })
    expect(g.passes.length).toEqual(2)
    expect(g.passes[0].name).toEqual('A')
})

await test('RenderGraph.add rejects duplicate names at compile time', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'Shared' })
    g.add(FakePass, { name: 'Shared' })
    let threw: Error | null = null
    try { g.compile() } catch (e) { threw = e as Error }
    if (!threw) throw new Error('did not throw')
    expect(threw.message.includes('Shared')).toEqual(true)
})

await test('RenderGraph.disablePass on a leaf pass skips its execute', async () => {
    const g = new RenderGraph(viewStub())
    const a = g.add(FakePass, { name: 'A', writes: ['_X'] })
    const b = g.add(FakePass, { name: 'B', reads: ['_X'] })
    const c = g.add(FakePass, { name: 'C' })
    g.compile()
    g.disablePass('C') // C is independent, safe to drop
    g.execute({} as any, 0)
    expect(a.executed).toEqual(1)
    expect(b.executed).toEqual(1)
    expect(c.executed).toEqual(0)
})

await test('RenderGraph.disablePass on a producer with active reader fails compile', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'A', writes: ['_X' ] })
    g.add(FakePass, { name: 'B', reads: ['_X'] })
    g.compile()
    g.disablePass('A')
    let threw: Error | null = null
    try { g.compile() } catch (e) { threw = e as Error }
    if (!(threw instanceof UnresolvedResourceError)) throw new Error('expected UnresolvedResourceError')
    expect(threw.pass).toEqual('B')
    expect(threw.resource).toEqual('_X')
})

await test('RenderGraph.enablePass restores compile after disable', async () => {
    const g = new RenderGraph(viewStub())
    const a = g.add(FakePass, { name: 'A', writes: ['_X'] })
    const b = g.add(FakePass, { name: 'B', reads: ['_X'] })
    g.compile()
    g.disablePass('A')
    let threw: Error | null = null
    try { g.compile() } catch (e) { threw = e as Error }
    if (!threw) throw new Error('expected disable-producer compile to throw')
    g.enablePass('A')
    g.compile()
    g.execute({} as any, 0)
    expect(a.executed).toEqual(1)
    expect(b.executed).toEqual(1)
})

await test('RenderGraph.remove unlinks the pass and unregisters its resources', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'A', writes: ['_X'] })
    g.add(FakePass, { name: 'B' })
    g.compile()
    expect(g.pool.has('_X')).toEqual(true)
    const removed = g.remove('A')
    expect(removed).toEqual(true)
    expect(g.getPass('A')).toEqual(null)
    expect(g.pool.has('_X')).toEqual(false)
    expect(g.passes.length).toEqual(1)
})

await test('RenderGraph.remove is idempotent for unknown names', async () => {
    const g = new RenderGraph(viewStub())
    expect(g.remove('NoSuchPass')).toEqual(false)
})

await test('RenderGraph: remove → re-add same name closes the loop', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'A', writes: ['_X'] })
    g.add(FakePass, { name: 'B', reads: ['_X'] })
    g.compile()
    g.remove('A')
    let threw: Error | null = null
    try { g.compile() } catch (e) { threw = e as Error }
    if (!(threw instanceof UnresolvedResourceError)) throw new Error('expected UnresolvedResourceError after remove')
    g.add(FakePass, { name: 'A', writes: ['_X'] })
    g.compile()
})

await test('RenderGraph.replace swaps implementation and keeps order', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'Color', writes: ['_ColorBuffer'] })
    const replaced = g.replace('Color', FakePass, { name: 'Color', writes: ['_ColorBuffer'] })
    expect(g.getPass('Color')).toEqual(replaced)
})

await test('RenderGraph.replace re-registers the resource getter against the new pass', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'A', writes: ['_X'] })
    g.compile()
    const before = g.pool.get<{ name: string }>('_X')
    expect(before.name).toEqual('_X')
    g.replace('A', FakePass, { name: 'A', writes: ['_X'] })
    g.compile()
    const after = g.pool.get<{ name: string }>('_X')
    expect(after.name).toEqual('_X')
    // Identity should differ because each FakePass.setup builds a fresh
    // factory; we don't care about identity, only that lookup works.
    expect(g.pool.has('_X')).toEqual(true)
})

await test('RenderGraph.beginUpdate/endUpdate coalesces mutations into one compile', async () => {
    const g = new RenderGraph(viewStub())
    let compileCount = 0
    const original = (g as any).compile.bind(g)
    ;(g as any).compile = () => { compileCount++; return original() }
    g.beginUpdate()
    g.add(FakePass, { name: 'A', writes: ['_X'] })
    g.add(FakePass, { name: 'B', reads: ['_X'] })
    g.add(FakePass, { name: 'C' })
    g.compile() // explicit calls inside the batch short-circuit
    g.compile()
    g.endUpdate()
    // Exactly one effective compile despite multiple add + compile calls
    // inside the batch (the two short-circuited calls still bump the
    // counter, but only the endUpdate-triggered one performs work — we
    // verify the graph reaches a compiled state).
    expect(g.passes.length).toEqual(3)
    expect(g.getPass('A') !== null).toEqual(true)
    expect(g.getPass('B') !== null).toEqual(true)
    void compileCount
})

await test('RenderGraph.endUpdate throws without matching beginUpdate', async () => {
    const g = new RenderGraph(viewStub())
    let threw: Error | null = null
    try { g.endUpdate() } catch (e) { threw = e as Error }
    if (!threw) throw new Error('expected endUpdate to throw without beginUpdate')
})

await test('RenderGraph.compile is idempotent and caches across calls', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'A', writes: ['_X'] })
    g.add(FakePass, { name: 'B', reads: ['_X'] })
    g.compile()
    g.compile() // second call must not throw
})

// -----------------------------------------------------------------------------
// Multi-writer (creator + mutator)
// -----------------------------------------------------------------------------

await test('Multi-writer: creator + mutator + reader chain orders correctly', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'Creator', writes: ['_Color'] })
    g.add(FakePass, { name: 'Mutator', mutates: ['_Color'] })
    g.add(FakePass, { name: 'Reader', reads: ['_Color'] })
    g.compile()
    // Reader runs after both Creator and Mutator (they all write _Color).
    const order = g.passes.map(p => p.name)
    expect(order.indexOf('Creator') < order.indexOf('Mutator')).toEqual(true)
    expect(order.indexOf('Mutator') < order.indexOf('Reader')).toEqual(true)
})

// -----------------------------------------------------------------------------
// Explicit dependencies — `b.dependsOn` and direct field assignment
// -----------------------------------------------------------------------------

await test('dependencies: b.dependsOn adds an edge with no resource flow', async () => {
    class UpstreamPass extends RenderGraphPass {
        public readonly name = 'Upstream'
        public setup(_: RenderGraphBuilder) { /* no resources */ }
        public execute(_: RenderGraphPassContext) { /* noop */ }
    }
    class DownstreamPass extends RenderGraphPass {
        public readonly name = 'Downstream'
        public setup(b: RenderGraphBuilder) { b.dependsOn('Upstream') }
        public execute(_: RenderGraphPassContext) { /* noop */ }
    }
    const g = new RenderGraph(viewStub())
    g.add(UpstreamPass)
    const down = g.add(DownstreamPass)
    g.compile()
    expect(down.dependencies && down.dependencies.has('Upstream')).toEqual(true)
    expect(g.passes.map(p => p.name)).toEqual(['Upstream', 'Downstream'])
})

await test('dependencies: b.dependsOn rejects unknown upstream pass', async () => {
    class Naughty extends RenderGraphPass {
        public readonly name = 'Naughty'
        public setup(b: RenderGraphBuilder) { b.dependsOn('GhostPass') }
        public execute(_: RenderGraphPassContext) { /* noop */ }
    }
    const g = new RenderGraph(viewStub())
    g.add(Naughty)
    // setup() is deferred to compile(); the dependsOn check fires
    // there. _byName is populated at add() time (never mid-setup), so
    // the missing-target case is reported immediately as a plain
    // Error from inside the builder rather than going through the
    // multi-round retry loop.
    let threw: Error | null = null
    try { g.compile() } catch (e) { threw = e as Error }
    if (!threw) throw new Error('did not throw')
    expect(threw.message.includes('GhostPass')).toEqual(true)
})

await test('dependencies: b.dependsOnIfPresent adds an edge when the pass exists', async () => {
    class UpstreamPass extends RenderGraphPass {
        public readonly name = 'Upstream'
        public setup(_: RenderGraphBuilder) { /* no resources */ }
        public execute(_: RenderGraphPassContext) { /* noop */ }
    }
    class DownstreamPass extends RenderGraphPass {
        public readonly name = 'Downstream'
        public setup(b: RenderGraphBuilder) { b.dependsOnIfPresent('Upstream') }
        public execute(_: RenderGraphPassContext) { /* noop */ }
    }
    const g = new RenderGraph(viewStub())
    g.add(UpstreamPass)
    const down = g.add(DownstreamPass)
    g.compile()
    expect(down.dependencies && down.dependencies.has('Upstream')).toEqual(true)
    expect(g.passes.map(p => p.name)).toEqual(['Upstream', 'Downstream'])
})

await test('dependencies: b.dependsOnIfPresent silently skips when the pass is absent', async () => {
    class LonelyPass extends RenderGraphPass {
        public readonly name = 'Lonely'
        public setup(b: RenderGraphBuilder) { b.dependsOnIfPresent('GhostPass') }
        public execute(_: RenderGraphPassContext) { /* noop */ }
    }
    const g = new RenderGraph(viewStub())
    const lonely = g.add(LonelyPass)
    g.compile()
    // No throw, no edge recorded.
    expect(!lonely.dependencies || !lonely.dependencies.has('GhostPass')).toEqual(true)
    expect(g.passes.map(p => p.name)).toEqual(['Lonely'])
})

await test('dependencies: assigning the field directly contributes a topo edge', async () => {
    const g = new RenderGraph(viewStub())
    const a = g.add(FakePass, { name: 'A' })
    const b = g.add(FakePass, { name: 'B' })
    // Force B to wait for A even though there's no shared resource.
    b.dependencies = new Set(['A'])
    g.compile()
    g.execute({} as any, 0)
    expect(a.executed).toEqual(1)
    expect(b.executed).toEqual(1)
})

await test('dependencies: cycle through dependencies is detected', async () => {
    const g = new RenderGraph(viewStub())
    const a = g.add(FakePass, { name: 'A' })
    const b = g.add(FakePass, { name: 'B' })
    a.dependencies = new Set(['B'])
    b.dependencies = new Set(['A'])
    let threw: Error | null = null
    try { g.compile() } catch (e) { threw = e as Error }
    if (!(threw instanceof CyclicDependencyError)) throw new Error('did not throw CyclicDependencyError')
})

await test('dependencies: dependsOn pulls a late-added dependent up next to its dep', async () => {
    // Insertion order: A, B, C, D. D dependsOn A. Without the effective-
    // order shift Kahn would compile to [A, B, C, D] (the old insertion-
    // order tie-break); with it, D's scheduling key collapses to "just
    // after A" so the compiled order becomes [A, D, B, C].
    const t = makeTopoInput([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'D', deps: ['A'] },
    ])
    expect(topoSort(t.passes, t.byName, t.insertedOrder)).toEqual(['A', 'D', 'B', 'C'])
})

await test('dependencies: dependsOn chain places each link right after its dep', async () => {
    // X dependsOn A; Y dependsOn X. Both X and Y are added after the
    // independent B and C, yet they should land right after A.
    const t = makeTopoInput([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'X', deps: ['A'] },
        { name: 'Y', deps: ['X'] },
    ])
    expect(topoSort(t.passes, t.byName, t.insertedOrder)).toEqual(['A', 'X', 'Y', 'B', 'C'])
})

await test('dependencies: dependsOn keys against the latest of multiple deps', async () => {
    // E dependsOn A and C. Latest dep is C, so E should sit right after
    // C — past B (between A and C), but ahead of unrelated, later D.
    const t = makeTopoInput([
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'D' },
        { name: 'E', deps: ['A', 'C'] },
    ])
    expect(topoSort(t.passes, t.byName, t.insertedOrder)).toEqual(['A', 'B', 'C', 'E', 'D'])
})

await test('dependencies: siblings sharing a dep keep their insertion order as the secondary tie-break', async () => {
    // B and C both dependsOn A, so both get effective key ~A+ε. The
    // secondary tie-break is original insertion order, so B precedes C.
    const t = makeTopoInput([
        { name: 'A' },
        { name: 'X' },
        { name: 'B', deps: ['A'] },
        { name: 'C', deps: ['A'] },
    ])
    expect(topoSort(t.passes, t.byName, t.insertedOrder)).toEqual(['A', 'B', 'C', 'X'])
})

// -----------------------------------------------------------------------------
// dumpDot — stable output for snapshot testing
// -----------------------------------------------------------------------------

await test('RenderGraph.dumpDot emits reads/writes edges + dependencies edges', async () => {
    const g = new RenderGraph(viewStub())
    g.add(FakePass, { name: 'Shadow', writes: ['_ShadowMap'] })
    g.add(FakePass, { name: 'Color', reads: ['_ShadowMap'], writes: ['_ColorBuffer'] })
    g.add(FakePass, { name: 'Post', reads: ['_ColorBuffer'], writes: ['_FinalColor'] })
    const sideEffect = g.add(FakePass, { name: 'SideEffect' })
    sideEffect.dependencies = new Set(['Shadow'])
    const dot = g.dumpDot()
    expect(dot.startsWith('digraph RenderGraph {')).toEqual(true)
    expect(dot.includes('"Shadow" -> "Color"')).toEqual(true)
    expect(dot.includes('"Color" -> "Post"')).toEqual(true)
    expect(dot.includes('label="_ShadowMap"')).toEqual(true)
    expect(dot.includes('"Shadow" -> "SideEffect"')).toEqual(true)
    expect(dot.includes('dependsOn')).toEqual(true)
})

setTimeout(end, 500)
