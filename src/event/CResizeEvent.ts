import { CEvent } from './CEvent';
/**
 * size change event when canvas resized
 * @internal
 */
export class CResizeEvent extends CEvent {
    /**
     *
     * RESIZE:enum event type
     */
    static RESIZE: string = 'resize';
}
