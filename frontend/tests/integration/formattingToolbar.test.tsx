import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { showEditor } from '../support/showEditor';
import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';
import { hydrateSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';

import { documentFixture } from '../support/appFixtures';
import { applyStatePatch } from '../../src/logic/store/appModelProjectionActions';
import { store } from '../../src/logic/store';
import { currentPlatform } from '../../src/logic/actions/shortcutRegistry';
import EditorContextMenu from '../../src/ui/widgets/EditorContextMenu';
import { DocumentCommandContext, EditorSessionContext } from '../../src/ui/widgets/editorSession';
import FormattingToolbar from '../../src/ui/widgets/FormattingToolbar/FormattingToolbar';
import { acquire } from '../../src/logic/operations/operationSlot';
import { TidyCommandsContext } from '../../src/ui/widgets/tidyCommandsContext';
import { ModalStateContext } from '../../src/ui/widgets/modalStateContext';

const renderToolbar = (
    ui: React.ReactNode = <FormattingToolbar arrangement="split" onArrangementChange={jest.fn()} />,
) => {
    store.dispatch(hydrateSettings(loadedMarkdownSettings));
    return render(<Provider store={store}>{ui}</Provider>);
};

function rect(width: number, height = 30): DOMRect {
    return {
        bottom: height,
        height,
        left: 0,
        right: width,
        top: 0,
        width,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    } as DOMRect;
}

beforeEach(() => {
    showEditor();
});

it('gates marker controls across toolbar and context menu until settings load', () => {
    store.dispatch(resetSettingsProjection());
    render(
        <Provider store={store}>
            <FormattingToolbar arrangement="split" onArrangementChange={jest.fn()} />
            <EditorContextMenu>
                <button type="button" data-editor-surface>
                    Editor surface
                </button>
            </EditorContextMenu>
        </Provider>,
    );
    for (const name of ['Italic', 'Bullet list', 'Task list']) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Bold' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Numbered list' })).toBeEnabled();
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Editor surface' }));
    expect(screen.getByRole('menuitem', { name: /Italic/ })).toBeDisabled();

    act(() => {
        store.dispatch(hydrateSettings(loadedMarkdownSettings));
    });
    for (const name of ['Italic', 'Bullet list', 'Task list']) {
        expect(screen.getByRole('button', { name })).toBeEnabled();
    }
    expect(screen.getByRole('menuitem', { name: /Italic/ })).toBeEnabled();
});

it('renders grouped formatting controls with a trailing arrangement island', () => {
    renderToolbar();

    const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
    const main = toolbar.querySelector('[data-bar-slot="main"]');
    const groups = main?.querySelectorAll(':scope > [data-bar-item]');

    expect(toolbar).toHaveAttribute('data-bar-overflow', 'menu');
    expect(groups).toHaveLength(5);
    expect(toolbar.querySelector('[data-bar-slot="trailing"] [role="radiogroup"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('data-tool-button-variant', 'icon');
    expect(screen.getByRole('button', { name: 'Format' })).toHaveAttribute('data-tool-button-variant', 'text');
});

it('replaces the Format control with Cancel while any tidy run, here Compact, shows progress', () => {
    const slot = acquire('compact', { documentId: 'doc-1', size: 1024 * 1024 + 1 });
    expect(slot).not.toBeNull();
    const cancel = jest.fn();
    try {
        renderToolbar(
            <TidyCommandsContext.Provider value={{ run: jest.fn(), cancel, documentChanged: jest.fn() }}>
                <FormattingToolbar arrangement="editor" onArrangementChange={jest.fn()} />
            </TidyCommandsContext.Provider>,
        );
        const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
        const control = within(toolbar).getByRole('button', { name: 'Cancel' });
        expect(control.closest('[data-bar-overflow="never"]')).toBeInTheDocument();
        expect(within(toolbar).queryByRole('button', { name: 'Compact' })).not.toBeInTheDocument();
        expect(within(toolbar).queryByRole('button', { name: 'Format' })).not.toBeInTheDocument();
        expect(control).toHaveAttribute('data-action-id', 'format');
        fireEvent.click(control);
        expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
        slot?.release();
    }
});

it('moves measured groups into the shared overflow Popup below 768px', async () => {
    const originalWidth = window.innerWidth;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 700,
    });
    HTMLElement.prototype.getBoundingClientRect = function getRect(): DOMRect {
        if (this.dataset.barItem !== undefined) {
            if (this.hidden) return rect(0);
            const widths: Record<string, number> = {
                '200': 120,
                '400': 160,
                '0': 100,
            };
            return rect(widths[this.dataset.barOverflowPriority ?? '0'] ?? 100);
        }
        if (this.getAttribute('role') === 'toolbar') return rect(480, 38);
        return originalRect.call(this);
    };

    try {
        renderToolbar();
        const toolbar = screen.getByRole('toolbar', { name: 'Document toolbar' });
        await waitFor(() => expect(toolbar).toHaveAttribute('data-bar-overflowing', 'true'));

        for (let measurement = 0; measurement < 3; measurement += 1) {
            fireEvent.resize(window);
            expect(within(toolbar).queryByRole('button', { name: 'Quote' })).toBeNull();
            expect(within(toolbar).queryByRole('button', { name: 'Link' })).toBeNull();
        }

        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        const popup = await screen.findByRole('menu', { name: 'More actions' });
        expect(popup).toHaveAttribute('data-viewport-popup', 'editor-overflow');
        const link = within(popup).getByRole('menuitem', { name: 'Link' });
        const linkShortcut = /Mac|iPhone|iPad/u.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
        expect(link).toBeVisible();
        expect(link).toHaveTextContent('Link');
        expect(link).toHaveTextContent(linkShortcut);
        expect(link).toHaveAttribute('data-shortcut', linkShortcut);

        const pointerDown = createEvent.mouseDown(link);
        fireEvent(link, pointerDown);
        expect(pointerDown.defaultPrevented).toBe(true);
        expect(
            toolbar.querySelector('[data-bar-slot="main"] [data-action-id="link"]')?.closest('[data-bar-item]'),
        ).toHaveAttribute('hidden');
    } finally {
        HTMLElement.prototype.getBoundingClientRect = originalRect;
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: originalWidth,
        });
    }
});

