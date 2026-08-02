import type { AnimatorComponent } from "../AnimatorComponent";

export interface AnimatorParams {
    getFloat(name: string): number;
    setFloat(name: string, v: number): void;
    getBool(name: string): boolean;
    setBool(name: string, v: boolean): void;
    getTrigger(name: string): boolean;
    setTrigger(name: string): void;
    consumeTrigger(name: string): boolean;
}

class DefaultParams implements AnimatorParams {
    private _f: Map<string, number> = new Map();
    private _b: Map<string, boolean> = new Map();
    private _t: Set<string> = new Set();

    getFloat(name: string): number { return this._f.get(name) ?? 0; }
    setFloat(name: string, v: number): void { this._f.set(name, v); }
    getBool(name: string): boolean { return this._b.get(name) ?? false; }
    setBool(name: string, v: boolean): void { this._b.set(name, v); }
    getTrigger(name: string): boolean { return this._t.has(name); }
    setTrigger(name: string): void { this._t.add(name); }
    consumeTrigger(name: string): boolean {
        if (this._t.has(name)) { this._t.delete(name); return true; }
        return false;
    }
}

export type Condition = (p: AnimatorParams) => boolean;

export interface TransitionDef {
    to: string;
    condition: Condition;
    /** Crossfade duration in seconds. */
    duration: number;
    /** Initial time of the destination clip in seconds. Defaults to 0. */
    offset?: number;
    /** If true, this transition can fire even mid-fade. Defaults to false. */
    interruptible?: boolean;
}

export interface StateDef {
    name: string;
    /** Clip name to play in this state. */
    clip: string;
    /** Optional time scale for this state's clip. Defaults to 1. */
    speed?: number;
    transitions: TransitionDef[];
}

/**
 * Lightweight, data-driven animation state machine.
 *
 * Plug into an AnimatorComponent via `animator.setStateMachine(fsm)`. On every
 * onUpdate the FSM advances time, evaluates transitions, and may issue a
 * crossFade on the underlying animator.
 *
 * Why no visual graph editor: shipping a graph UX is a multi-year investment.
 * A JSON/TS DSL covers 90% of use cases at <5% the cost; DCC tooling
 * (Blender / Maya) is the right home for authoring.
 *
 * @group Animation
 */
export class StateMachine {
    private _states: Map<string, StateDef> = new Map();
    private _current: StateDef;
    private _transitionTime: number = 0;
    private _transitioning: boolean = false;
    private _params: AnimatorParams;

    constructor(states: StateDef[], initial?: string, params?: AnimatorParams) {
        if (states.length === 0) throw new Error('StateMachine requires at least one state');
        for (const s of states) this._states.set(s.name, s);
        const initName = initial ?? states[0].name;
        const init = this._states.get(initName);
        if (!init) throw new Error(`StateMachine: unknown initial state '${initName}'`);
        this._current = init;
        this._params = params ?? new DefaultParams();
    }

    public get params(): AnimatorParams { return this._params; }
    public get currentState(): StateDef { return this._current; }
    public get currentStateName(): string { return this._current.name; }

    /**
     * Convenience: ensure the underlying animator is playing the right clip.
     * Should be called once after attaching the FSM, or any time external
     * code wants to force a sync.
     */
    public sync(animator: AnimatorComponent): void {
        animator.playAnim(this._current.clip, 0, this._current.speed ?? 1);
    }

    /** Called by AnimatorComponent.onUpdate every frame. */
    public evaluate(animator: AnimatorComponent, dt: number): void {
        if (this._transitioning) {
            this._transitionTime += dt;
            // We don't actively drive the visual crossfade here — the
            // AnimatorComponent's _crossFadeState (set up by crossFade())
            // handles weight blending. This flag just gates which transitions
            // are interruptible.
        }

        // Look at outgoing transitions from the current state. First match wins.
        for (const t of this._current.transitions) {
            if (this._transitioning && !t.interruptible) continue;
            if (!t.condition(this._params)) continue;

            const next = this._states.get(t.to);
            if (!next) {
                console.warn(`StateMachine: transition target '${t.to}' not found`);
                continue;
            }

            if (t.duration > 0.001) {
                animator.crossFade(next.clip, t.duration);
            } else {
                animator.playAnim(next.clip, t.offset ?? 0, next.speed ?? 1);
            }
            this._current = next;
            this._transitioning = t.duration > 0.001;
            this._transitionTime = 0;
            return;
        }
    }
}

export function makeAnimatorParams(): AnimatorParams { return new DefaultParams(); }
