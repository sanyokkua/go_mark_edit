import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EditorProps } from '@monaco-editor/react';
import type { editor, IPosition, IRange, ISelection } from 'monaco-editor';
import { useCallback, useContext, useState } from 'react';
import { Provider } from 'react-redux';

import type { TidyOutcome } from '../../src/logic/tidy/protocol';
import { getSnapshot as slotSnapshot } from '../../src/logic/operations/operationSlot';
import { getSnapshot as problemsSnapshot, clear as clearProblems } from '../../src/logic/operations/problemsSummary';
import { store } from '../../src/logic/store';
import { resetProjection, hydrateProjection } from '../../src/logic/store/appModelProjectionActions';
import { hydrateSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { runOnText } from '../../src/logic/tidy/engine';
import type { TidyRequest } from '../../src/logic/tidy/protocol';
import type { ActiveBuffer, DocumentMetadata } from '../../src/logic/store/appModelTypes';
import { EditorSessionProvider, useEditorSessionAttachment } from '../../src/ui/widgets/editorSession';
import CodeEditor from '../../src/ui/components/CodeEditor';
import EditorStage from '../../src/ui/widgets/EditorStage/EditorStage';
import { TidyCommandsProvider } from '../../src/app/TidyCommandsProvider';
import { TidyCommandsContext } from '../../src/ui/widgets/tidyCommandsContext';
import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';
import { appModelAdapter, documentWriteAdapter } from '../../src/logic/adapter';
import { useDocumentWrites } from '../../src/app/useDocumentWrites';
import { useDocumentSession } from '../../src/app/useDocumentSession';
import type { ConflictCommands } from '../../src/app/useConflictCommands';

const mockRunTidy = jest.fn<Promise<TidyOutcome>, [unknown, unknown]>();
const stageUpdateBuffer = jest.fn((): Promise<void> => Promise.resolve());
jest.mock('../../src/logic/tidy/runTidy', () => ({ runTidy: (...args: [unknown, unknown]) => mockRunTidy(...args) }));
jest.mock('../../src/ui/components/monacoSetup', () => ({
    __esModule: true,
    monaco: {},
    applyMonacoThemeFromRoot: jest.fn(() => jest.fn()),
    registerEditorLinkModel: jest.fn(() => ({ dispose: jest.fn() })),
}));

interface Runtime {
    content: string;
    markers: Array<{ message: string }>;
    decorations: editor.IModelDeltaDecoration[];
    undo: string[];
    undoStops: number;
    disposed: boolean;
    throwOnRead: boolean;
    onChange: (text: string) => void;
    editor: editor.IStandaloneCodeEditor;
}

const runtimes: Runtime[] = [];
const noEvent = (): { dispose: () => void } => ({ dispose: (): void => undefined });

function offset(text: string, line: number, column: number): number {
    const lines = text.split('\n');
    return lines.slice(0, line - 1).reduce((sum, part) => sum + part.length + 1, 0) + column - 1;
}

function position(text: string, at: number): IPosition {
    const before = text.slice(0, at).split('\n');
    return { lineNumber: before.length, column: before.at(-1)!.length + 1 };
}

function createRuntime(initial: string): Runtime {
    const runtime: Runtime = {
        content: initial,
        markers: [],
        decorations: [],
        undo: [],
        undoStops: 0,
        disposed: false,
        throwOnRead: false,
        onChange: (): void => undefined,
        editor: {} as editor.IStandaloneCodeEditor,
    };
    const model = {
        getValue: (): string => {
            if (runtime.throwOnRead) throw new Error('editor unavailable');
            return runtime.content;
        },
        getLineCount: (): number => runtime.content.split('\n').length,
        getFullModelRange: (): IRange => {
            const end = position(runtime.content, runtime.content.length);
            return { startLineNumber: 1, startColumn: 1, endLineNumber: end.lineNumber, endColumn: end.column };
        },
        dispose: (): void => {
            runtime.disposed = true;
            runtime.markers = [];
            runtime.decorations = [];
        },
    };
    runtime.editor = {
        getModel: () => model,
        getPosition: (): IPosition => ({ lineNumber: 1, column: 1 }),
        setPosition: jest.fn(),
        revealLineInCenter: jest.fn(),
        getSelection: (): ISelection => ({
            selectionStartLineNumber: 1,
            selectionStartColumn: 1,
            positionLineNumber: 1,
            positionColumn: 1,
        }),
        setSelection: jest.fn(),
        focus: jest.fn(),
        dispose: jest.fn(),
        pushUndoStop: (): void => {
            runtime.undoStops += 1;
        },
        executeEdits: (_source: string, edits: Array<{ range: IRange; text: string }>): void => {
            runtime.undo.push(runtime.content);
            const patches = edits.map(({ range, text }) => ({
                from: offset(runtime.content, range.startLineNumber, range.startColumn),
                to: offset(runtime.content, range.endLineNumber, range.endColumn),
                text,
            }));
            for (const patch of patches.reverse()) {
                runtime.content = runtime.content.slice(0, patch.from) + patch.text + runtime.content.slice(patch.to);
            }
            runtime.onChange(runtime.content);
        },
        addAction: jest.fn(() => ({ dispose: jest.fn() })),
        onDidBlurEditorText: noEvent,
        onDidChangeCursorPosition: noEvent,
        onDidChangeCursorSelection: noEvent,
        onDidChangeConfiguration: noEvent,
        onDidChangeHiddenAreas: noEvent,
        onDidChangeModelContent: noEvent,
        onDidContentSizeChange: noEvent,
        onDidLayoutChange: noEvent,
        onDidScrollChange: noEvent,
        getScrollTop: () => 0,
        setScrollTop: jest.fn(),
        getLayoutInfo: () => ({ height: 300 }),
        getTopForLineNumber: () => 0,
        getBottomForLineNumber: () => 0,
        saveViewState: () => null,
        updateOptions: jest.fn(),
        layout: jest.fn(),
        createDecorationsCollection: () => ({
            set: (decorations: editor.IModelDeltaDecoration[]): void => {
                runtime.decorations = decorations;
            },
            clear: (): void => {
                runtime.decorations = [];
            },
        }),
    } as unknown as editor.IStandaloneCodeEditor;
    runtimes.push(runtime);
    return runtime;
}

jest.mock('@monaco-editor/react', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const MockMonacoEditor = (props: EditorProps): React.JSX.Element => {
        const runtime = React.useMemo(() => createRuntime(props.defaultValue ?? ''), [props.path]);
        runtime.onChange = (text: string): void => props.onChange?.(text, {} as never);
        React.useEffect(() => {
            props.onMount?.(runtime.editor, {
                editor: {
                    ScrollType: { Immediate: 1 },
                    setModelMarkers: (_model: unknown, _owner: string, markers: Runtime['markers']): void => {
                        runtime.markers = markers;
                    },
                },
                KeyCode: { Enter: 3 },
                MarkerSeverity: { Error: 8, Warning: 4 },
            } as never);
        }, [runtime]);
        return React.createElement('textarea', {
            'aria-label': 'Markdown source',
            defaultValue: props.defaultValue,
            onChange: (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
                runtime.content = event.target.value;
                runtime.onChange(runtime.content);
            },
        });
    };
    return { __esModule: true, default: MockMonacoEditor, loader: { config: jest.fn() } };
});

