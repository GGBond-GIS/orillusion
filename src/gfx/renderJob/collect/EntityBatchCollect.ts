import { RenderNode } from '../../../components/renderer/RenderNode';
import { RenderGroup } from './RenderGroup';
/**
 * @internal
 */
export class EntityBatchCollect {
    public renderGroup: Map<string, RenderGroup>;

    constructor() {
        this.renderGroup = new Map<string, RenderGroup>();
    }

    public collect_add(node: RenderNode) {
        let g_key = '';
        let s_key = '';
        g_key += node.geometry.instanceID;
        for (let i = 0; i < node.materials.length; i++) {
            const mat = node.materials[i];
            s_key += mat.shader.getDefaultColorShader().shaderVariant;
        }
        let key = g_key + s_key;
        let group = this.renderGroup.get(key);
        if (!group) {
            group = {
                bundleMap: new Map<string, GPURenderBundle>(),
                key: key,
                renderNodes: [],
                nodeVersion: 0,
            };
            this.renderGroup.set(key, group);
        }
        // A new node in a group invalidates any bundle previously
        // recorded against that group — the bundle was encoded for
        // the old renderNodes list and its draw calls won't reflect
        // the new node.
        if (group.renderNodes.indexOf(node) == -1) {
            group.renderNodes.push(node);
            group.nodeVersion++;
            group.bundleMap.clear();
        }
    }
}
