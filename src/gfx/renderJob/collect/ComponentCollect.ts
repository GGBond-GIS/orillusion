import { ColliderComponent } from "../../../components/ColliderComponent";
import { IComponent } from "../../../components/IComponent";
import { View3D } from "../../../core/View3D";
import { Object3D } from "../../../core/entities/Object3D";
import { VisibleLayer } from "../config/VisibleLayer";

/**
 * Static registry of live components, keyed by {@link View3D}. Holds the
 * per-view lifecycle callback lists (update / lateUpdate / beforeUpdate /
 * compute / pick / graphic) that the engine drives each frame, plus a
 * type-keyed index used by render passes and other systems to enumerate
 * every instance of a component class in a view. View entries are evicted
 * on engine dispose to avoid leaking scene trees and callbacks.
 *
 * @group GFX
 */
export class ComponentCollect {

    /**
     * @internal
     */
    public static componentsUpdateList: Map<View3D, Map<IComponent, Function>>;

    /**
     * @internal
     */
    public static componentsLateUpdateList: Map<View3D, Map<IComponent, Function>>;

    /**
     * @internal
     */
    public static componentsBeforeUpdateList: Map<View3D, Map<IComponent, Function>>;

    /**
     * @internal
     */
    public static componentsComputeList: Map<View3D, Map<IComponent, Function>>;

    /**
     * @internal
     */
    public static componentsEnablePickerList: Map<View3D, Map<ColliderComponent, Function>>;

    /**
     * @internal
     */
    public static graphicComponent: Map<View3D, Map<IComponent, Function>>;

    /**
     * Type-keyed index of live components per View3D. The outer map is
     * keyed by View, the inner map by the component's concrete class
     * (`(this as any).constructor`), the value is the live set of
     * instances enabled in that view.
     *
     * This is a pure registry — semantically independent of rendering.
     * RenderGraph passes use {@link collectByTypeLayered} to enumerate
     * a specific component type for a view, but the same index can
     * back physics queries, editor enumeration, audio listener
     * lookups, or any system that needs "give me every X in this
     * scene/view" by type rather than by lifecycle callback.
     *
     * @internal
     */
    public static componentsByType: Map<View3D, Map<Function, Set<IComponent>>>;

    /**
     * @internal
     */
    // private static waitStartComponentBak: Map<Object3D, IComponent[]>;
    // private static waitStartComponentBody: Map<Object3D, IComponent[]>;
    public static waitStartComponent: Map<Object3D, IComponent[]>;

    private static _init: boolean = false;

    private static init() {
        if (!this._init) {
            this._init = true;
            this.componentsUpdateList = new Map<View3D, Map<IComponent, Function>>();
            this.componentsLateUpdateList = new Map<View3D, Map<IComponent, Function>>();
            this.componentsBeforeUpdateList = new Map<View3D, Map<IComponent, Function>>();
            this.componentsComputeList = new Map<View3D, Map<IComponent, Function>>();
            this.componentsEnablePickerList = new Map<View3D, Map<ColliderComponent, Function>>();
            this.graphicComponent = new Map<View3D, Map<IComponent, Function>>();
            this.componentsByType = new Map<View3D, Map<Function, Set<IComponent>>>();
            // this.waitStartComponentBak = new Map<Object3D, IComponent[]>();
            // this.waitStartComponentBody = new Map<Object3D, IComponent[]>();
            this.waitStartComponent = new Map<Object3D, IComponent[]>();
        }
    }

    public static bindUpdate(view: View3D, component: IComponent, call: Function) {
        this.init();
        let list = this.componentsUpdateList.get(view);
        if (!list) {
            list = new Map<IComponent, Function>();
            this.componentsUpdateList.set(view, list);
        }
        list.set(component, call);
    }

    public static unBindUpdate(view: View3D, component: IComponent) {
        this.init();
        let list = this.componentsUpdateList.get(view);
        if (list) {
            list.delete(component);
        }
    }

