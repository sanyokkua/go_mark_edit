import { createWindowAdapter, type WindowBindings } from '../../../src/logic/adapter/windowAdapter';

it('uses public query/enter/exit operations and returns native full-screen state', async () => {
    let fullscreen = false;
    const bindings: WindowBindings = {
        retryStartup: jest.fn(async () => ({})),
        windowReady: jest.fn(async () => ({})),
        openNewWindow: jest.fn(async () => ({})),
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

it('invokes repeatable startup through the guarded typed command', async () => {
    const bindings: WindowBindings = {
        retryStartup: jest.fn(async () => ({})),
        windowReady: jest.fn(async () => ({})),
        openNewWindow: jest.fn(async () => ({})),
        windowFullscreen: jest.fn(),
        windowGetSize: jest.fn(async () => ({ h: 768, w: 1024 })),
        windowIsFullscreen: jest.fn(async () => false),
        windowIsMaximised: jest.fn(async () => false),
        windowUnfullscreen: jest.fn(),
    };

    await expect(createWindowAdapter(bindings).retryStartup()).resolves.toBeUndefined();
    expect(bindings.retryStartup).toHaveBeenCalledTimes(1);
});

it('When a folder path is given, the window adapter opens a new application window with that path.', async (): Promise<void> => {
    const openedFolderPaths: string[] = [];
    const openNewWindow = jest.fn(async (folderPath: string) => {
        openedFolderPaths.push(folderPath);
        return {};
    });
    const bindings: WindowBindings = {
        retryStartup: async () => ({}),
        windowReady: async () => ({}),
        openNewWindow,
        windowFullscreen: (): void => undefined,
        windowGetSize: async () => ({ h: 768, w: 1024 }),
        windowIsFullscreen: async (): Promise<boolean> => false,
        windowIsMaximised: async (): Promise<boolean> => false,
        windowUnfullscreen: (): void => undefined,
    };
    const adapter = createWindowAdapter(bindings);

    expect(adapter.openNewWindow).toEqual(expect.any(Function));
    await expect(adapter.openNewWindow('/tmp/project')).resolves.toBeUndefined();
    await expect(Reflect.apply(adapter.openNewWindow, undefined, [])).rejects.toThrow(
        'ApplicationHandler.OpenNewWindow expects 1 argument(s), received 0.',
    );
    expect(openNewWindow).toHaveBeenCalledWith('/tmp/project');
    expect(openedFolderPaths).toEqual(['/tmp/project']);
});
