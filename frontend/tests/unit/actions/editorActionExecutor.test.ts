import {
    createEditorActionExecutor,
    type EditorActionExecutorContext,
} from '../../../src/logic/actions/editorActionExecutor';
import type { DocumentCommandAPI } from '../../../src/logic/hooks/useDocumentCommands';

it('maps tidy outcomes to command results without focusing after non-mutations', async () => {
    const command = documentCommands({ start: { lineNumber: 1, column: 1 }, end: { lineNumber: 1, column: 1 } });
    const outcome = jest.fn();
    const executor = createEditorActionExecutor({
        ...executorContext(command.commands, { readText: async () => '', writeText: async () => true }),
        projectedState: { activeDocumentId: 'doc-1', documents: { 'doc-1': { capability: 'writable' } } },
        invokeTidy: outcome,
    });
    const cases = [
        [{ kind: 'edits', edits: [{ from: 0, to: 1, text: 'x' }] }, 'mutated'],
        [{ kind: 'edits', edits: [] }, 'committed'],
        [{ kind: 'findings', findings: [], total: 0 }, 'committed'],
        [{ kind: 'cancelled' }, 'cancelled'],
        [{ kind: 'refused', reason: 'render-differs' }, 'refused'],
        [{ kind: 'failed' }, 'unavailable'],
        [{ kind: 'stale' }, 'unavailable'],
    ] as const;
    for (const [tidyOutcome, status] of cases) {
        command.focus.mockClear();
        outcome.mockResolvedValueOnce(tidyOutcome);
        await expect(executor.execute('format')).resolves.toMatchObject({ status });
        expect(command.focus).toHaveBeenCalledTimes(status === 'mutated' ? 1 : 0);
    }
    expect(outcome).toHaveBeenCalledWith(
        'format',
        expect.objectContaining({ commands: command.commands, documentId: 'doc-1' }),
    );
});

it('preserves a captured context-menu session for a tidy invocation', async () => {
    const original = documentCommands({ start: { lineNumber: 1, column: 1 }, end: { lineNumber: 1, column: 1 } });
    const next = documentCommands({ start: { lineNumber: 1, column: 1 }, end: { lineNumber: 1, column: 1 } });
    const invokeTidy = jest.fn(async () => ({ kind: 'edits' as const, edits: [] }));
    const base = executorContext(original.commands, { readText: async () => '', writeText: async () => true });
    const captured = createEditorActionExecutor({ ...base, invokeTidy }).capture();
    const executor = createEditorActionExecutor({ ...base, commands: next.commands, documentId: 'doc-2', invokeTidy });
    await expect(executor.execute('format', captured)).resolves.toMatchObject({ status: 'document-mismatch' });
    expect(invokeTidy).not.toHaveBeenCalled();
});

function documentCommands(
    selection: { start: { lineNumber: number; column: number }; end: { lineNumber: number; column: number } },
    source = 'word',
) {
    const focus = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const replaceRange = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const showFind = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const showReplace = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const commands: DocumentCommandAPI = {
        focus,
        getContent: () => ({ status: 'available', value: source }),
        getSelection: jest.fn(() => ({ status: 'available', value: selection })),
        replaceAll: jest.fn(() => ({ status: 'available', value: undefined })),
        applyEdits: jest.fn(() => ({ status: 'available', value: undefined })),
        setPosition: jest.fn(() => ({ status: 'available', value: undefined })),
        setMarkers: jest.fn(() => ({ status: 'available', value: undefined })),
        replaceRange,
        showFind,
        showReplace,
    };
    return { commands, focus, replaceRange, showFind, showReplace };
}

it('opens the native Find widget for read-only text and refuses Replace', async () => {
    const command = documentCommands({ start: { lineNumber: 1, column: 1 }, end: { lineNumber: 1, column: 1 } });
    const executor = createEditorActionExecutor({
        ...executorContext(command.commands, {
            readText: () => Promise.resolve(''),
            writeText: () => Promise.resolve(true),
        }),
        writable: false,
        projectedState: { activeDocumentId: 'doc-1', documents: { 'doc-1': { capability: 'unsafe-read-only' } } },
    });

    await expect(executor.execute('find')).resolves.toMatchObject({ status: 'committed' });
    await expect(executor.execute('replace')).resolves.toMatchObject({ status: 'unavailable' });
    expect(command.showFind).toHaveBeenCalledTimes(1);
    expect(command.showReplace).not.toHaveBeenCalled();
    expect(command.replaceRange).not.toHaveBeenCalled();
});

it('opens native Replace without changing the model or shifting editor focus', async () => {
    const command = documentCommands({ start: { lineNumber: 1, column: 1 }, end: { lineNumber: 1, column: 1 } });
    const executor = createEditorActionExecutor(
        executorContext(command.commands, {
            readText: () => Promise.resolve(''),
            writeText: () => Promise.resolve(true),
        }),
    );

    await expect(executor.execute('replace')).resolves.toMatchObject({ status: 'committed' });
    expect(command.showReplace).toHaveBeenCalledTimes(1);
    expect(command.replaceRange).not.toHaveBeenCalled();
    expect(command.focus).not.toHaveBeenCalled();
});

function executorContext(
    commands: DocumentCommandAPI,
    clipboard: EditorActionExecutorContext['clipboard'],
): EditorActionExecutorContext {
    return {
        clipboard,
        commands,
        documentId: 'doc-1',
        markdownSettings: {
            bulletMarker: '-',
            emphasisMarker: '_',
            headingStyle: 'atx',
        },
        modalOpen: false,
        writable: true,
    };
}