    public static bindLateUpdate(view: View3D, component: IComponent, call: Function) {
        this.init();
        let list = this.componentsLateUpdateList.get(view);
        if (!list) {
            list = new Map<IComponent, Function>();
            this.componentsLateUpdateList.set(view, list);
        }
        list.set(component, call);
    }

    public static unBindLateUpdate(view: View3D, component: IComponent) {
        this.init();
        let list = this.componentsLateUpdateList.get(view);
        if (list) {
            list.delete(component);
        }
    }

    public static bindBeforeUpdate(view: View3D, component: IComponent, call: Function) {
        this.init();
        let list = this.componentsBeforeUpdateList.get(view);
        if (!list) {
            list = new Map<IComponent, Function>();
            this.componentsBeforeUpdateList.set(view, list);
        }
        list.set(component, call);
    }

    public static unBindBeforeUpdate(view: View3D, component: IComponent) {
        this.init();
        let list = this.componentsBeforeUpdateList.get(view);
        if (list) {
            list.delete(component);
        }
    }

    public static bindCompute(view: View3D, component: IComponent, call: Function) {
        this.init();
        let list = this.componentsComputeList.get(view);
        if (!list) {
            list = new Map<IComponent, Function>();
            this.componentsComputeList.set(view, list);
        }
        list.set(component, call);
    }

    public static unBindCompute(view: View3D, component: IComponent) {
        this.init();
        let list = this.componentsComputeList.get(view);
        if (list) {
            list.delete(component);
        }
    }

    public static bindGraphic(view: View3D, component: IComponent, call: Function) {
        this.init();
        let list = this.graphicComponent.get(view);
        if (!list) {
            list = new Map<IComponent, Function>();
            this.graphicComponent.set(view, list);
        }
        list.set(component, call);
    }

    public static unBindGraphic(view: View3D, component: IComponent) {
        this.init();
        let list = this.graphicComponent.get(view);
        if (list) {
            list.delete(component);
        }
    }

    public static appendWaitStart(component: IComponent) {
        this.init();
        let arr = this.waitStartComponent.get(component.object3D);
        if (!arr) {
            this.waitStartComponent.set(component.object3D, [component]);
        } else {
            let index = arr.indexOf(component);
            if (index == -1) {
                arr.push(component);
            }
        }
    }

    public static removeWaitStart(obj: Object3D, component: IComponent) {
        this.init();
        let arr = ComponentCollect.waitStartComponent.get(obj);
        if (arr) {
            let index = arr.indexOf(component);
            if (index != -1) {
                arr.splice(index);
            }
        }
    }

    public static bindEnablePick(view: View3D, component: ColliderComponent, call: Function) {
        this.init();
        let list = this.componentsEnablePickerList.get(view);
        if (!list) {
            list = new Map<ColliderComponent, Function>();
            this.componentsEnablePickerList.set(view, list);
        }
        list.set(component, call);
    }

    public static unBindEnablePick(view: View3D, component: ColliderComponent) {
        this.init();
        let list = this.componentsEnablePickerList.get(view);
        if (list) {
            list.delete(component);
        }
    }

    /**
     * Add `comp` to the type-keyed registry under `(view, ctor)`. Used
     * by {@link ComponentBase.onEnable} to make the instance
     * discoverable via {@link collectByTypeLayered}.
     *
     * `ctor` should be the component's concrete class
     * (`(this as any).constructor` from the instance). Subclasses are
     * registered under their own class — a query for the parent class
     * will not enumerate subclass instances. Idempotent.
     */
    public static register(view: View3D, ctor: Function, component: IComponent) {
        this.init();
        let perView = this.componentsByType.get(view);
        if (!perView) {
            perView = new Map<Function, Set<IComponent>>();
            this.componentsByType.set(view, perView);
        }
        let set = perView.get(ctor);
        if (!set) {
            set = new Set<IComponent>();
            perView.set(ctor, set);
        }
        set.add(component);
    }

