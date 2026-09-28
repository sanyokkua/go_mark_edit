export const EVENTS = {
    statePatch: 'state:patch',
    stateError: 'state:error',
    applicationCloseRequested: 'application:close-requested',
} as const;

export type AdapterEventName = (typeof EVENTS)[keyof typeof EVENTS];
import { OnFileDrop, OnFileDropOff } from 'wailsjs/runtime';

/** The native runtime owns the paths; DOM drop events provide feedback only. */
export function subscribeFileDrops(onPaths: (paths: string[]) => void): () => void {
    OnFileDrop((_x, _y, paths) => onPaths(paths), false);
    return () => OnFileDropOff();
}
