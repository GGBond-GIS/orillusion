import { View3D } from "../core/View3D";
import { Object3D } from "../core/entities/Object3D";
import { CEventDispatcher } from "../event/CEventDispatcher";
import { Transform } from "./Transform";
import type { Raycaster } from "../io/Raycaster";
import type { RaycastHit } from "../io/RaycastHit";

export interface IComponent {
    object3D: Object3D;
    eventDispatcher: CEventDispatcher;
    transform: Transform;
    enable: boolean;
    isDestroyed?: boolean;
    init(param?: any);
    start();
    stop();
    onEnable?(view?: View3D);
    onDisable?(view?: View3D);
    onUpdate?(view?: View3D);
    onLateUpdate?(view?: View3D);
    onBeforeUpdate?(view?: View3D);
    onCompute?(view?: View3D, command?: GPUCommandEncoder);
    onGraphic?(view?: View3D);
    /**
     * Raycast against this component. Implemented by pickable components
     * (e.g. {@link MeshRenderer}) and dispatched by {@link Raycaster} in the
     * same way three.js dispatches to `Object3D.raycast`.
     * @param raycaster the raycaster
     * @param intersects the target array that holds the intersection results
     */
    raycast?(raycaster: Raycaster, intersects: RaycastHit[]);
    cloneTo(obj: Object3D);
    destroy(force?: boolean);
    beforeDestroy(force?: boolean);
    onParentChange?(lastParent?: Object3D, currentParent?: Object3D);

    onAddChild?(child: Object3D);
    onRemoveChild?(child: Object3D);
}