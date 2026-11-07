import { act, renderHook } from '@testing-library/react';

import { BUFFER_SYNC_MS, createAppModelAdapter } from '../../../src/logic/adapter';
import type { DocumentView } from '../../../src/logic/store/appModelTypes';
import { useSyncedBuffer } from '../../../src/logic/hooks/useSyncedBuffer';

const view: DocumentView = {
    arrangement: 'editor',
    editorVisible: true,
    previewVisible: false,
    cursor: { line: 1, column: 1 },
    selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
    scroll: { editor: 0, preview: 0 },
};

function adapterRecordingBuffers(sent: string[], bases: number[] = []) {
    return createAppModelAdapter(
        {
            getState: () =>
                Promise.resolve({
                    data: {
                        snapshot: { revision: 1, documents: {}, activeDocumentId: '', ui: {} },
                        activeBuffer: { documentId: '', content: '' },
                    },
                }),
            updateBuffer: (documentId: string, content: string, baseRevision: number): Promise<object> => {
                void documentId;
                sent.push(content);
                bases.push(baseRevision);
                return Promise.resolve({});
            },
            setDocView: (documentId: string, docView: unknown): Promise<object> => {
                void documentId;
                void docView;
                return Promise.resolve({});
            },
            setUILayout: (layout: unknown): Promise<object> => {
                void layout;
                return Promise.resolve({});
            },
        },
        { eventsOn: (): (() => void) => (): void => undefined },
    );
}

afterEach(() => {
    jest.useRealTimers();
});

it('drops an unsent edit from the editor session that an external reload replaced', async () => {
    jest.useFakeTimers();
    const sent: string[] = [];
    const adapter = adapterRecordingBuffers(sent);
    const { rerender, result } = renderHook(
        ({ content, epoch }: { content: string; epoch: number }) =>
            useSyncedBuffer('document-1', view, adapter, content, epoch),
        { initialProps: { content: 'mine\n', epoch: 0 } },
    );

    act(() => result.current.onChange('mine, typed before the reload\n'));
    rerender({ content: 'theirs\n', epoch: 1 });
    await act(async (): Promise<void> => {
        await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS * 2);
    });

    expect(sent).toEqual([]);
});

it('still sends edits made in the editor session that follows the reload', async () => {
    jest.useFakeTimers();
    const sent: string[] = [];
    const adapter = adapterRecordingBuffers(sent);
    const { rerender, result } = renderHook(
        ({ content, epoch }: { content: string; epoch: number }) =>
            useSyncedBuffer('document-1', view, adapter, content, epoch),
        { initialProps: { content: 'mine\n', epoch: 0 } },
    );

    rerender({ content: 'theirs\n', epoch: 1 });
    act(() => result.current.onChange('theirs, edited\n'));
    await act(async (): Promise<void> => {
        await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS * 2);
    });

    expect(sent).toEqual(['theirs, edited\n']);
});

it('sends each edit with the document revision its editor session was installed from', async () => {
    jest.useFakeTimers();
    const sent: string[] = [];
    const bases: number[] = [];
    const adapter = adapterRecordingBuffers(sent, bases);
    const { rerender, result } = renderHook(
        ({ content, epoch, base }: { content: string; epoch: number; base: number }) =>
            useSyncedBuffer('document-1', view, adapter, content, epoch, base),
        { initialProps: { content: 'mine\n', epoch: 0, base: 3 } },
    );

    act(() => result.current.onChange('mine, edited\n'));
    await act(async (): Promise<void> => {
        await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS * 2);
    });
    rerender({ content: 'theirs\n', epoch: 1, base: 7 });
    act(() => result.current.onChange('theirs, edited\n'));
    act(() => result.current.onBlur());
    await act(async (): Promise<void> => {
        await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS * 2);
    });

    expect(sent).toEqual(['mine, edited\n', 'theirs, edited\n']);
    expect(bases).toEqual([3, 7]);
});
