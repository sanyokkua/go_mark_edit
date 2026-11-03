import { act, renderHook } from '@testing-library/react';
import { useEffect } from 'react';

import {
    BUFFER_SYNC_MS,
    createAppModelAdapter,
    type AppModelRuntime,
    type AcceptedBuffer,
} from '../../../src/logic/adapter/appModelAdapter';
import { store } from '../../../src/logic/store';
import { dismissNotification, notifyError } from '../../../src/logic/store/notificationsSlice';
import type { AppModelState } from '../../../src/logic/store/appModelTypes';
import type { WireError } from '../../../src/logic/utils/parseError';
import * as utf8 from '../../../src/logic/utils/utf8ByteLength';
import { PREVIEW_BYTE_LIMIT, usePreviewPaneState } from '../../../src/ui/widgets/PreviewPane';
import {
    type LivePreviewAdapter,
    useLivePreview,
    useLivePreviewSnapshot,
} from '../../../src/logic/hooks/useLivePreview';

type VoidResult = { error?: WireError };

const state: AppModelState = {
    snapshot: {
        revision: 1,
        documents: {},
        activeDocumentId: '',
        ui: {},
    },
    activeBuffer: { documentId: '', content: '' },
};

const runtime: AppModelRuntime = {
    eventsOn: (): (() => void) => (): void => undefined,
};

function createBufferAdapter(updateBuffer: (documentId: string, content: string) => Promise<VoidResult>) {
    return createAppModelAdapter(
        {
            getState: async (): Promise<{ data: AppModelState }> => ({ data: state }),
            updateBuffer,
            setDocView: async (): Promise<VoidResult> => ({}),
            setUILayout: async (): Promise<VoidResult> => ({}),
        },
        runtime,
    );
}

afterEach((): void => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    for (const notification of store.getState().notifications.items) {
        store.dispatch(dismissNotification(notification.id));
    }
});

it('adopts accepted edits while hidden and measures only the latest content on reveal', () => {
    let listener: ((buffer: AcceptedBuffer) => void) | undefined;
    const adapter: LivePreviewAdapter = {
        subscribeAcceptedBuffers(callback) {
            listener = callback;
            return () => undefined;
        },
    };
    const measure = jest.spyOn(utf8, 'utf8ByteLength');
    const source = { documentId: 'one', content: 'original', documentRevision: 1 };
    const { result, rerender } = renderHook(({ buffer, visible }) => useLivePreviewSnapshot(buffer, visible, adapter), {
        initialProps: { buffer: source, visible: false },
    });
    act(() => {
        listener?.({ documentId: 'one', content: 'intermediate', generation: 1 });
        listener?.({ documentId: 'one', content: 'new 😀', generation: 2 });
        listener?.({ documentId: 'one', content: 'stale', generation: 1 });
    });
    expect(result.current.content).toBe('new 😀');
    expect(measure).not.toHaveBeenCalled();

    rerender({ buffer: source, visible: true });
    expect(result.current.byteLength).toBe(8);
    expect(measure).toHaveBeenCalledTimes(1);
    expect(measure).toHaveBeenLastCalledWith('new 😀');

    rerender({ buffer: { documentId: 'one', content: 'reloaded 漢', documentRevision: 2 }, visible: false });
    expect(result.current.content).toBe('reloaded 漢');
    expect(measure).toHaveBeenCalledTimes(1);
    act(() => {
        listener?.({ documentId: 'one', content: 'after reload', generation: 1 });
    });
    rerender({ buffer: { documentId: 'one', content: 'reloaded 漢', documentRevision: 2 }, visible: true });
    expect(result.current.content).toBe('after reload');
    expect(result.current.byteLength).toBe(12);
    expect(measure).toHaveBeenCalledTimes(2);
});

