import { guardArity } from './bridgeGuard';
import { unwrapPromise } from './envelope';
import type { WireError } from '../utils/parseError';

interface VoidResult {
  error?: WireError;
}

export interface NativeWindowGeometry {
  height: number;
  maximized: boolean;
  width: number;
}

export interface WindowBindings {
  retryStartup: () => Promise<VoidResult>;
  windowReady: () => Promise<VoidResult>;
  windowFullscreen: () => void;
  windowGetSize: () => Promise<{ h: number; w: number }>;
  windowIsFullscreen: () => Promise<boolean>;
  windowIsMaximised: () => Promise<boolean>;
  windowUnfullscreen: () => void;
}

export interface WindowAdapter {
  retryStartup: () => Promise<void>;
  windowReady: () => Promise<void>;
  isFullscreen: () => Promise<boolean>;
  enterFullscreen: () => Promise<boolean>;
  exitFullscreen: () => Promise<boolean>;
  getNativeGeometry: () => Promise<NativeWindowGeometry>;
  toggleFullscreen: () => Promise<boolean>;
}

// createWindowAdapter keeps public Wails window lifecycle calls in the sole
// generated-binding adapter boundary.
export function createWindowAdapter(bindings: WindowBindings): WindowAdapter {
  const retryStartup = guardArity(
    'ApplicationHandler.RetryStartup',
    bindings.retryStartup,
  );
  const windowReady = guardArity(
    'ApplicationHandler.WindowReady',
    bindings.windowReady,
  );
  const windowIsFullscreen = guardArity(
    'WindowIsFullscreen',
    bindings.windowIsFullscreen,
  );
  const windowGetSize = guardArity('WindowGetSize', bindings.windowGetSize);
  const windowIsMaximised = guardArity(
    'WindowIsMaximised',
    bindings.windowIsMaximised,
  );
  return {
    retryStartup: (): Promise<void> => unwrapPromise(retryStartup()),
    windowReady: (): Promise<void> => unwrapPromise(windowReady()),
    isFullscreen: (): Promise<boolean> => windowIsFullscreen(),
    async getNativeGeometry(): Promise<NativeWindowGeometry> {
      const [size, maximized] = await Promise.all([
        windowGetSize(),
        windowIsMaximised(),
      ]);
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
