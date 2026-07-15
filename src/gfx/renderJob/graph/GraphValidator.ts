import { RenderGraphPass } from './RenderGraphPass';

/**
 * Base class for graph-compile errors. Subclass messages embed
 * concrete pass / resource names so users can grep to the culprit.
 *
 * @group Graph
 */
export class GraphCompileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}

/**
 * Raised when passes form a cycle on reads/writes. The message lists
 * the pass names on the cycle in order.
 *
 * @group Graph
 */
export class CyclicDependencyError extends GraphCompileError {
    public readonly cycle: readonly string[];
    constructor(cycle: readonly string[]) {
        super(`RenderGraph: cyclic dependency detected — ${cycle.join(' → ')} → ${cycle[0]}. ` +
            `Break the cycle by removing one reads/writes edge, or split the resource into two named handles.`);
        this.cycle = cycle;
    }
}

/**
 * Raised when a pass declares `b.read('foo')` (or `b.write('foo')`
 * without factory) but no other pass is the creator of `'foo'`.
 *
 * @group Graph
 */
export class UnresolvedResourceError extends GraphCompileError {
    public readonly pass: string;
    public readonly resource: string;
    constructor(pass: string, resource: string) {
        super(`RenderGraph: pass '${pass}' reads '${resource}' but no creator pass was found. ` +
            `Add a pass that calls b.write('${resource}', factory) in its setup().`);
        this.pass = pass;
        this.resource = resource;
    }
}

/**
 * Raised when a pass calls `b.write('foo')` (mutator, no factory)
 * but no other pass is the creator of `'foo'`.
 *
 * @group Graph
 */
export class MissingCreatorError extends GraphCompileError {
    public readonly pass: string;
    public readonly resource: string;
    constructor(pass: string, resource: string) {
        super(`RenderGraph: pass '${pass}' declares write to '${resource}' (mutator) but no creator pass was found. ` +
            `Add a pass that calls b.write('${resource}', factory) in its setup(), or change this pass to be the creator.`);
        this.pass = pass;
        this.resource = resource;
    }
}

/**
 * Raised when a pass calls `b.useRenderTarget('foo')` (or any other
 * kind-typed accessor) for a `name` whose pool entry is not the
 * expected kind. Eagerly thrown by the builder at setup time so the
 * stack trace points to the actual call site.
 *
 * @group Graph
 */
export class WrongResourceKindError extends GraphCompileError {
    public readonly pass: string;
    public readonly resource: string;
    public readonly expected: string;
    public readonly actual: string;
    constructor(pass: string, resource: string, expected: string, actual: string) {
        super(`RenderGraph: pass '${pass}' uses '${resource}' as kind '${expected}', but the pool entry is kind '${actual}'. ` +
            `Did the creator pass use a different builder method (e.g. b.write vs b.createRenderTarget), or is '${resource}' the wrong name?`);
        this.pass = pass;
        this.resource = resource;
        this.expected = expected;
        this.actual = actual;
    }
}

/**
 * Raised when two passes call `b.write(name, factory)` for the same
 * `name`. Only one pass may be the creator of a given resource;
 * additional passes that also write must drop their factory and
 * become mutators.
 *
 * @group Graph
 */
export class DuplicateCreatorError extends GraphCompileError {
    public readonly resource: string;
    public readonly creators: readonly string[];
    constructor(resource: string, creators: readonly string[]) {
        super(`RenderGraph: resource '${resource}' has multiple creators: ${creators.map(c => `'${c}'`).join(', ')}. ` +
            `Only one pass may call b.write('${resource}', factory). Other passes that also write must drop the factory and become mutators (b.write('${resource}')).`);
        this.resource = resource;
        this.creators = [...creators];
    }
}

/**
 * Static graph invariants enforcer. Called by `RenderGraph.compile`;
 * factored out so unit tests can exercise validation without GPU.
 *
 * @group Graph
 */
export class GraphValidator {
    /** name → creator pass name (single creator per resource). */
    private readonly _creators: Map<string, string> = new Map();
    /** name → all writer pass names (creator + mutators), in registration order. */
    private readonly _writers: Map<string, string[]> = new Map();
    /** name → reader pass names. */
    private readonly _consumers: Map<string, string[]> = new Map();
    private readonly _byName: Map<string, RenderGraphPass> = new Map();
    /** Tracks duplicate creators so validateSingleCreator can report all of them. */
    private readonly _duplicateCreators: Map<string, string[]> = new Map();