function documentFor(id: string, path: string): DocumentMetadata {
    return {
        documentId: id,
        title: path,
        path,
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        capability: 'writable',
        wordCount: 0,
        view: {
            arrangement: 'editor',
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 1, column: 1 },
            selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            scroll: { editor: 0, preview: 0 },
        },
    };
}

const HarnessEditor = ({ buffer }: { buffer: ActiveBuffer }): React.JSX.Element => {
    const attach = useEditorSessionAttachment();
    const tidy = useContext(TidyCommandsContext);
    const attachCurrent = useCallback(
        (handle: Parameters<typeof attach>[1]): void => {
            attach(buffer.documentId, handle);
        },
        [attach, buffer.documentId],
    );
    return (
        <CodeEditor
            key={buffer.documentId}
            ref={attachCurrent}
            documentId={buffer.documentId}
            initialValue={buffer.content}
            onChange={(text): void => tidy?.documentChanged(buffer.documentId, text)}
        />
    );
};

const Controls = (): React.JSX.Element => {
    const tidy = useContext(TidyCommandsContext);
    const [outcome, setOutcome] = useState('none');
    return (
        <>
            <button
                onClick={(): void => {
                    void tidy?.run('format').then((value) => setOutcome(value.kind));
                }}
            >
                Format
            </button>
            <button
                onClick={(): void => {
                    void tidy?.run('compact').then((value) => setOutcome(value.kind));
                }}
            >
                Compact
            </button>
            <button
                onClick={(): void => {
                    void tidy?.run('lint').then((value) => setOutcome(value.kind));
                }}
            >
                Lint
            </button>
            <button
                onClick={(): void => {
                    void tidy?.run('format', { origin: 'on-save' }).then((value) => setOutcome(value.kind));
                }}
            >
                Format on save
            </button>
            <button onClick={(): void => tidy?.cancel()}>Cancel</button>
            <output aria-label="Tidy outcome">{outcome}</output>
        </>
    );
};

