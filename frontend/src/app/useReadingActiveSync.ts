import { useEffect, useRef } from 'react';

import { appModelAdapter } from '../logic/adapter';
import { useAppSelector } from '../logic/store';

/*
 * The backend remembers the last-used mode so "Remember last used" can reopen in Reading mode.
 * Reading presentation stays a frontend projection; this reports each change of `reading.active`,
 * whichever path (enter, leave, toggle, reset) made it. A failed report is ignored: it must never
 * break the Reading UI.
 */
export function useReadingActiveSync(status: 'loading' | 'ready' | 'failed'): void {
    const active = useAppSelector((state) => state.reading.active);
    const reported = useRef(false);
    const queue = useRef<Promise<void>>(Promise.resolve());
    useEffect((): void => {
        if (status !== 'ready' || reported.current === active) return;
        reported.current = active;
        // Calls are chained so the backend sees the changes in the order they happened. A failed call
        // forgets it was reported, so the state is sent again the next time it differs from the backend's.
        queue.current = queue.current.then(async (): Promise<void> => {
            try {
                await appModelAdapter.setReadingActive(active);
            } catch {
                reported.current = !active;
            }
        });
    }, [active, status]);
}