    constructor(passes: readonly RenderGraphPass[]) {
        for (const p of passes) {
            if (this._byName.has(p.name)) {
                throw new GraphCompileError(`RenderGraph: duplicate pass name '${p.name}'. ` +
                    `Use distinct names or call graph.replace('${p.name}', NewCtor) instead of add.`);
            }
            this._byName.set(p.name, p);
            for (const c of p.creates) {
                if (!this._duplicateCreators.has(c)) this._duplicateCreators.set(c, []);
                this._duplicateCreators.get(c)!.push(p.name);
                if (!this._creators.has(c)) this._creators.set(c, p.name);
            }
            for (const w of p.writes) {
                if (!this._writers.has(w)) this._writers.set(w, []);
                this._writers.get(w)!.push(p.name);
            }
            for (const r of p.reads) {
                if (!this._consumers.has(r)) this._consumers.set(r, []);
                this._consumers.get(r)!.push(p.name);
            }
        }
    }

    /** Each name must have at most one creator. Mutator-only resources
     *  (no creator) are caught by validateResolvable. */
    public validateSingleCreator(): void {
        for (const [name, list] of this._duplicateCreators) {
            if (list.length > 1) {
                throw new DuplicateCreatorError(name, list);
            }
        }
    }

    /** Every read and every mutator-write must point to a resource
     *  with a creator. */
    public validateResolvable(): void {
        for (const [resource, consumers] of this._consumers) {
            if (this._creators.has(resource)) continue;
            throw new UnresolvedResourceError(consumers[0], resource);
        }
        for (const [resource, writers] of this._writers) {
            if (this._creators.has(resource)) continue;
            // No creator and yet someone writes — must be a mutator
            // without a backing creator.
            const mutator = writers[0];
            throw new MissingCreatorError(mutator, resource);
        }
    }

}

/**
 * Kahn-style topological sort on the reads/writes DAG. Tie-breaks
 * between equally-ready passes use **effective scheduling order**:
 *   - A pass with no explicit `dependencies` keeps its original
 *     `insertedOrder` as its key (the order of `graph.add()`).
 *   - A pass with explicit `dependencies` is shifted to sit just
 *     after its latest explicit dep — so `b.dependsOn(X)` reads as
 *     "schedule me with X", not merely "after X somewhere". A late-
 *     added pass that depends on an early one therefore pops from
 *     the ready queue immediately after its dep, ahead of unrelated
 *     passes that happen to have lower insertion order.
 *
 * Together with the resource and `dependencies` edges this fully
 * determines the schedule: same input → same output.
 *
 * Multi-writer support:
 * - Writers of the same resource are ordered by insertion.
 * - Each subsequent writer has an incoming edge from the previous
 *   writer (mutator after creator).
 * - Each reader has an incoming edge from the LATEST writer whose
 *   insertion is at-or-before the reader's. This lets a reader
 *   sandwich between creator and a later mutator sample the
 *   creator's output (e.g. SceneColorPyramidPass reads the opaque-
 *   only ColorBuffer before SortedTransparentPass blends transparents
 *   on top — provided the pyramid was added after ColorPass and
 *   before SortedTransparentPass).
 *
 * Side-effect ordering uses {@link RenderGraphPass.dependencies}
 * (set via `b.dependsOn(name)` or direct field assignment) for
 * cases the graph can't infer from reads/writes — see the field's
 * docstring for examples. Resource-derived reader/writer edges do
 * NOT participate in the effective-order shift: they're frequently
 * long-range (a final GUI pass reads FINAL_COLOR), and shifting on
 * every read edge would defeat insertion-order scheduling entirely.
 *
 * Returns the ordered pass names; throws {@link CyclicDependencyError}
 * with the cycle path if a cycle is detected.
 *
 * @group Graph
 */
