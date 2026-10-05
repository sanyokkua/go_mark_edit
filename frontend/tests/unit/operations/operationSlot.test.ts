import { act, renderHook } from '@testing-library/react';

import { acquire, getSnapshot, subscribe } from '../../../src/logic/operations/operationSlot';
import { useOperationSlot } from '../../../src/logic/operations/useOperationSlot';

const ONE_MIB = 1024 * 1024;

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

it('holds one run and returns to the stable idle snapshot on idempotent release', () => {
    const idle = getSnapshot();
    expect(idle).toEqual({ state: 'idle' });

    const handle = acquire('format', { documentId: 'document-a', size: 12 });
    expect(handle).not.toBeNull();
    expect(getSnapshot()).toEqual({
        state: 'running',
        kind: 'format',
        documentId: 'document-a',
        progress: null,
    });
    expect(acquire('lint', { documentId: 'document-b', size: 12 })).toBeNull();
    expect(getSnapshot()).toBe(getSnapshot());

    handle?.release();
    expect(getSnapshot()).toBe(idle);
    handle?.release();
    expect(getSnapshot()).toBe(idle);
});

it('shows progress immediately only when size is strictly greater than one MiB', () => {
    const atLimit = acquire('compact', { documentId: 'document-a', size: ONE_MIB });
    expect(getSnapshot()).toEqual({
        state: 'running',
        kind: 'compact',
        documentId: 'document-a',
        progress: null,
    });
    atLimit?.release();

    const overLimit = acquire('lint', { documentId: 'document-b', size: ONE_MIB + 1 });
    expect(getSnapshot()).toEqual({
        state: 'running',
        kind: 'lint',
        documentId: 'document-b',
        progress: { done: 0, total: 0 },
    });
    overLimit?.release();
});

it('keeps small-run progress hidden until one second and reveals the latest values', () => {
    const handle = acquire('format', { documentId: 'document-a', size: 100 });
    handle?.setProgress(2, 5);
    expect(getSnapshot()).toMatchObject({ progress: null });

    jest.advanceTimersByTime(999);
    expect(getSnapshot()).toMatchObject({ progress: null });
    jest.advanceTimersByTime(1);
    expect(getSnapshot()).toMatchObject({ progress: { done: 2, total: 5 } });

    handle?.setProgress(3, 5);
    expect(getSnapshot()).toMatchObject({ progress: { done: 3, total: 5 } });
    handle?.release();
});

it('aborts the signal but keeps the slot held until release', () => {
    const handle = acquire('format', { documentId: 'document-a', size: 100 });
    expect(handle?.signal.aborted).toBe(false);

    handle?.abort();
    expect(handle?.signal.aborted).toBe(true);
    expect(getSnapshot()).toMatchObject({ state: 'running' });
    expect(acquire('compact', { documentId: 'document-b', size: 100 })).toBeNull();

    handle?.release();
    expect(getSnapshot()).toEqual({ state: 'idle' });
});

it('notifies once for each visible change and stops after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    const handle = acquire('format', { documentId: 'document-a', size: ONE_MIB + 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    handle?.setProgress(1, 3);
    expect(listener).toHaveBeenCalledTimes(2);
    handle?.setProgress(1, 3);
    handle?.abort();
    expect(listener).toHaveBeenCalledTimes(2);

    handle?.release();
    handle?.release();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    const next = acquire('lint', { documentId: 'document-b', size: ONE_MIB + 1 });
    next?.release();
    expect(listener).toHaveBeenCalledTimes(3);
});

it('does not notify for hidden progress before a small run becomes visible', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    const handle = acquire('compact', { documentId: 'document-a', size: 10 });
    handle?.setProgress(1, 2);
    handle?.setProgress(2, 2);
    expect(listener).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSnapshot()).toMatchObject({ progress: { done: 2, total: 2 } });
    handle?.release();
    unsubscribe();
});

it('ignores an old handle and its timer after a newer run acquires the slot', () => {
    const old = acquire('format', { documentId: 'document-a', size: 1 });
    jest.advanceTimersByTime(500);
    old?.release();

    const next = acquire('lint', { documentId: 'document-b', size: 1 });
    old?.setProgress(99, 100);
    old?.abort();
    old?.release();
    jest.advanceTimersByTime(500);
    expect(getSnapshot()).toEqual({
        state: 'running',
        kind: 'lint',
        documentId: 'document-b',
        progress: null,
    });

    jest.advanceTimersByTime(500);
    expect(getSnapshot()).toMatchObject({ progress: { done: 0, total: 0 } });
    next?.release();
    expect(jest.getTimerCount()).toBe(0);
});

it('updates the React hook and stops updates after unmount', () => {
    const { result, unmount } = renderHook(() => useOperationSlot());
    expect(result.current).toEqual({ state: 'idle' });

    let handle: ReturnType<typeof acquire> = null;
    act(() => {
        handle = acquire('compact', { documentId: 'document-a', size: ONE_MIB + 1 });
    });
    expect(result.current).toMatchObject({ state: 'running', progress: { done: 0, total: 0 } });
    act(() => {
        handle?.setProgress(1, 2);
    });
    expect(result.current).toMatchObject({ progress: { done: 1, total: 2 } });

    unmount();
    act(() => {
        handle?.release();
    });
    expect(result.current).toMatchObject({ state: 'running', progress: { done: 1, total: 2 } });
});
