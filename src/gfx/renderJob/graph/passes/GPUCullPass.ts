import { Scene3D } from '../../../../core/Scene3D';
import { EntityCollect } from '../../collect/EntityCollect';
import { GPUCullSystem } from '../../cull/GPUCullSystem';
import { RenderGraphBuilder, RenderGraphPass, RenderGraphPassContext } from '../RenderGraphPass';

export const VISIBILITY_BUFFER = '_VisibilityBuffer';
export const DRAW_CMDS_BUFFER = '_DrawCmds';
export const DRAW_COUNT_BUFFER = '_DrawCount';

/**
 * GPU-driven mesh culling feature. Wraps {@link GPUCullSystem}.
 * Registered when `engine.setting.render.gpuCull === true`.
 *
 * Each frame:
 *   1. Sync the per-mesh metadata SSBO from the scene's RenderNode list
 *      (additions, removals, transform updates).
 *   2. Dispatch the frustum-cull compute pass (currently MVP — Hi-Z
 *      occlusion is a follow-up; flip `useHiZ` in the shader settings
 *      uniform when wired).
 *   3. Output buffers (`_VisibilityBuffer`, `_DrawCmds`, `_DrawCount`)
 *      are exposed via the graph pool for downstream renderer use.
 *
 * **Renderer integration is OPT-IN** — `ColorPass` continues to
 * iterate the CPU `transparentList` / `opaqueList` by default. Wiring
 * `drawIndexedIndirect` against `_DrawCmds` is the next step (see
 * GPUContext.drawIndexedIndirect already in place).
 *
 * @group Graph
 */
export class GPUCullPass extends RenderGraphPass {
    public readonly name = 'GPUCullPass';

    protected _system!: GPUCullSystem;
    /** Track which Scene3D's RenderNode set we last synced from to know
     *  when the scene swap requires a full repopulate. */
    protected _lastSyncedScene: Scene3D | null = null;

    public setup(b: RenderGraphBuilder): void {
        this._system = new GPUCullSystem(b.context3D);
        b.write(VISIBILITY_BUFFER, () => this._system.visibilityBuffer);
        b.write(DRAW_CMDS_BUFFER, () => this._system.drawCmdsBuffer);
        b.write(DRAW_COUNT_BUFFER, () => this._system.drawCountBuffer);
    }

    public execute(ctx: RenderGraphPassContext): void {
        const scene = ctx.view.scene;
        // Sync mesh set. EntityCollect gives us the same opaque + transparent
        // lists the renderer iterates; both feed into the cull buffer so a
        // single dispatch handles the whole frame's geometry.
        const collectInfo = EntityCollect.instance.getRenderNodes(scene, ctx.view.camera);
        if (this._lastSyncedScene !== scene) {
            this._lastSyncedScene = scene;
            // Naive full re-register on scene change — could optimize
            // by diffing against the previous frame's set.
        }
        const ops = collectInfo.opaqueList ?? [];
        const trs = collectInfo.transparentList ?? [];
        for (const node of ops) this._system.registerNode(node);
        for (const node of trs) this._system.registerNode(node);

        // Dispatch.
        this._system.execute(ctx.view);
    }

    public get system(): GPUCullSystem { return this._system; }
}