it('refuses marker actions while settings are absent but formats independent actions', async () => {
    const command = documentCommands({
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
    });
    const context = {
        ...executorContext(command.commands, { readText: async () => '', writeText: async () => true }),
        markdownSettings: undefined,
    };
    const executor = createEditorActionExecutor(context);
    for (const id of ['italic', 'bullet-list', 'task-list'] as const) {
        await expect(executor.execute(id)).resolves.toMatchObject({
            status: 'unavailable',
            reason: 'settings-loading',
        });
    }
    expect(command.replaceRange).not.toHaveBeenCalled();
    await expect(executor.execute('bold')).resolves.toMatchObject({ status: 'mutated' });
    expect(command.replaceRange).toHaveBeenCalledWith(expect.anything(), '**word**', expect.anything());
    await expect(executor.execute('numbered-list')).resolves.toMatchObject({ status: 'mutated' });
    expect(command.replaceRange).toHaveBeenCalledWith(expect.anything(), '1. word');
});

it('uses the hydrated bullet marker for task lists', async () => {
    const command = documentCommands({ start: { lineNumber: 1, column: 1 }, end: { lineNumber: 1, column: 5 } });
    const context = executorContext(command.commands, { readText: async () => '', writeText: async () => true });
    const executor = createEditorActionExecutor({
        ...context,
        markdownSettings: { bulletMarker: '+', emphasisMarker: '_', headingStyle: 'setext' },
    });
    await expect(executor.execute('task-list')).resolves.toMatchObject({ status: 'mutated' });
    expect(command.replaceRange).toHaveBeenCalledWith(expect.anything(), '+ [ ] word');
});

it('copies the selection captured before the popup takes focus and restores editor focus', async () => {
    const command = documentCommands({
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
    });
    let clipboardText = '';
    const executor = createEditorActionExecutor(
        executorContext(command.commands, {
            readText: async () => clipboardText,
            writeText: async (text) => {
                clipboardText = text;
                return true;
            },
        }),
    );
    const snapshot = executor.capture();

    (command.commands.getSelection as jest.Mock).mockReturnValue({
        status: 'available',
        value: {
            start: { lineNumber: 1, column: 3 },
            end: { lineNumber: 1, column: 3 },
        },
    });

    await expect(executor.execute('copy', snapshot)).resolves.toMatchObject({
        actionId: 'copy',
        status: 'mutated',
    });
    expect(clipboardText).toBe('word');
    expect(command.replaceRange).not.toHaveBeenCalled();
    expect(command.focus).toHaveBeenCalledTimes(1);
});

it('writes Cut to the native clipboard before deleting the captured Monaco range', async () => {
    const command = documentCommands({
        start: { lineNumber: 1, column: 2 },
        end: { lineNumber: 1, column: 4 },
    });
    let clipboardText = '';
    const executor = createEditorActionExecutor(
        executorContext(command.commands, {
            readText: async () => clipboardText,
            writeText: async (text) => {
                clipboardText = text;
                return true;
            },
        }),
    );

    await expect(executor.execute('cut')).resolves.toMatchObject({ actionId: 'cut', status: 'mutated' });

    expect(clipboardText).toBe('or');
    expect(command.replaceRange).toHaveBeenCalledWith(
        {
            start: { lineNumber: 1, column: 2 },
            end: { lineNumber: 1, column: 4 },
        },
        '',
        {
            start: { lineNumber: 1, column: 2 },
            end: { lineNumber: 1, column: 2 },
        },
    );
    expect(command.focus).toHaveBeenCalledTimes(1);
});

it.each(['paste', 'paste-plain'] as const)(
    '%s replaces the captured range and leaves its caret after multiline clipboard text',
    async (actionId) => {
        const command = documentCommands({
            start: { lineNumber: 1, column: 1 },
            end: { lineNumber: 1, column: 5 },
        });
        const executor = createEditorActionExecutor(
            executorContext(command.commands, {
                readText: async () => 'plain\ntext',
                writeText: async () => true,
            }),
        );
        const snapshot = executor.capture();
        (command.commands.getSelection as jest.Mock).mockReturnValue({
            status: 'available',
            value: {
                start: { lineNumber: 1, column: 3 },
                end: { lineNumber: 1, column: 3 },
            },
        });

        await expect(executor.execute(actionId, snapshot)).resolves.toMatchObject({ actionId, status: 'mutated' });

        expect(command.replaceRange).toHaveBeenCalledWith(
            {
                start: { lineNumber: 1, column: 1 },
                end: { lineNumber: 1, column: 5 },
            },
            'plain\ntext',
            {
                start: { lineNumber: 2, column: 5 },
                end: { lineNumber: 2, column: 5 },
            },
        );
        expect(command.focus).toHaveBeenCalledTimes(1);
    },
);

it('keeps the document unchanged when the native clipboard rejects Cut or Paste', async () => {
    const cutCommand = documentCommands({
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
    });
    const failedCut = createEditorActionExecutor(
        executorContext(cutCommand.commands, {
            readText: async () => '',
            writeText: async () => false,
        }),
    );

    await expect(failedCut.execute('cut')).resolves.toMatchObject({
        actionId: 'cut',
        reason: 'unsupported',
        status: 'unavailable',
    });
    expect(cutCommand.replaceRange).not.toHaveBeenCalled();
    expect(cutCommand.focus).not.toHaveBeenCalled();

    const pasteCommand = documentCommands({
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
    });
    const failedPaste = createEditorActionExecutor(
        executorContext(pasteCommand.commands, {
            readText: async () => Promise.reject(new Error('denied')),
            writeText: async () => true,
        }),
    );

    await expect(failedPaste.execute('paste')).resolves.toMatchObject({
        actionId: 'paste',
        reason: 'unsupported',
        status: 'unavailable',
    });
    expect(pasteCommand.replaceRange).not.toHaveBeenCalled();
    expect(pasteCommand.focus).not.toHaveBeenCalled();
});