function view(buffer: ActiveBuffer | null, externalEpoch = 0): React.JSX.Element {
    return (
        <Provider store={store}>
            <EditorSessionProvider activeBuffer={buffer} externalEpoch={externalEpoch}>
                <TidyCommandsProvider>
                    <Controls />
                    {buffer && <HarnessEditor buffer={buffer} />}
                </TidyCommandsProvider>
            </EditorSessionProvider>
        </Provider>
    );
}

function stageView(buffer: ActiveBuffer, externalEpoch = 0, interactionBlocked = false): React.JSX.Element {
    const metadata = documentFor(buffer.documentId, '/note.md');
    const adapter = {
        flushBuffer: (): Promise<void> => Promise.resolve(),
        flushDocView: (): Promise<void> => Promise.resolve(),
        updateBuffer: stageUpdateBuffer,
        updateDocView: (): Promise<void> => Promise.resolve(),
        subscribeAcceptedBuffers: (): (() => void) => (): void => undefined,
    };
    return (
        <Provider store={store}>
            <EditorSessionProvider activeBuffer={buffer} externalEpoch={externalEpoch}>
                <TidyCommandsProvider>
                    <Controls />
                    <EditorStage
                        activeBuffer={buffer}
                        activeDocument={metadata}
                        adapter={adapter}
                        editorVisible
                        interactionBlocked={interactionBlocked}
                        previewVisible={false}
                        readOnly={false}
                        view={metadata.view}
                        onLiveCursorChange={jest.fn()}
                        onPreviewWarning={jest.fn()}
                    />
                </TidyCommandsProvider>
            </EditorSessionProvider>
        </Provider>
    );
}

it('keeps imperative Format available while the modal makes the editor surface inert', async () => {
    mockRunTidy.mockImplementation((value) => {
        const request = value as TidyRequest;
        return Promise.resolve(runOnText(request.op, request.text, request.prefs));
    });
    render(stageView({ documentId: 'first', content: '* item\n' }, 0, true));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    expect(screen.getByRole('tabpanel')).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(runtimes.at(-1)!.content).toBe('- item\n'));
    expect(runtimes.at(-1)!.undo).toEqual(['* item\n']);
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((complete) => {
        resolve = complete;
    });
    return { promise, resolve };
}

async function settle<T>(pending: ReturnType<typeof deferred<T>>, value: T): Promise<void> {
    await act(async () => {
        pending.resolve(value);
        await pending.promise;
    });
}

beforeEach(() => {
    runtimes.length = 0;
    mockRunTidy.mockReset();
    stageUpdateBuffer.mockClear();
    store.dispatch(resetProjection());
    store.dispatch(resetSettingsProjection());
    store.dispatch(resetNotifications());
    store.dispatch(hydrateSettings(loadedMarkdownSettings));
    store.dispatch(
        hydrateProjection({
            revision: 1,
            documents: {
                first: documentFor('first', '/note.md'),
                second: documentFor('second', '/other.md'),
            },
            activeDocumentId: 'first',
            ui: {},
        }),
    );
    clearProblems();
});