    /**
     * Remove `comp` from the type-keyed registry. Empty inner sets are
     * left in place so the next register call can reuse them without
     * a fresh allocation. Idempotent.
     */
    public static unregister(view: View3D, ctor: Function, component: IComponent) {
        this.init();
        const perView = this.componentsByType.get(view);
        if (!perView) return;
        const set = perView.get(ctor);
        if (!set) return;
        set.delete(component);
    }

    /**
     * Collect all live components of `ctor` registered against `view`
     * whose `visibleLayer` intersects `layerMask`. Pass
     * {@link VisibleLayer.All} (`0xFFFFFFFF`) to skip layer filtering —
     * the bitwise AND then matches every bit.
     *
     * The caller owns `out`: it is cleared (`length = 0`) on entry and
     * populated in place, so a pass can hold a scratch array as a
     * member field and reuse it across frames without GC pressure
     * (mirrors {@link EntityCollect.getLayerLists}'s buffer-reuse
     * pattern). The returned reference is the same `out` for chaining.
     *
     * Callers that want to honour a camera's `cullingMask` should
     * pre-AND it into `layerMask` themselves; the predicate inside
     * does not re-read camera state.
     *
     * @param view       The View3D this pass executes against. A
     *                   `null` view returns immediately.
     * @param ctor       Concrete component class to enumerate. Must
     *                   match what {@link register} stored — i.e. the
     *                   subclass, not a base.
     * @param layerMask  Already-combined pass × camera mask.
     * @param out        Scratch array, owned by the caller; mutated.
     */
    public static collectByTypeLayered<T extends IComponent & { visibleLayer: number, enable: boolean }>(
        view: View3D,
        ctor: Function,
        layerMask: number,
        out: T[],
    ): T[] {
        this.init();
        out.length = 0;
        if (!view) return out;
        const perView = this.componentsByType.get(view);
        if (!perView) return out;
        const set = perView.get(ctor);
        if (!set || set.size === 0) return out;
        const mask = (layerMask & VisibleLayer.All) >>> 0;
        if (mask === 0) return out;
        for (const comp of set) {
            const c = comp as unknown as T;
            if (!c.enable) continue;
            if (((c.visibleLayer | 0) & mask) === 0) continue;
            out.push(c);
        }
        return out;
    }

    // Called from Engine3D.dispose() so a disposed engine's View3D entries
    // don't linger in every per-view static map (would leak the View3D, its
    // scene tree, and every registered component callback).
    public static removeView(view: View3D) {
        this.init();
        this.componentsUpdateList.delete(view);
        this.componentsLateUpdateList.delete(view);
        this.componentsBeforeUpdateList.delete(view);
        this.componentsComputeList.delete(view);
        this.componentsEnablePickerList.delete(view);
        this.graphicComponent.delete(view);
        this.componentsByType.delete(view);
    }

    // Some components bind with a null View3D because their owning Object3D
    // was never attached to a scene (ViewQuad, CSM shadow cameras, cube
    // cameras). Those live under a shared `view=null` key in every inner map,
    // so per-view eviction cannot reach them. Purge all null-keyed entries
    // whose component or object3D was bound to the given ctx.
    public static removeNullViewEntriesForCtx(ctx: unknown) {
        this.init();
        const lists = [
            this.componentsUpdateList,
            this.componentsLateUpdateList,
            this.componentsBeforeUpdateList,
            this.componentsComputeList,
            this.graphicComponent,
        ];
        for (const list of lists) {
            const inner = list.get(null as any);
            if (!inner) continue;
            for (const comp of [...inner.keys()]) {
                const compCtx = (comp as any)._boundCtx;
                const objCtx = (comp as any).object3D?._boundCtx;
                if (compCtx === ctx || objCtx === ctx) {
                    inner.delete(comp);
                }
            }
            if (inner.size === 0) list.delete(null as any);
        }
    }
}