it('routes a formatting activation through the editor command context', async () => {
    const focus = jest.fn(() => ({
        status: 'available' as const,
        value: undefined,
    }));
    const replaceRange = jest.fn(() => ({
        status: 'available' as const,
        value: undefined,
    }));
    const commands = {
        focus,
        getContent: jest.fn(() => ({
            status: 'available' as const,
            value: 'word',
        })),
        getSelection: jest.fn(() => ({
            status: 'available' as const,
            value: {
                start: { lineNumber: 1, column: 1 },
                end: { lineNumber: 1, column: 5 },
            },
        })),
        replaceRange,
        replaceAll: jest.fn(),
        applyEdits: jest.fn(() => ({ status: 'available' as const, value: undefined })),
        setPosition: jest.fn(() => ({ status: 'available' as const, value: undefined })),
        setMarkers: jest.fn(() => ({ status: 'available' as const, value: undefined })),
    };

    renderToolbar(
        <EditorSessionContext.Provider value={{ documentId: 'doc-1', content: 'word' }}>
            <DocumentCommandContext.Provider value={commands}>
                <FormattingToolbar arrangement="editor" onArrangementChange={jest.fn()} />
            </DocumentCommandContext.Provider>
        </EditorSessionContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));

    await waitFor(() => expect(replaceRange).toHaveBeenCalledWith(expect.anything(), '_word_', expect.anything()));
    expect(focus).toHaveBeenCalledTimes(1);
});

