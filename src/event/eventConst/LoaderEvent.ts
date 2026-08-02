import { CEvent } from '../CEvent';
/**
 * enum loader event
 * @internal
 */
export class LoaderEvent extends CEvent {
    public static LOADER_PROGRESS: string = 'loaderProgress';
    public static LOADER_COMPLETE: string = 'loaderComplete';
}
