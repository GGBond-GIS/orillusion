import { View3D } from '../../../core/View3D';
import { RendererJob } from './RendererJob';

/**
 * Deferred rendering job — roadmap placeholder.
 *
 * The engine ships a Forward+ pipeline ({@link RendererJob}) as the
 * default. A deferred path (G-buffer fill → light accumulation →
 * forward translucents) is on the long-term roadmap; until then,
 * extend `RendererJob` directly and compose your own pipeline via
 * `this.graph.add(...)` if you need a custom flow.
 *
 * @group GFX
 */
export class DeferredRendererJob extends RendererJob {
    constructor(_view: View3D) {
        super(_view);
        throw new Error(
            'DeferredRendererJob is a roadmap placeholder. ' +
            'Extend RendererJob and use `graph.add(...)` to compose your own deferred pipeline.'
        );
    }
}