function noticeCodes(): string[] {
    return store.getState().notifications.items.map((notice) => notice.code);
}

function findingAt(index: number) {
    return {
        rule: 'trailing-space' as const,
        severity: 'error' as const,
        startLine: index + 1,
        startColumn: 5,
        endLine: index + 1,
        endColumn: 6,
        message: { key: 'lint.rule.trailing-space.message' },
        hint: 'lint.rule.trailing-space.hint',
    };
}

afterEach(() => {
    jest.restoreAllMocks();
    store.dispatch(resetProjection());
    store.dispatch(resetSettingsProjection());
    store.dispatch(resetNotifications());
    clearProblems();
});

it('saves real Monaco Format edits as one undo step and updates Lint markers after the commit', async () => {
    const buffer = { documentId: 'first', content: '* item\n', documentRevision: 1 };
    const metadata = { ...documentFor('first', '/note.md'), contentRevision: 1, dirty: true };
    const order: string[] = [];
    store.dispatch(
        hydrateSettings({
            ...loadedMarkdownSettings,
            markdown: { ...loadedMarkdownSettings.markdown, formatOnSave: true, lintOnSave: true },
        }),
    );
    mockRunTidy.mockImplementation((value) => {
        const request = value as TidyRequest;
        order.push(request.op);
        return Promise.resolve(runOnText(request.op, request.text, request.prefs));
    });
    jest.spyOn(appModelAdapter, 'flushActiveSession').mockImplementation(async () => {
        order.push('flush');
    });
    jest.spyOn(appModelAdapter, 'getState').mockImplementation(async () => {
        order.push('state');
        const runtime = runtimes.at(-1)!;
        const revision = runtime.undo.length + 1;
        return {
            activeBuffer: { ...buffer, content: runtime.content, documentRevision: revision },
            snapshot: {
                revision,
                activeDocumentId: 'first',
                orderedDocumentIds: ['first'],
                documents: { first: { ...metadata, contentRevision: revision } },
                ui: {},
            },
        } as never;
    });
    jest.spyOn(documentWriteAdapter, 'save').mockImplementation(async (_id, revision) => {
        order.push('save');
        expect(revision).toBe(2);
        expect(runtimes.at(-1)!.content).toBe('- item\n');
        return {
            status: 'committed',
            data: {
                documentId: 'first',
                writtenContentRevision: revision,
                committedProjectionRevision: 3,
                targetPathAdopted: false,
                lineEndingOutcome: 'preserved-lf',
                bomOutcome: 'absent',
                resyncRequired: false,
            },
        };
    });
    jest.spyOn(appModelAdapter, 'reconcileCommittedWrite').mockImplementation(async () => {
        order.push('reconcile');
        return {
            snapshot: {
                revision: 3,
                activeDocumentId: 'first',
                orderedDocumentIds: ['first'],
                documents: { first: { ...metadata, contentRevision: 2, dirty: false } },
                ui: {},
            },
        } as never;
    });
    const SaveControl = (): React.JSX.Element => {
        const baseSession = useDocumentSession();
        const session = {
            ...baseSession,
            activeBuffer: buffer,
            activeDocument: metadata,
            documentsById: { first: metadata },
            orderedDocumentIds: ['first'],
        };
        const writes = useDocumentWrites(session, { execute: jest.fn() } as unknown as ConflictCommands);
        return (
            <button
                onClick={(): void => {
                    void writes.onSave();
                }}
            >
                Save document
            </button>
        );
    };
    render(
        <Provider store={store}>
            <EditorSessionProvider activeBuffer={buffer}>
                <TidyCommandsProvider>
                    <Controls />
                    <SaveControl />
                    <HarnessEditor buffer={buffer} />
                </TidyCommandsProvider>
            </EditorSessionProvider>
        </Provider>,
    );
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    expect(runtimes.at(-1)!.markers).toHaveLength(1);
    order.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => expect(order).toEqual(['format', 'flush', 'state', 'save', 'reconcile', 'lint']));
    expect(runtimes.at(-1)!.undo).toEqual(['* item\n']);
    expect(runtimes.at(-1)!.undoStops).toBe(2);
    expect(problemsSnapshot()?.total).toBe(0);
    expect(runtimes.at(-1)!.markers).toHaveLength(0);
});

