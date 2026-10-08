import { guardArity } from './bridgeGuard';
import { unwrapPromise } from './envelope';
import type { WireError } from '../utils/parseError';

interface VoidResult {
    error?: WireError;
}

export interface LaunchTarget {
    kind: 'file' | 'folder';
    path: string;
}

interface LaunchTargetResult {
    error?: WireError;
    kind?: string;
    path?: string;
}

export interface NativeWindowGeometry {
    height: number;
    maximized: boolean;
    width: number;
}

export interface WindowBindings {
    retryStartup: () => Promise<VoidResult>;
    windowReady: () => Promise<VoidResult>;
    openNewWindow: (folderPath: string) => Promise<VoidResult>;
    takeLaunchTarget: () => Promise<LaunchTargetResult>;
    printWindow: () => Promise<VoidResult>;
    windowFullscreen: () => void;
    windowGetSize: () => Promise<{ h: number; w: number }>;
    windowIsFullscreen: () => Promise<boolean>;
    windowIsMaximised: () => Promise<boolean>;
    windowUnfullscreen: () => void;
}

export interface WindowAdapter {
    retryStartup: () => Promise<void>;
    windowReady: () => Promise<void>;
    openNewWindow: (folderPath: string) => Promise<void>;
    /** Takes the file or folder this window accepted at startup, once; undefined when there is none. */
    takeLaunchTarget: () => Promise<LaunchTarget | undefined>;
    /** Opens the operating system's print dialog for the window's print copy. */
    printWindow: () => Promise<void>;
    isFullscreen: () => Promise<boolean>;
    enterFullscreen: () => Promise<boolean>;
    exitFullscreen: () => Promise<boolean>;
    getNativeGeometry: () => Promise<NativeWindowGeometry>;
    toggleFullscreen: () => Promise<boolean>;
}

// createWindowAdapter keeps public Wails window lifecycle calls in the sole
// generated-binding adapter boundary.
export function createWindowAdapter(bindings: WindowBindings): WindowAdapter {
    const retryStartup = guardArity('ApplicationHandler.RetryStartup', bindings.retryStartup);
    const windowReady = guardArity('ApplicationHandler.WindowReady', bindings.windowReady);
    const openNewWindow = guardArity('ApplicationHandler.OpenNewWindow', async (folderPath: string): Promise<void> =>
        unwrapPromise(bindings.openNewWindow(folderPath)),
    );
    const takeLaunchTarget = guardArity(
        'ApplicationHandler.TakeLaunchTarget',
        async (): Promise<LaunchTarget | undefined> =>
            unwrapPromise(
                bindings.takeLaunchTarget().then(({ error, kind, path }) => ({
                    data:
                        path === undefined || path === ''
                            ? undefined
                            : { kind: kind === 'folder' ? 'folder' : 'file', path },
                    error,
                })),
            ) as Promise<LaunchTarget | undefined>,
    );
    const printWindow = guardArity('ApplicationHandler.PrintWindow', bindings.printWindow);
    const windowIsFullscreen = guardArity('WindowIsFullscreen', bindings.windowIsFullscreen);
    const windowGetSize = guardArity('WindowGetSize', bindings.windowGetSize);
    const windowIsMaximised = guardArity('WindowIsMaximised', bindings.windowIsMaximised);
    return {
        retryStartup: (): Promise<void> => unwrapPromise(retryStartup()),
        windowReady: (): Promise<void> => unwrapPromise(windowReady()),
        openNewWindow,
        takeLaunchTarget,
        printWindow: (): Promise<void> => unwrapPromise(printWindow()),
        isFullscreen: (): Promise<boolean> => windowIsFullscreen(),
        async getNativeGeometry(): Promise<NativeWindowGeometry> {
            const [size, maximized] = await Promise.all([windowGetSize(), windowIsMaximised()]);
            return { height: size.h, maximized, width: size.w };
        },
        async enterFullscreen(): Promise<boolean> {
            if (!(await windowIsFullscreen())) {
                bindings.windowFullscreen();
            }
            return windowIsFullscreen();
        },
        async exitFullscreen(): Promise<boolean> {
            if (await windowIsFullscreen()) {
                bindings.windowUnfullscreen();
            }
            return windowIsFullscreen();
        },
        async toggleFullscreen(): Promise<boolean> {
            if (await windowIsFullscreen()) {
                bindings.windowUnfullscreen();
            } else {
                bindings.windowFullscreen();
            }
            return windowIsFullscreen();
        },
    };
}
