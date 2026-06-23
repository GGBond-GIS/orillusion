import { CEvent } from "../../event/CEvent";
import { AnimatorComponent } from "./AnimatorComponent";

/**
 * Animator event payload.
 *
 * Dispatched by clip states when a tagged keyframe is reached. The
 * `animator` field references the AnimatorComponent that owns the clip,
 * letting the listener cross-check state, query weights, etc.
 *
 * @group Animation
 */
export class OAnimationEvent extends CEvent {
    public animator: AnimatorComponent;

    constructor(name: string, time: number) {
        super();
        this.type = name;
        this.time = time;
    }
}
