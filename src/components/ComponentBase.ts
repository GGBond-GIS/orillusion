import { View3D } from "../core/View3D";
import { Object3D } from "../core/entities/Object3D";
import { CEventDispatcher } from "../event/CEventDispatcher";
import { ComponentCollect } from "../gfx/renderJob/collect/ComponentCollect";
import { VisibleLayer } from "../gfx/renderJob/config/VisibleLayer";
import { EditorInspector } from "../util/SerializeDecoration";
import { IComponent } from "./IComponent";
import { Transform } from "./Transform";

/**
 * Components are used to attach functionality to object3D, it has an owner object3D.
 * The component can receive update events at each frame.
 *
 * Every component is automatically discoverable by type from any
 * RenderGraphPass — or any other system that calls
 * {@link ComponentCollect.collectByTypeLayered} — without having to
 * route through {@link RenderNode}. Registration into the per-View
 * type-keyed registry is driven directly from the enable/disable
 * call sites (`set enable`, `__start`, `__stop`), so subclasses can
 * freely override `onEnable` / `onDisable` without needing a `super`
 * call to keep the registry in sync.
 *
 * @group Components
 */
export class ComponentBase implements IComponent {
    /**
     * owner object3D
     */
    public object3D: Object3D = null;

    protected _visibleLayer: number = VisibleLayer.Default;

    /**
     * Composition-layer membership bitmask. The pass / camera /
     * collector filters via
     *
     *     (component.visibleLayer & pass.layerMask & camera.cullingMask) !== 0
     *
     * Defaults to {@link VisibleLayer.Default} (bit 0) so a fresh
     * subclass is visible to passes whose `layerMask` is
     * {@link VisibleLayer.All} (which includes bit 0). Application code
     * can assign project-specific bits (1..31) to organise the scene
     * into composition layers.
     */
    @EditorInspector
    public get visibleLayer(): number {
        return this._visibleLayer;
    }

    public set visibleLayer(value: number) {
        // Normalise to uint32 so bitwise ops behave predictably even
        // when callers pass values produced by JS bit ops (which yield
        // signed int32) or negative bit-AND tricks. EntityCollect's
        // `getLayerLists` reads this field directly at pass-execute
        // time, so a simple store is sufficient — no index to refresh.
        this._visibleLayer = value >>> 0;
    }

    /**
     * @internal
     */
    protected _eventDispatcher: CEventDispatcher;
    public get eventDispatcher() {
        this._eventDispatcher ||= new CEventDispatcher();
        return this._eventDispatcher;
    }

    public set eventDispatcher(value) {
        console.error('The eventDispatcher should not be set externally!');
    }

    /**
     * @internal
     */
    protected _enable: boolean = true;
    private __isStart: boolean = false;
    public isDestroyed: boolean = false;

    public get isStart(): boolean {
        return this.__isStart;
    }

    /**
     * Return the Transform component attached to the Object3D.
     * Null before the component is attached — `addComponent` assigns
     * `object3D` only after construction — so constructor-time callers
     * can probe safely via `this.transform?.`.
     */
    public get transform(): Transform {
        return this.object3D ? this.object3D.transform : null;
    }

    /**
     * Enable/disable components. The enabled components can be updated, while the disabled components cannot be updated.
     */
    public set enable(value: boolean) {
        if (this._enable != value) {
            this._enable = value;
            const view = this.transform.view3D;
            if (this._enable) {
                if (view) ComponentCollect.register(view, this.constructor, this);
                this.onEnable?.(view);
            } else {
                if (view) ComponentCollect.unregister(view, this.constructor, this);
                this.onDisable?.(view);
            }
        }
    }

    /**
     * Enable/disable components. The enabled components can be updated, while the disabled components cannot be updated.
     */
    public get enable(): boolean {
        return this._enable;
    }

    private __init(param?: any) {
        this.init(param);
    }