it('applies changed Format text through one editor undo group and leaves an empty result untouched', async () => {
    mockRunTidy
        .mockResolvedValueOnce({ kind: 'edits', edits: [{ from: 0, to: 1, text: '#' }] })
        .mockResolvedValueOnce({ kind: 'edits', edits: [] });
    render(view({ documentId: 'first', content: 'A title\n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Tidy outcome' })).toHaveTextContent('edits'));
    const runtime = runtimes.at(-1)!;
    expect(runtime.content).toBe('# title\n');
    expect(runtime.undoStops).toBe(2);
    expect(runtime.undo).toEqual(['A title\n']);
    act(() => {
        runtime.content = runtime.undo.pop()!;
        runtime.onChange(runtime.content);
    });
    expect(runtime.content).toBe('A title\n');
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(mockRunTidy).toHaveBeenCalledTimes(2));
    expect(runtime.undoStops).toBe(2);
    expect(runtime.undo).toEqual([]);
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('marks the real editor stage findings stale on typing while retaining underlines', async () => {
    const finding = findingAt(0);
    mockRunTidy.mockResolvedValue({ kind: 'findings', findings: [finding], total: 1 });
    render(stageView({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    const runtime = runtimes.at(-1)!;
    expect(runtime.markers).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source' }), { target: { value: 'line changed\n' } });
    expect(problemsSnapshot()?.stale).toBe(true);
    expect(runtime.markers).toHaveLength(1);
    expect(stageUpdateBuffer).toHaveBeenCalledWith('first', 'line changed\n');
});

it('caps localized editor markers at one thousand while preserving the exact summary total', async () => {
    const findings = Array.from({ length: 1500 }, (_, index) => findingAt(index));
    mockRunTidy.mockResolvedValue({ kind: 'findings', findings, total: 1500 });
    render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1500));
    expect(problemsSnapshot()?.findings).toHaveLength(1500);
    const markers = runtimes.at(-1)!.markers;
    expect(markers).toHaveLength(1000);
    expect(runtimes.at(-1)!.decorations).toHaveLength(500);
    expect(markers[0].message).toContain('Trailing whitespace');
    expect(markers[0].message).toContain('Error');
    expect(markers[0].message).toContain('Remove the trailing spaces or tabs');
});

it('clears prior underlines and resets staleness when Lint completes with zero findings', async () => {
    mockRunTidy
        .mockResolvedValueOnce({ kind: 'findings', findings: [findingAt(0)], total: 1 })
        .mockResolvedValueOnce({ kind: 'findings', findings: [], total: 0 });
    render(view({ documentId: 'first', content: 'line \n' }));
    const textbox = await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    fireEvent.change(textbox, { target: { value: 'line\n' } });
    expect(problemsSnapshot()?.stale).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(0));
    expect(problemsSnapshot()?.stale).toBe(false);
    expect(runtimes.at(-1)!.markers).toEqual([]);
});

it('keeps the current summary through a same-session projection refresh', async () => {
    mockRunTidy.mockResolvedValue({ kind: 'findings', findings: [findingAt(0)], total: 1 });
    const rendered = render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    rendered.rerender(view({ documentId: 'first', content: 'new projection content\n', documentRevision: 2 }));
    expect(problemsSnapshot()).toMatchObject({ total: 1, stale: false });
    expect(runtimes.at(-1)!.markers).toHaveLength(1);
});