it('pauses a hidden oversized edit on first reveal and retains a manual refresh across visibility changes', async () => {
    let listener: ((buffer: AcceptedBuffer) => void) | undefined;
    const adapter: LivePreviewAdapter = {
        subscribeAcceptedBuffers(callback) {
            listener = callback;
            return () => undefined;
        },
    };
    const content = 'é'.repeat(PREVIEW_BYTE_LIMIT / 2 + 1);
    const buffer = { documentId: 'one', content: 'small' };
    const refresh = jest.fn(async () => ({
        documentId: 'one',
        content,
        revision: 1,
        byteLength: PREVIEW_BYTE_LIMIT + 2,
    }));
    const { result, rerender } = renderHook(
        ({ visible }) => {
            const accepted = useLivePreviewSnapshot(buffer, visible, adapter);
            return { accepted, preview: usePreviewPaneState(accepted, refresh) };
        },
        { initialProps: { visible: false } },
    );
    act(() => listener?.({ documentId: 'one', content, generation: 1 }));
    rerender({ visible: true });
    expect(result.current.accepted.byteLength).toBe(PREVIEW_BYTE_LIMIT + 2);
    expect(result.current.preview.isPaused).toBe(true);
    expect(result.current.preview.rendered).toBeNull();
    await act(async () => result.current.preview.refresh());
    expect(result.current.preview.isPaused).toBe(false);
    rerender({ visible: false });
    rerender({ visible: true });
    expect(result.current.preview.isPaused).toBe(false);
    expect(result.current.preview.rendered?.content).toBe(content);
    expect(refresh).toHaveBeenCalledTimes(1);
});

it('reuses the last measurement across rerenders and visibility changes', () => {
    let listener: ((buffer: AcceptedBuffer) => void) | undefined;
    const adapter: LivePreviewAdapter = {
        subscribeAcceptedBuffers(callback) {
            listener = callback;
            return () => undefined;
        },
    };
    const measure = jest.spyOn(utf8, 'utf8ByteLength');
    const buffer = { documentId: 'one', content: 'same' };
    const { result, rerender } = renderHook(({ visible }) => useLivePreviewSnapshot(buffer, visible, adapter), {
        initialProps: { visible: true },
    });
    expect(result.current.byteLength).toBe(4);
    rerender({ visible: true });
    rerender({ visible: false });
    act(() => {
        listener?.({ documentId: 'one', content: 'intermediate', generation: 1 });
        listener?.({ documentId: 'one', content: 'latest é', generation: 2 });
    });
    expect(measure).toHaveBeenCalledTimes(1);
    rerender({ visible: true });
    expect(result.current.byteLength).toBe(9);
    expect(measure).toHaveBeenCalledTimes(2);
    rerender({ visible: false });
    rerender({ visible: true });
    expect(measure).toHaveBeenCalledTimes(2);
});

it('keeps the last accepted preview on sync failure', async () => {
    jest.useFakeTimers();
    const wireError = {
        code: 'internal',
        title: 'Preview sync failed',
        message: 'The backend did not accept this buffer.',
        retryable: true,
    } satisfies WireError;
    let attempt = 0;
    const adapter = createBufferAdapter(async (documentId: string, content: string): Promise<VoidResult> => {
        void documentId;
        void content;
        attempt += 1;
        return attempt === 1 ? {} : { error: wireError };
    });
    const { result } = renderHook(() => {
        useEffect(
            () =>
                adapter.subscribeBufferSyncErrors((error) => {
                    store.dispatch(notifyError(error));
                }),
            [adapter],
        );
        return useLivePreview({ documentId: 'document-1', content: '# Bootstrap preview' }, true, adapter);
    });

    await act(async (): Promise<void> => {
        await adapter.updateBuffer('document-1', '# Last accepted preview');
        await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
    });
    expect(result.current).toBe('# Last accepted preview');

    await act(async (): Promise<void> => {
        await adapter.updateBuffer('document-1', '# Rejected preview');
        await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
    });

    expect(result.current).toBe('# Last accepted preview');
    expect(store.getState().notifications.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ error: wireError })]),
    );
});

