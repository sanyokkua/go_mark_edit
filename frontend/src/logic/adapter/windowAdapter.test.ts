import { createWindowAdapter } from './windowAdapter';

it('FR-WS-004 uses public query/enter/exit operations and returns native full-screen state', async () => {
  let fullscreen = false;
  const bindings = {
    retryStartup: jest.fn(async () => ({})),
    windowReady: jest.fn(async () => ({})),
    windowFullscreen: jest.fn((): void => {
      fullscreen = true;
    }),
    windowGetSize: jest.fn(async () => ({ h: 768, w: 1024 })),
    windowIsFullscreen: jest.fn(async (): Promise<boolean> => fullscreen),
    windowIsMaximised: jest.fn(async () => false),
    windowUnfullscreen: jest.fn((): void => {
      fullscreen = false;
    }),
  };
  const adapter = createWindowAdapter(bindings);

  await expect(adapter.isFullscreen()).resolves.toBe(false);
  await expect(adapter.enterFullscreen()).resolves.toBe(true);
  await expect(adapter.toggleFullscreen()).resolves.toBe(false);
  await expect(adapter.exitFullscreen()).resolves.toBe(false);
  await expect(adapter.getNativeGeometry()).resolves.toEqual({
    height: 768,
    maximized: false,
    width: 1024,
  });

  expect(bindings.windowFullscreen).toHaveBeenCalledTimes(1);
  expect(bindings.windowUnfullscreen).toHaveBeenCalledTimes(1);
  expect(bindings.windowReady).not.toHaveBeenCalled();
  expect(bindings.retryStartup).not.toHaveBeenCalled();
});

it('FR-WS-013 invokes repeatable startup through the guarded typed command', async () => {
  const bindings = {
    retryStartup: jest.fn(async () => ({})),
    windowReady: jest.fn(async () => ({})),
    windowFullscreen: jest.fn(),
    windowGetSize: jest.fn(async () => ({ h: 768, w: 1024 })),
    windowIsFullscreen: jest.fn(async () => false),
    windowIsMaximised: jest.fn(async () => false),
    windowUnfullscreen: jest.fn(),
  };

  await expect(
    createWindowAdapter(bindings).retryStartup(),
  ).resolves.toBeUndefined();
  expect(bindings.retryStartup).toHaveBeenCalledTimes(1);
});