it.each(['refused', 'failed', 'cancelled'] as const)(
    'leaves text and earlier findings alone after a %s worker outcome',
    async (kind) => {
        mockRunTidy
            .mockResolvedValueOnce({ kind: 'findings', findings: [findingAt(0)], total: 1 })
            .mockResolvedValueOnce(kind === 'refused' ? { kind, reason: 'render-differs' } : { kind });
        render(view({ documentId: 'first', content: 'line \n' }));
        await screen.findByRole('textbox', { name: 'Markdown source' });
        fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
        await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
        fireEvent.click(screen.getByRole('button', { name: 'Format' }));
        await waitFor(() => expect(noticeCodes()).toContain(`tidy-${kind}`));
        expect(runtimes.at(-1)!.content).toBe('line \n');
        expect(runtimes.at(-1)!.markers).toHaveLength(1);
        expect(problemsSnapshot()?.total).toBe(1);
        expect(slotSnapshot()).toEqual({ state: 'idle' });
    },
);

it('reports a busy second run without a notice and releases the first slot on cancellation', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy.mockReturnValue(pending.promise);
    render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    expect(slotSnapshot().state).toBe('running');
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Tidy outcome' })).toHaveTextContent('busy'));
    expect(mockRunTidy).toHaveBeenCalledTimes(1);
    expect(noticeCodes()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settle(pending, { kind: 'edits', edits: [{ from: 0, to: 1, text: 'X' }] });
    expect(runtimes.at(-1)!.content).toBe('line \n');
    expect(slotSnapshot()).toEqual({ state: 'idle' });
    expect(noticeCodes()).toContain('tidy-cancelled');
});

it('discards a pending result after typing even when the user restores the original text', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy
        .mockResolvedValueOnce({ kind: 'findings', findings: [findingAt(0)], total: 1 })
        .mockReturnValueOnce(pending.promise);
    render(view({ documentId: 'first', content: 'line \n' }));
    const textbox = await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    fireEvent.change(textbox, { target: { value: 'changed\n' } });
    fireEvent.change(textbox, { target: { value: 'line \n' } });
    await settle(pending, { kind: 'edits', edits: [{ from: 0, to: 1, text: 'X' }] });
    expect(runtimes.at(-1)!.content).toBe('line \n');
    expect(problemsSnapshot()?.stale).toBe(true);
    expect(problemsSnapshot()?.total).toBe(1);
    expect(runtimes.at(-1)!.markers).toHaveLength(1);
    expect(noticeCodes()).toContain('tidy-stale');
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('invalidates a run and clears findings after switching away and back or closing', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy
        .mockResolvedValueOnce({ kind: 'findings', findings: [findingAt(0)], total: 1 })
        .mockReturnValueOnce(pending.promise);
    const buffer = { documentId: 'first', content: 'line \n' };
    const rendered = render(view(buffer));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    const firstRuntime = runtimes.at(-1)!;
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                documents: {
                    first: documentFor('first', '/note.md'),
                    second: documentFor('second', '/other.md'),
                },
                activeDocumentId: 'second',
                ui: {},
            }),
        );
        rendered.rerender(view({ documentId: 'second', content: 'other\n' }));
    });
    expect(problemsSnapshot()).toBeNull();
    expect(firstRuntime.disposed).toBe(true);
    expect(firstRuntime.markers).toEqual([]);
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 3,
                documents: {
                    first: documentFor('first', '/note.md'),
                    second: documentFor('second', '/other.md'),
                },
                activeDocumentId: 'first',
                ui: {},
            }),
        );
        rendered.rerender(view(buffer));
    });
    await settle(pending, { kind: 'edits', edits: [{ from: 0, to: 1, text: 'X' }] });
    expect(runtimes.at(-1)!.content).toBe('line \n');
    expect(problemsSnapshot()).toBeNull();
    expect(noticeCodes()).toContain('tidy-stale');
    expect(slotSnapshot()).toEqual({ state: 'idle' });
    rendered.rerender(view(null));
    expect(problemsSnapshot()).toBeNull();
});