    private __start() {
        if (this.transform && this.transform.scene3D && this._enable) {
            const view = this.transform.view3D;
            if (view) ComponentCollect.register(view, this.constructor, this);
            this.onEnable?.(view);
        }
        if (this.transform && this.transform.scene3D && this.__isStart == false) {
            this.start?.();
            this.__isStart = true;
        }
        if (this.onUpdate) {
            this._onUpdate(this.onUpdate.bind(this));
        }
        if (this.onLateUpdate) {
            this._onLateUpdate(this.onLateUpdate.bind(this));
        }
        if (this.onBeforeUpdate) {
            this._onBeforeUpdate(this.onBeforeUpdate.bind(this));
        }
        if (this.onCompute) {
            this._onCompute(this.onCompute.bind(this));
        }
        if (this.onGraphic) {
            this._onGraphic(this.onGraphic.bind(this));
        }
    }

    private __stop() {
        if (this.transform && this.transform.scene3D) {
            const view = this.transform.view3D;
            if (view) ComponentCollect.unregister(view, this.constructor, this);
            this.onDisable?.(view);
        }
        this._onUpdate(null);
        this._onLateUpdate(null);
        this._onBeforeUpdate(null);
        this._onCompute(null);
        this._onGraphic(null);
    }

    public init(param?: any) { }
    public start() { }
    public stop() { }
    public onEnable?(view?: View3D);
    public onDisable?(view?: View3D);
    public onUpdate?(view?: View3D);
    public onLateUpdate?(view?: View3D);
    public onBeforeUpdate?(view?: View3D);
    public onCompute?(view?: View3D, command?: GPUCommandEncoder);
    public onGraphic?(view?: View3D);
    public onParentChange?(lastParent?: Object3D, currentParent?: Object3D);
    public onAddChild?(child: Object3D);
    public onRemoveChild?(child: Object3D);

    /**
     *
     * clone component data to target object3D
     * @param obj target object3D
     */
    public cloneTo(obj: Object3D) { }

    public copyComponent(from: this): this { return this; }

    /**
     * internal
     * Add update function. Will be executed at every frame update.
     * @param call callback
     */
    private _onUpdate(call: Function) {
        if (call != null) {
            ComponentCollect.bindUpdate(this.transform.view3D, this, call);
        } else {
            ComponentCollect.unBindUpdate(this.transform.view3D, this);
        }
    }

    /**
     * Add a delayed update function.
     * @param call callback
     */
    private _onLateUpdate(call: Function) {
        if (call != null) {
            ComponentCollect.bindLateUpdate(this.transform.view3D, this, call);
        } else {
            ComponentCollect.unBindLateUpdate(this.transform.view3D, this);
        }
    }

    /**
     * The function executed before adding frame updates.
     * @param call callback
     */
    private _onBeforeUpdate(call: Function) {
        if (call != null) {
            ComponentCollect.bindBeforeUpdate(this.transform.view3D, this, call);
        } else {
            ComponentCollect.unBindBeforeUpdate(this.transform.view3D, this);
        }
    }

    /**
     * @internal
     * Add individual execution compute capability
     * @param call callback
     */
    private _onCompute(call: Function) {
        if (call != null) {
            ComponentCollect.bindCompute(this.transform.view3D, this, call);
        } else {
            ComponentCollect.unBindCompute(this.transform.view3D, this);
        }
    }

    /**
     * Add individual execution drawing ability
     * @param call callback
     */
    private _onGraphic(call: Function) {
        if (call != null) {
            ComponentCollect.bindGraphic(this.transform.view3D, this, call);
        } else {
            ComponentCollect.unBindGraphic(this.transform.view3D, this);
        }
    }

    /**
     * before release this component, object refrences are not be set null now.
     */
    public beforeDestroy(force?: boolean) {
        ComponentCollect.removeWaitStart(this.object3D, this);
    }

    /**
     * release this component
     */
    public destroy(force?: boolean) {
        if (this.isDestroyed) return;

        this.isDestroyed = true;
        this.enable = false;
        this.stop();
        this._onBeforeUpdate(null);
        this._onUpdate(null);
        this._onLateUpdate(null);

        this.onEnable = null;
        this.onDisable = null;
        this.onUpdate = null;
        this.onLateUpdate = null;
        this.onBeforeUpdate = null;
        this.onCompute = null;
        this.onGraphic = null;
    }

}
