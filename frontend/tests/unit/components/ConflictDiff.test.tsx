import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import ConflictDiff from '../../../src/ui/components/ConflictDiff';
import { monaco } from '../../../src/ui/components/monacoSetup';

jest.mock('../../../src/ui/components/monacoSetup', () => {
    const original = { dispose: jest.fn() };
    const modified = { dispose: jest.fn() };
    const originalEditor = { updateOptions: jest.fn() };
    const modifiedEditor = { updateOptions: jest.fn() };
    const listeners: Array<() => void> = [];
    const diff = {
        dispose: jest.fn(),
        getLineChanges: jest.fn(() => [{ originalStartLineNumber: 1 }]),
        getModifiedEditor: jest.fn(() => modifiedEditor),
        getOriginalEditor: jest.fn(() => originalEditor),
        goToDiff: jest.fn(),
        onDidUpdateDiff: jest.fn((listener: () => void) => {
            listeners.push(listener);
            return { dispose: jest.fn() };
        }),
        setModel: jest.fn((model: unknown) => {
            if (model !== null) queueMicrotask(() => listeners.forEach((listener) => listener()));
        }),
    };
    return {
        applyMonacoThemeFromRoot: jest.fn(() => jest.fn()),
        monaco: {
            editor: {
                createModel: jest.fn((text: string) => (text === 'disk' ? original : modified)),
                createDiffEditor: jest.fn(() => diff),
            },
        },
    };
});

it('keeps complete read-only models available for change navigation and disposes them on close', async () => {
    const { unmount } = render(<ConflictDiff onDisk="disk" yours="mine" />);
    const createModel = jest.mocked(monaco.editor.createModel);
    const createDiffEditor = jest.mocked(monaco.editor.createDiffEditor);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next change' })).toBeEnabled());

    expect(createModel).toHaveBeenNthCalledWith(1, 'disk', 'markdown');
    expect(createModel).toHaveBeenNthCalledWith(2, 'mine', 'markdown');
    expect(createDiffEditor).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
            disableLayerHinting: true,
            ignoreTrimWhitespace: false,
            maxComputationTime: 5000,
            modifiedAriaLabel: 'Yours',
            originalEditable: false,
            originalAriaLabel: 'On disk',
            readOnly: true,
            stopRenderingLineAfter: -1,
            wordWrap: 'on',
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous change' }));
    const diff = createDiffEditor.mock.results[0].value as ReturnType<typeof monaco.editor.createDiffEditor>;
    expect(diff.goToDiff).toHaveBeenNthCalledWith(1, 'next');
    expect(diff.goToDiff).toHaveBeenNthCalledWith(2, 'previous');
    expect(diff.getOriginalEditor().updateOptions).toHaveBeenCalledWith({ ariaLabel: 'On disk' });
    expect(diff.getModifiedEditor().updateOptions).toHaveBeenCalledWith({ ariaLabel: 'Yours' });

    unmount();
    expect(diff.dispose).toHaveBeenCalledTimes(1);
    expect(
        (createModel.mock.results[0].value as ReturnType<typeof monaco.editor.createModel>).dispose,
    ).toHaveBeenCalledTimes(1);
    expect(
        (createModel.mock.results[1].value as ReturnType<typeof monaco.editor.createModel>).dispose,
    ).toHaveBeenCalledTimes(1);
});

it('reports incomplete highlighting when unequal texts yield no computed changes', async () => {
    const createDiffEditor = jest.mocked(monaco.editor.createDiffEditor);
    const originalImplementation = createDiffEditor.getMockImplementation();
    if (originalImplementation === undefined) throw new Error('Monaco test factory is missing');
    createDiffEditor.mockImplementationOnce((...args) => {
        const editor = originalImplementation(...args);
        jest.mocked(editor.getLineChanges).mockReturnValueOnce([]);
        return editor;
    });

    render(<ConflictDiff onDisk="disk" yours="mine" />);
    expect(await screen.findByText(/highlighting may be incomplete/iu)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next change' })).toBeEnabled();
});

it('retains complete scrollable text when Monaco cannot start', async () => {
    jest.mocked(monaco.editor.createDiffEditor).mockImplementationOnce(() => {
        throw new Error('renderer unavailable');
    });
    render(<ConflictDiff onDisk="complete disk" yours="complete yours" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('complete text remains');
    expect(screen.getByRole('textbox', { name: 'On disk' })).toHaveValue('complete disk');
    expect(screen.getByRole('textbox', { name: 'Yours' })).toHaveValue('complete yours');
    expect(document.querySelector('[data-conflict-diff]')).not.toBeVisible();
});

it('reports incomplete highlighting when computation exceeds five seconds', async () => {
    jest.useFakeTimers();
    const createDiffEditor = jest.mocked(monaco.editor.createDiffEditor);
    const originalImplementation = createDiffEditor.getMockImplementation();
    if (originalImplementation === undefined) throw new Error('Monaco test factory is missing');
    createDiffEditor.mockImplementationOnce((...args) => {
        const diff = originalImplementation(...args);
        diff.setModel = jest.fn();
        return diff;
    });
    try {
        render(<ConflictDiff onDisk="disk" yours="mine" />);
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.getByText('Preparing complete comparison…')).toBeVisible();
        act(() => jest.advanceTimersByTime(5000));
        expect(screen.getByText(/highlighting may be incomplete/iu)).toBeVisible();
    } finally {
        jest.useRealTimers();
    }
});