export function topoSort(
    passes: readonly RenderGraphPass[],
    byName: ReadonlyMap<string, RenderGraphPass>,
    insertedOrder: (p: RenderGraphPass) => number,
): string[] {
    // Build writer chain per resource, ordered by insertion.
    const writers = new Map<string, string[]>();
    for (const p of passes) {
        for (const w of p.writes) {
            if (!writers.has(w)) writers.set(w, []);
            writers.get(w)!.push(p.name);
        }
    }
    for (const [, list] of writers) {
        list.sort((a, b) => insertedOrder(byName.get(a)!) - insertedOrder(byName.get(b)!));
    }

    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const p of passes) {
        inDegree.set(p.name, 0);
        adj.set(p.name, []);
    }

    const addEdge = (from: string, to: string) => {
        if (from === to) return;
        adj.get(from)!.push(to);
        inDegree.set(to, inDegree.get(to)! + 1);
    };

    // 1) Chain writers of the same resource.
    for (const [, list] of writers) {
        for (let i = 1; i < list.length; i++) {
            addEdge(list[i - 1], list[i]);
        }
    }
    // 2) Each reader depends on the latest writer whose insertion is
    //    at-or-before the reader's — that's the writer's output the
    //    reader actually observes.
    for (const p of passes) {
        for (const r of p.reads) {
            const ws = writers.get(r);
            if (!ws || ws.length === 0) continue;
            const readerOrder = insertedOrder(p);
            let picked: string | null = null;
            for (let i = ws.length - 1; i >= 0; i--) {
                if (insertedOrder(byName.get(ws[i])!) <= readerOrder) { picked = ws[i]; break; }
            }
            // Fall back to the first writer if all writers are added
            // after the reader (a missing creator would be caught by
            // validateResolvable; this only happens with mutator-only
            // chains plus a back-of-graph reader, which is exotic).
            if (!picked) picked = ws[0];
            addEdge(picked, p.name);
        }
    }
    // 3) Explicit `dependencies` edges. Each entry adds `<dep> → p`,
    //    independent of any resource flow. Use these for side-effect
    //    dependencies the graph can't see (indirect buffers consumed
    //    via GlobalBindGroup, off-screen RTs sampled by materials).
    //    Unknown names are tolerated here — `b.dependsOn` already
    //    rejects them at setup time; if a pass's `dependencies` is
    //    set directly to a missing name we silently skip the edge.
    for (const p of passes) {
        if (!p.dependencies) continue;
        for (const dep of p.dependencies) {
            if (!byName.has(dep)) continue;
            addEdge(dep, p.name);
        }
    }

    // Effective scheduling key: a pass with explicit `dependencies`
    // shifts to sit just after the latest of its deps, so `dependsOn(X)`
    // pulls a late-added pass up next to X instead of stranding it at
    // the back of the queue behind unrelated, earlier-inserted passes.
    // Walked in insertion order — `b.dependsOn` enforces the dep is
    // already registered, so by the time we visit a dependent its dep
    // is already in `eff`. The remaining edge case (a dep populated
    // via direct field assignment that's added later) falls back to
    // the dep's `insertedOrder`, which keeps the shift monotonic but
    // approximate; the topology edges still pin the actual ordering.
    const eff = new Map<string, number>();
    const epsilon = 1 / (passes.length + 1);
    const byInsertion = [...passes].sort((a, b) => insertedOrder(a) - insertedOrder(b));
    for (const p of byInsertion) {
        let key = insertedOrder(p);
        if (p.dependencies && p.dependencies.size > 0) {
            let maxDepKey = -Infinity;
            for (const depName of p.dependencies) {
                if (depName === p.name) continue;
                const dep = byName.get(depName);
                if (!dep) continue;
                const depKey = eff.get(depName) ?? insertedOrder(dep);
                if (depKey > maxDepKey) maxDepKey = depKey;
            }
            if (maxDepKey > -Infinity) key = maxDepKey + epsilon;
        }
        eff.set(p.name, key);
    }

    // Kahn with effective-order primary key and insertion-order
    // secondary tie-break for determinism when two passes share the
    // same effective key (e.g. two siblings both depending on the
    // same upstream pass).
    const ready: RenderGraphPass[] = [];
    for (const p of passes) {
        if (inDegree.get(p.name) === 0) ready.push(p);
    }
    const cmp = (a: RenderGraphPass, b: RenderGraphPass) => {
        const da = eff.get(a.name)!;
        const db = eff.get(b.name)!;
        if (da !== db) return da - db;
        return insertedOrder(a) - insertedOrder(b);
    };
    ready.sort(cmp);

    const order: string[] = [];
    while (ready.length > 0) {
        const next = ready.shift()!;
        order.push(next.name);
        for (const child of adj.get(next.name)!) {
            const d = inDegree.get(child)! - 1;
            inDegree.set(child, d);
            if (d === 0) {
                ready.push(byName.get(child)!);
                ready.sort(cmp);
            }
        }
    }

    if (order.length !== passes.length) {
        const remaining = new Set<string>();
        for (const p of passes) if (inDegree.get(p.name)! > 0) remaining.add(p.name);
        const cycle = _extractCycle(remaining, adj);
        throw new CyclicDependencyError(cycle);
    }

    return order;
}

/** Walk the residual adjacency to surface one concrete cycle path. */
function _extractCycle(remaining: Set<string>, adj: ReadonlyMap<string, string[]>): string[] {
    const start = remaining.values().next().value as string;
    const path: string[] = [];
    const seen = new Map<string, number>();
    let cur = start;
    while (!seen.has(cur)) {
        seen.set(cur, path.length);
        path.push(cur);
        const next = adj.get(cur)!.find(n => remaining.has(n));
        if (!next) break;
        cur = next;
    }
    const idx = seen.get(cur);
    return idx !== undefined ? path.slice(idx) : path;
}
