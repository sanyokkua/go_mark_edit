import { useEffect } from 'react';

import { appModelAdapter, windowAdapter } from '../logic/adapter';

/** Persist native geometry only while the application is ready. */
export function useWindowGeometry(status: 'loading' | 'ready' | 'failed'): void {
    useEffect(() => {
        if (status !== 'ready') return undefined;
        let disposed = false;
        let lastMaximized: boolean | undefined;
        let maximizedAttempt = 0;
        const report = (): void => {
            void windowAdapter
                .getNativeGeometry()
                .then(async (geometry) => {
                    if (disposed) return;
                    const changed = lastMaximized !== geometry.maximized;
                    const attempt = changed ? ++maximizedAttempt : undefined;
                    if (changed) lastMaximized = geometry.maximized;
                    try {
                        await appModelAdapter.setUILayout({
                            windowHeight: geometry.height,
                            windowWidth: geometry.width,
                            ...(changed ? { windowMaximized: geometry.maximized } : {}),
                        });
                    } catch {
                        if (attempt !== undefined && attempt === maximizedAttempt) lastMaximized = undefined;
                    }
                })
                .catch(() => undefined);
        };
        window.addEventListener('resize', report);
        return () => {
            disposed = true;
            window.removeEventListener('resize', report);
        };
    }, [status]);
}