it('uses one focused editor-action path for toolbar, popup, and shortcut formatting', async () => {
    const focus = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const replaceRange = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const commands = {
        focus,
        getContent: () => ({ status: 'available' as const, value: 'word' }),
        getSelection: () => ({
            status: 'available' as const,
            value: {
                start: { lineNumber: 1, column: 1 },
                end: { lineNumber: 1, column: 5 },
            },
        }),
        replaceAll: jest.fn(),
        applyEdits: jest.fn(() => ({ status: 'available' as const, value: undefined })),
        setPosition: jest.fn(() => ({ status: 'available' as const, value: undefined })),
        setMarkers: jest.fn(() => ({ status: 'available' as const, value: undefined })),
        replaceRange,
    };

    renderToolbar(
        <EditorSessionContext.Provider value={{ documentId: 'doc-1', content: 'word' }}>
            <DocumentCommandContext.Provider value={commands}>
                <FormattingToolbar arrangement="editor" onArrangementChange={jest.fn()} />
                <EditorContextMenu>
                    <div data-editor-surface>
                        <textarea aria-label="Markdown source" />
                    </div>
                </EditorContextMenu>
            </DocumentCommandContext.Provider>
        </EditorSessionContext.Provider>,
    );

    const expectBoldEdit = (): void => {
        expect(replaceRange).toHaveBeenCalledWith(expect.anything(), '**word**', {
            start: { lineNumber: 1, column: 3 },
            end: { lineNumber: 1, column: 7 },
        });
        expect(focus).toHaveBeenCalledTimes(1);
    };

    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(expectBoldEdit);

    replaceRange.mockClear();
    focus.mockClear();
    fireEvent.contextMenu(screen.getByLabelText('Markdown source'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bold' }));
    await waitFor(expectBoldEdit);

    replaceRange.mockClear();
    focus.mockClear();
    const editor = screen.getByLabelText('Markdown source');
    editor.focus();
    const platform = currentPlatform();
    fireEvent.keyDown(window, {
        code: 'KeyB',
        ctrlKey: platform !== 'darwin',
        key: 'b',
        metaKey: platform === 'darwin',
    });
    await waitFor(expectBoldEdit);
});

it('routes Find and Replace shortcuts from the editor and Find widget while keeping modal keys isolated', async () => {
    const showFind = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const showReplace = jest.fn(() => ({ status: 'available' as const, value: undefined }));
    const commands = {
        focus: jest.fn(() => ({ status: 'available' as const, value: undefined })),
        getContent: () => ({ status: 'available' as const, value: 'one one' }),
        getSelection: () => ({ status: 'available' as const, value: null }),
        replaceAll: jest.fn(),
        replaceRange: jest.fn(),
        applyEdits: jest.fn(),
        setPosition: jest.fn(),
        setMarkers: jest.fn(),
        showFind,
        showReplace,
    };
    const ui = (modalOpen: boolean): React.ReactNode => (
        <ModalStateContext.Provider value={modalOpen}>
            <EditorSessionContext.Provider value={{ documentId: 'doc-1', content: 'one one' }}>
                <DocumentCommandContext.Provider value={commands}>
                    <FormattingToolbar arrangement="editor" onArrangementChange={jest.fn()} />
                    <div data-editor-surface>
                        <textarea aria-label="Markdown source" />
                        <input aria-label="Find widget input" />
                    </div>
                    <input aria-label="Other input" />
                </DocumentCommandContext.Provider>
            </EditorSessionContext.Provider>
        </ModalStateContext.Provider>
    );
    const { rerender } = renderToolbar(ui(false));
    const platform = currentPlatform();
    const key = (target: HTMLElement, letter: 'f' | 'r'): void => {
        target.focus();
        fireEvent.keyDown(target, {
            code: `Key${letter.toUpperCase()}`,
            ctrlKey: platform !== 'darwin',
            key: letter,
            metaKey: platform === 'darwin',
        });
    };

    key(screen.getByLabelText('Markdown source'), 'f');
    await waitFor(() => expect(showFind).toHaveBeenCalledTimes(1));
    key(screen.getByLabelText('Find widget input'), 'r');
    await waitFor(() => expect(showReplace).toHaveBeenCalledTimes(1));
    key(screen.getByLabelText('Other input'), 'f');
    expect(showFind).toHaveBeenCalledTimes(1);

    rerender(<Provider store={store}>{ui(true)}</Provider>);
    key(screen.getByLabelText('Find widget input'), 'f');
    key(screen.getByLabelText('Find widget input'), 'r');
    expect(showFind).toHaveBeenCalledTimes(1);
    expect(showReplace).toHaveBeenCalledTimes(1);
});

it('keeps action identity stable across every theme and mode', () => {
    const palettes = [
        ['glass', 'light'],
        ['glass', 'dark'],
        ['material', 'light'],
        ['material', 'dark'],
        ['minimal', 'light'],
        ['minimal', 'dark'],
    ] as const;
    const root = document.documentElement;
    const signature: string[][] = [];

    for (const [theme, mode] of palettes) {
        root.setAttribute('data-theme', theme);
        root.setAttribute('data-mode', mode);
        const rendered = renderToolbar();
        signature.push(
            Array.from(
                rendered.container.querySelectorAll<HTMLButtonElement>(
                    '[role="toolbar"] button[data-action-id], [role="radiogroup"] button[data-action-id]',
                ),
            ).map((button) =>
                [
                    button.dataset.actionId ?? '',
                    button.getAttribute('aria-label') ?? '',
                    button.disabled ? 'disabled' : 'enabled',
                ].join('|'),
            ),
        );
        rendered.unmount();
    }

    expect(new Set(signature.map((items) => items.join('\n'))).size).toBe(1);
});

it('disables the formatting buttons with the reason when the editor is not shown, keeping Format enabled', () => {
    showEditor('preview-doc');
    store.dispatch(
        applyStatePatch({
            revision: 2,
            documents: {
                upsert: {
                    'preview-doc': {
                        ...documentFixture('preview-doc'),
                        view: { ...documentFixture('preview-doc').view, editorVisible: false, previewVisible: true },
                    },
                },
            },
        }),
    );
    renderToolbar(
        <EditorSessionContext.Provider value={{ documentId: 'preview-doc', content: 'word' }}>
            <FormattingToolbar arrangement="preview" onArrangementChange={jest.fn()} />
        </EditorSessionContext.Provider>,
    );
    for (const name of ['Bold', 'Italic', 'Heading 1', 'Table']) {
        const button = screen.getByRole('button', { name });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('title', 'Show the editor to use formatting.');
    }
    expect(screen.getByRole('button', { name: 'Format' })).toBeEnabled();
});
