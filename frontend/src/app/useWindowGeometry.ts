import { useEffect } from 'react';

import { appModelAdapter, windowAdapter } from '../logic/adapter';

/** Persist native geometry only while the application is ready. */
export function useWindowGeometry(status: 'loading' | 'ready' | 'failed'): void {
    useEffect(() => {
        if (status !== 'ready') return undefined;
        let disposed = false;
        const report = (): void => {
            void windowAdapter
                .getNativeGeometry()
                .then(async (geometry) => {
                    if (disposed) return;
                    await appModelAdapter.setUILayout({
                        windowHeight: geometry.height,
                        windowWidth: geometry.width,
                        windowMaximized: geometry.maximized,
                    });
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