it('invalidates projected activation away and back before buffer acknowledgement', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy
        .mockResolvedValueOnce({ kind: 'findings', findings: [findingAt(0)], total: 1 })
        .mockReturnValueOnce(pending.promise);
    render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    const runtime = runtimes.at(-1)!;
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    for (const [revision, activeDocumentId] of [
        [2, 'second'],
        [3, 'first'],
    ] as const) {
        act(() => {
            store.dispatch(
                hydrateProjection({
                    revision,
                    activeDocumentId,
                    documents: {
                        first: documentFor('first', '/note.md'),
                        second: documentFor('second', '/other.md'),
                    },
                    ui: {},
                }),
            );
        });
        expect(problemsSnapshot()).toBeNull();
        expect(runtime.markers).toEqual([]);
    }
    await settle(pending, { kind: 'edits', edits: [{ from: 0, to: 1, text: 'X' }] });
    expect(runtime.content).toBe('line \n');
    expect(noticeCodes()).toContain('tidy-stale');
    expect(problemsSnapshot()).toBeNull();
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('invalidates an intermediate projected activation hidden by a batched render', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy
        .mockResolvedValueOnce({ kind: 'findings', findings: [findingAt(0)], total: 1 })
        .mockReturnValueOnce(pending.promise);
    render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    const runtime = runtimes.at(-1)!;
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    act(() => {
        for (const [revision, activeDocumentId] of [
            [2, 'second'],
            [3, 'first'],
        ] as const)
            store.dispatch(
                hydrateProjection({
                    revision,
                    activeDocumentId,
                    documents: {
                        first: documentFor('first', '/note.md'),
                        second: documentFor('second', '/other.md'),
                    },
                    ui: {},
                }),
            );
    });
    expect(problemsSnapshot()).toBeNull();
    expect(runtime.markers).toEqual([]);
    await settle(pending, { kind: 'edits', edits: [{ from: 0, to: 1, text: 'X' }] });
    expect(runtime.content).toBe('line \n');
    expect(noticeCodes()).toContain('tidy-stale');
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('clears completed lint findings when the active editor closes', async () => {
    mockRunTidy.mockResolvedValue({ kind: 'findings', findings: [findingAt(0)], total: 1 });
    const rendered = render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    const oldRuntime = runtimes.at(-1)!;
    rendered.rerender(view(null));
    expect(problemsSnapshot()).toBeNull();
    expect(oldRuntime.disposed).toBe(true);
    expect(oldRuntime.markers).toEqual([]);
});

it('discards a pending result when the active editor reloads at the same text', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy.mockReturnValue(pending.promise);
    const buffer = { documentId: 'first', content: 'line \n' };
    const rendered = render(stageView(buffer));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    rendered.rerender(stageView(buffer, 1));
    await settle(pending, { kind: 'edits', edits: [{ from: 0, to: 1, text: 'X' }] });
    expect(runtimes.at(-1)!.content).toBe('line \n');
    expect(noticeCodes()).toContain('tidy-stale');
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('suppresses tidy notices for on-save origin and returns the failure outcome', async () => {
    mockRunTidy.mockResolvedValue({ kind: 'refused', reason: 'render-differs' });
    render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Format on save' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Tidy outcome' })).toHaveTextContent('refused'));
    expect(noticeCodes()).toEqual([]);
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('uses UTF-8 bytes to show immediate progress for multibyte text above one MiB', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy.mockReturnValue(pending.promise);
    render(view({ documentId: 'first', content: 'é'.repeat(524289) }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    expect(slotSnapshot()).toMatchObject({ state: 'running', progress: { done: 0, total: 0 } });
    await settle(pending, { kind: 'findings', findings: [], total: 0 });
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('reveals the latest progress after one second for a small document', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy.mockReturnValue(pending.promise);
    render(view({ documentId: 'first', content: 'short\n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    jest.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    const control = mockRunTidy.mock.calls[0][1] as { onProgress(done: number, total: number): void };
    act(() => control.onProgress(2, 3));
    expect(slotSnapshot()).toMatchObject({ state: 'running', progress: null });
    act(() => jest.advanceTimersByTime(999));
    expect(slotSnapshot()).toMatchObject({ progress: null });
    act(() => jest.advanceTimersByTime(1));
    expect(slotSnapshot()).toMatchObject({ progress: { done: 2, total: 3 } });
    await settle(pending, { kind: 'findings', findings: [], total: 0 });
    jest.useRealTimers();
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('returns unavailable without a notice when no editor is attached', async () => {
    render(view(null));
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Tidy outcome' })).toHaveTextContent('failed'));
    expect(mockRunTidy).not.toHaveBeenCalled();
    expect(noticeCodes()).toEqual([]);
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('allows Lint for a read-only document while refusing Format without a notice', async () => {
    store.dispatch(
        hydrateProjection({
            revision: 2,
            documents: {
                first: { ...documentFor('first', '/note.md'), capability: 'read-only' },
            },
            activeDocumentId: 'first',
            ui: {},
        }),
    );
    mockRunTidy.mockResolvedValue({ kind: 'findings', findings: [], total: 0 });
    render(view({ documentId: 'first', content: 'line\n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Tidy outcome' })).toHaveTextContent('failed'));
    expect(mockRunTidy).not.toHaveBeenCalled();
    expect(noticeCodes()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(0));
    expect(mockRunTidy).toHaveBeenCalledTimes(1);
});

it('discards a pending run after the document closes and leaves the slot idle', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy.mockReturnValue(pending.promise);
    const rendered = render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    const oldRuntime = runtimes.at(-1)!;
    act(() => {
        store.dispatch(hydrateProjection({ revision: 2, documents: {}, activeDocumentId: null, ui: {} }));
        rendered.rerender(view(null));
    });
    await settle(pending, { kind: 'edits', edits: [{ from: 0, to: 1, text: 'X' }] });
    expect(oldRuntime.content).toBe('line \n');
    expect(oldRuntime.disposed).toBe(true);
    expect(problemsSnapshot()).toBeNull();
    expect(noticeCodes()).toContain('tidy-stale');
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('turns a thrown worker error into a failed outcome and releases the slot', async () => {
    mockRunTidy.mockRejectedValue(new Error('worker crashed'));
    render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Tidy outcome' })).toHaveTextContent('failed'));
    expect(runtimes.at(-1)!.content).toBe('line \n');
    expect(noticeCodes()).toContain('tidy-failed');
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('turns an editor read error after the worker resolves into a failed outcome', async () => {
    const pending = deferred<TidyOutcome>();
    mockRunTidy.mockReturnValue(pending.promise);
    render(view({ documentId: 'first', content: 'line \n' }));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    const runtime = runtimes.at(-1)!;
    runtime.throwOnRead = true;
    await settle(pending, { kind: 'edits', edits: [{ from: 0, to: 1, text: 'X' }] });
    expect(screen.getByRole('status', { name: 'Tidy outcome' })).toHaveTextContent('failed');
    expect(runtime.content).toBe('line \n');
    expect(noticeCodes()).toContain('tidy-failed');
    expect(slotSnapshot()).toEqual({ state: 'idle' });
});

it('runs the same Markdown lint and formatting for .txt and .md active documents', async () => {
    mockRunTidy.mockImplementation((value) => {
        const request = value as TidyRequest;
        return Promise.resolve(runOnText(request.op, request.text, request.prefs));
    });
    const buffer = { documentId: 'first', content: '* item\n' };
    const rendered = render(view(buffer));
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    expect(problemsSnapshot()?.findings.map((finding) => finding.rule)).toEqual(['ul-marker']);
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(runtimes.at(-1)!.content).toBe('- item\n'));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                documents: {
                    first: documentFor('first', '/note.md'),
                    second: documentFor('second', '/note.txt'),
                },
                activeDocumentId: 'second',
                ui: {},
            }),
        );
        rendered.rerender(view({ documentId: 'second', content: '* item\n' }));
    });
    await screen.findByRole('textbox', { name: 'Markdown source' });
    fireEvent.click(screen.getByRole('button', { name: 'Lint' }));
    await waitFor(() => expect(problemsSnapshot()?.total).toBe(1));
    expect(problemsSnapshot()?.findings.map((finding) => finding.rule)).toEqual(['ul-marker']);
    fireEvent.click(screen.getByRole('button', { name: 'Format' }));
    await waitFor(() => expect(runtimes.at(-1)!.content).toBe('- item\n'));
    expect(mockRunTidy).toHaveBeenCalledTimes(4);
});
