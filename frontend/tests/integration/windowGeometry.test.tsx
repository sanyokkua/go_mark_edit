import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: { setUILayout: jest.fn() },
    windowAdapter: { getNativeGeometry: jest.fn() },
}));

import { appModelAdapter, windowAdapter } from '../../src/logic/adapter';
import { useWindowGeometry } from '../../src/app/useWindowGeometry';
import { createCommandRecorder } from '../support/commandRecorder';

it('subscribes to resize only while ready and disposes the native geometry listener', () => {
    const recorder = createCommandRecorder();
    const read = recorder.binding('GetNativeGeometry');
    (windowAdapter.getNativeGeometry as jest.Mock).mockImplementation(() => read({ id: 'geometry' }));
    const owner = renderHook(({ status }: { status: 'loading' | 'ready' | 'failed' }) => useWindowGeometry(status), {
        initialProps: { status: 'loading' },
    });
    fireEvent.resize(window);
    expect(recorder.calls).toHaveLength(0);
    owner.rerender({ status: 'ready' });
    fireEvent.resize(window);
    expect(recorder.calls).toEqual([{ name: 'GetNativeGeometry', requestId: 'geometry', args: [] }]);
    owner.rerender({ status: 'failed' });
    fireEvent.resize(window);
    expect(recorder.calls).toHaveLength(1);
    owner.rerender({ status: 'ready' });
    owner.unmount();
    fireEvent.resize(window);
    expect(recorder.calls).toHaveLength(1);
});

type Geometry = { width: number; height: number; maximized: boolean };
type Layout = { windowWidth?: number; windowHeight?: number; windowMaximized?: boolean };

function recordedLayouts(): Layout[] {
    const calls = (appModelAdapter.setUILayout as jest.Mock).mock.calls as [Layout][];
    return calls.map(([layout]) => layout);
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((accept, fail) => {
        resolve = accept;
        reject = fail;
    });
    return { promise, resolve, reject };
}
function resizeWith(geometry: Geometry): void {
    (windowAdapter.getNativeGeometry as jest.Mock).mockResolvedValueOnce(geometry);
    fireEvent.resize(window);
}
beforeEach(() => {
    jest.resetAllMocks();
    (appModelAdapter.setUILayout as jest.Mock).mockResolvedValue(undefined);
});

it('reports dimensions on every resize and maximized only when its value changes', async () => {
    renderHook(() => useWindowGeometry('ready'));
    const states = [false, false, true, true, false];
    for (const [index, maximized] of states.entries()) {
        resizeWith({ width: 800 + index, height: 600 + index, maximized });
        await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(index + 1));
    }
    const layouts = recordedLayouts();
    expect(layouts.map(({ windowWidth, windowHeight }) => [windowWidth, windowHeight])).toEqual([
        [800, 600],
        [801, 601],
        [802, 602],
        [803, 603],
        [804, 604],
    ]);
    expect(layouts.filter((layout) => 'windowMaximized' in layout).map((layout) => layout.windowMaximized)).toEqual([
        false,
        true,
        false,
    ]);
});

it('sends windowMaximized once across N resizes that leave the maximized state unchanged', async () => {
    renderHook(() => useWindowGeometry('ready'));
    for (let index = 0; index < 5; index++) {
        resizeWith({ width: 800 + index, height: 600, maximized: true });
        await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(index + 1));
    }
    const layouts = recordedLayouts();
    expect(layouts.map((layout) => layout.windowWidth)).toEqual([800, 801, 802, 803, 804]);
    expect(layouts.filter((layout) => 'windowMaximized' in layout)).toEqual([
        expect.objectContaining({ windowMaximized: true }),
    ]);
});

it('deduplicates identical in-flight maximized reports and retries after rejection', async () => {
    const first = deferred<void>();
    (appModelAdapter.setUILayout as jest.Mock).mockReturnValueOnce(first.promise);
    renderHook(() => useWindowGeometry('ready'));
    resizeWith({ width: 800, height: 600, maximized: false });
    resizeWith({ width: 810, height: 610, maximized: false });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(2));
    expect(recordedLayouts()[0].windowMaximized).toBe(false);
    expect(recordedLayouts()[1]).not.toHaveProperty('windowMaximized');
    await act(() => {
        first.reject(new Error('layout unavailable'));
        return Promise.resolve();
    });
    resizeWith({ width: 820, height: 620, maximized: false });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(3));
    expect(recordedLayouts()[2].windowMaximized).toBe(false);
});

it('does not let stale or dimensions-only failures erase the latest maximized report', async () => {
    const older = deferred<void>();
    const widthOnly = deferred<void>();
    (appModelAdapter.setUILayout as jest.Mock)
        .mockReturnValueOnce(older.promise)
        .mockResolvedValueOnce(undefined)
        .mockReturnValueOnce(widthOnly.promise);
    renderHook(() => useWindowGeometry('ready'));
    resizeWith({ width: 800, height: 600, maximized: false });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(1));
    resizeWith({ width: 810, height: 610, maximized: true });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(2));
    resizeWith({ width: 820, height: 620, maximized: true });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(3));
    await act(() => {
        older.reject(new Error('old failure'));
        widthOnly.reject(new Error('width failure'));
        return Promise.resolve();
    });
    resizeWith({ width: 830, height: 630, maximized: true });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(4));
    expect(recordedLayouts()[3]).not.toHaveProperty('windowMaximized');
});

it('retries a failed newer transition even if an older report is still pending', async () => {
    const older = deferred<void>();
    const newer = deferred<void>();
    (appModelAdapter.setUILayout as jest.Mock).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    renderHook(() => useWindowGeometry('ready'));
    resizeWith({ width: 800, height: 600, maximized: false });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(1));
    resizeWith({ width: 810, height: 610, maximized: true });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(2));
    await act(() => {
        newer.reject(new Error('new failure'));
        return Promise.resolve();
    });
    resizeWith({ width: 820, height: 620, maximized: true });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(3));
    expect(recordedLayouts()[2].windowMaximized).toBe(true);
    await act(() => {
        older.reject(new Error('old failure'));
        return Promise.resolve();
    });
    resizeWith({ width: 830, height: 630, maximized: true });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(4));
    expect(recordedLayouts()[3]).not.toHaveProperty('windowMaximized');
});

it('ignores geometry returned after the ready subscription is disposed', async () => {
    const geometry = deferred<Geometry>();
    (windowAdapter.getNativeGeometry as jest.Mock).mockReturnValueOnce(geometry.promise);
    const owner = renderHook(() => useWindowGeometry('ready'));
    fireEvent.resize(window);
    owner.unmount();
    await act(() => {
        geometry.resolve({ width: 800, height: 600, maximized: false });
        return Promise.resolve();
    });
    expect(appModelAdapter.setUILayout).not.toHaveBeenCalled();
});

it('keeps the last maximized value after a native geometry read fails', async () => {
    renderHook(() => useWindowGeometry('ready'));
    resizeWith({ width: 800, height: 600, maximized: false });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(1));
    (windowAdapter.getNativeGeometry as jest.Mock).mockRejectedValueOnce(new Error('native read failed'));
    fireEvent.resize(window);
    await act(() => Promise.resolve());
    resizeWith({ width: 810, height: 610, maximized: false });
    await waitFor(() => expect(appModelAdapter.setUILayout).toHaveBeenCalledTimes(2));
    expect(recordedLayouts()[1]).not.toHaveProperty('windowMaximized');
});
