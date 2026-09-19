import {
    createEditorActionExecutor,
    type EditorActionExecutorContext,
} from '../../../src/logic/actions/editorActionExecutor';
import type { DocumentCommandAPI } from '../../../src/logic/hooks/useDocumentCommands';

function documentCommands(
    selection: { start: { lineNumber: number; column: number }; end: { lineNumber: number; column: number } },
    source = 'word',
) {
    const focus = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const replaceRange = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const commands: DocumentCommandAPI = {
        focus,
        getContent: () => ({ status: 'available', value: source }),
        getSelection: jest.fn(() => ({ status: 'available', value: selection })),
        replaceAll: jest.fn(() => ({ status: 'available', value: undefined })),
        replaceRange,
    };
    return { commands, focus, replaceRange };
}

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