it('(EC-RENDER-4) bounds large-document preview work', async () => {
    jest.useFakeTimers();
    const updateBuffer = jest.fn<Promise<VoidResult>, [string, string]>(
        async (documentId: string, content: string): Promise<VoidResult> => {
            void documentId;
            void content;
            return {};
        },
    );
    const adapter = createBufferAdapter(updateBuffer);
    const previewPublications = jest.fn<void, [string]>();
    const largeDocument = `# Large document\n${'content '.repeat(200_000)}`;
    const settledDocument = `${largeDocument}final edit`;
    const { result } = renderHook(() => {
        const preview = useLivePreview({ documentId: 'document-1', content: '# Bootstrap preview' }, true, adapter);
        useEffect((): void => {
            previewPublications(preview);
        }, [preview]);
        return preview;
    });
    previewPublications.mockClear();

    await act(async (): Promise<void> => {
        await adapter.updateBuffer('document-1', largeDocument);
        await adapter.updateBuffer('document-1', `${largeDocument}second edit`);
        await adapter.updateBuffer('document-1', settledDocument);
    });

    expect(result.current).toBe('# Bootstrap preview');
    expect(updateBuffer).not.toHaveBeenCalled();
    expect(previewPublications).not.toHaveBeenCalled();

    await act(async (): Promise<void> => {
        await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS);
    });

    expect(updateBuffer).toHaveBeenCalledTimes(1);
    expect(updateBuffer).toHaveBeenCalledWith('document-1', settledDocument);
    expect(result.current).toBe(settledDocument);
    expect(previewPublications).toHaveBeenCalledTimes(1);
    expect(previewPublications).toHaveBeenCalledWith(settledDocument);
});

it('ignores stale accepted generations', () => {
    let acceptedListener: ((buffer: AcceptedBuffer) => void) | undefined;
    const unsubscribe = jest.fn();
    const adapter: LivePreviewAdapter = {
        subscribeAcceptedBuffers(listener: (buffer: AcceptedBuffer) => void): () => void {
            acceptedListener = listener;
            return unsubscribe;
        },
    };
    const { result } = renderHook(() =>
        useLivePreview({ documentId: 'document-1', content: '# Bootstrap preview' }, true, adapter),
    );

    act((): void => {
        acceptedListener?.({
            documentId: 'document-1',
            content: '# Newest accepted preview',
            generation: 2,
        });
        acceptedListener?.({
            documentId: 'document-1',
            content: '# Stale accepted preview',
            generation: 1,
        });
    });

    expect(result.current).toBe('# Newest accepted preview');
});

it('takes a direct authoritative source refresh after accepted edits and then accepts new edits', () => {
    let acceptedListener: ((buffer: AcceptedBuffer) => void) | undefined;
    const adapter: LivePreviewAdapter = {
        subscribeAcceptedBuffers(listener: (buffer: AcceptedBuffer) => void): () => void {
            acceptedListener = listener;
            return (): void => undefined;
        },
    };
    const initial = { documentId: 'document-1', content: '# Bootstrap', documentRevision: 1 };
    const { result, rerender } = renderHook(({ buffer }) => useLivePreviewSnapshot(buffer, true, adapter), {
        initialProps: { buffer: initial },
    });

    act((): void => {
        acceptedListener?.({ documentId: 'document-1', content: '# Accepted edit', generation: 1 });
    });
    expect(result.current.content).toBe('# Accepted edit');

    rerender({ buffer: { documentId: 'document-1', content: '# Reloaded source', documentRevision: 2 } });
    expect(result.current.content).toBe('# Reloaded source');

    act((): void => {
        acceptedListener?.({ documentId: 'document-1', content: '# Edit after reload', generation: 1 });
    });
    expect(result.current.content).toBe('# Edit after reload');
});

it('does not revive an accepted edit when authoritative source returns to earlier text', () => {
    let acceptedListener: ((buffer: AcceptedBuffer) => void) | undefined;
    const adapter: LivePreviewAdapter = {
        subscribeAcceptedBuffers(listener: (buffer: AcceptedBuffer) => void): () => void {
            acceptedListener = listener;
            return (): void => undefined;
        },
    };
    const { result, rerender } = renderHook(
        ({ content }) => useLivePreviewSnapshot({ documentId: 'document-1', content }, true, adapter),
        { initialProps: { content: '# Original' } },
    );
    act((): void => {
        acceptedListener?.({ documentId: 'document-1', content: '# Accepted edit', generation: 1 });
    });
    expect(result.current.content).toBe('# Accepted edit');

    rerender({ content: '# Replacement' });
    expect(result.current.content).toBe('# Replacement');
    rerender({ content: '# Original' });
    expect(result.current.content).toBe('# Original');
});
