import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { EditorProps } from '@monaco-editor/react';
import type { editor, IDisposable, IScrollEvent } from 'monaco-editor';

import EditorStage, { type EditorStageAdapter } from '../../src/ui/widgets/EditorStage/EditorStage';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import {
    acknowledgeEditorSettings,
    defaultEditorSettings,
    resetSettingsProjection,
} from '../../src/logic/store/settingsSlice';
import type { DocumentMetadata } from '../../src/logic/store/appModelTypes';
import { store } from '../../src/logic/store';
import { EditorSessionProvider } from '../../src/ui/widgets/editorSession';

const FRAME_MS = 16;
const PREVIEW_TOP = 100;
const PREVIEW_CLIENT_HEIGHT = 400;
const PREVIEW_SCROLL_HEIGHT = 3000;

/** Fifty paragraphs, one every other line, so the document ends at line 99. */
const DOCUMENT_CONTENT = Array.from({ length: 50 }, (_, index) => `Paragraph ${index + 1}`).join('\n\n');

interface MockEditor {
    instance: editor.IStandaloneCodeEditor;
    readonly scrollTop: number;
    userScroll(scrollTop: number): void;
}

const mockMonaco: { instances: MockEditor[] } = { instances: [] };

/** Monaco laying out 20 px lines under 12 px of padding in a 300 px viewport, so 99 lines end at 2004 px. */
function mockCreateEditor(content: string): MockEditor {
    const lineCount = content.split('\n').length;
    const scrollListeners = new Set<(event: IScrollEvent) => void>();
    let scrollTop = 0;
    const model = {
        dispose: jest.fn(),
        getLineCount: (): number => lineCount,
        getValue: (): string => content,
    };
    const report = (): void => {
        for (const listener of [...scrollListeners]) {
            listener({ scrollTop, scrollTopChanged: true } as IScrollEvent);
        }
    };
    const idle = (): IDisposable => ({ dispose: (): void => undefined });
    const instance = {
        dispose: jest.fn(),
        focus: jest.fn(),
        getBottomForLineNumber: (lineNumber: number): number => 12 + lineNumber * 20,
        getLayoutInfo: (): editor.EditorLayoutInfo => ({ height: 300 }) as editor.EditorLayoutInfo,
        getModel: () => model,
        getScrollTop: (): number => scrollTop,
        getSelection: (): null => null,
        getTopForLineNumber: (lineNumber: number): number => 12 + (lineNumber - 1) * 20,
        layout: jest.fn(),
        onDidBlurEditorText: idle,
        onDidChangeConfiguration: idle,
        onDidChangeCursorPosition: idle,
        onDidChangeCursorSelection: idle,
        onDidChangeHiddenAreas: idle,
        onDidChangeModelContent: idle,
        onDidContentSizeChange: idle,
        onDidLayoutChange: idle,
        onDidScrollChange: (listener: (event: IScrollEvent) => void): IDisposable => {
            scrollListeners.add(listener);

            return {
                dispose: (): void => {
                    scrollListeners.delete(listener);
                },
            };
        },
        restoreViewState: jest.fn(),
        saveViewState: jest.fn((): null => null),
        setScrollTop: (next: number): void => {
            if (next === scrollTop) return;
            scrollTop = next;
            report();
        },
        setSelection: jest.fn(),
        updateOptions: jest.fn(),
    };

    return {
        instance: instance as unknown as editor.IStandaloneCodeEditor,
        get scrollTop(): number {
            return scrollTop;
        },
        userScroll(next: number): void {
            scrollTop = next;
            report();
        },
    };
}

jest.mock('@monaco-editor/react', () => {
    const React = jest.requireActual<typeof import('react')>('react');

    const MockMonacoEditor = (props: EditorProps): React.JSX.Element => {
        const { defaultValue, onMount } = props;
        // A distinct editor per activation, as Monaco creates one editor per mount.
        const [mounted] = React.useState(() => mockCreateEditor(defaultValue ?? ''));

        React.useEffect((): void => {
            mockMonaco.instances.push(mounted);
            onMount?.(mounted.instance, {} as Parameters<NonNullable<EditorProps['onMount']>>[1]);
        }, [mounted]);

        return React.createElement('textarea', { 'aria-label': 'Markdown source', defaultValue });
    };

    return { __esModule: true, default: MockMonacoEditor, loader: { config: jest.fn() } };
});

jest.mock('../../src/ui/components/monacoSetup', () => ({
    __esModule: true,
    applyMonacoThemeFromRoot: jest.fn(() => jest.fn()),
    monaco: {},
}));

function rectAt(top: number): DOMRect {
    return {
        bottom: top,
        height: 0,
        left: 0,
        right: 0,
        toJSON: (): Record<string, never> => ({}),
        top,
        width: 0,
        x: 0,
        y: top,
    };
}

function isPreviewContainer(element: Element): boolean {
    return element.classList.contains('previewContent');
}

/**
 * jsdom lays nothing out, so the preview reports the geometry of a rendered
 * document: 3000 px of content in a 400 px pane, where each odd source line
 * starts 30 px further down. Editor 412 px and preview 600 px are then the same
 * place in the document, the block of line 21.
 */
function stubPreviewGeometry(): void {
    Object.defineProperties(HTMLElement.prototype, {
        clientHeight: {
            configurable: true,
            get(this: HTMLElement): number {
                return isPreviewContainer(this) ? PREVIEW_CLIENT_HEIGHT : 0;
            },
        },
        scrollHeight: {
            configurable: true,
            get(this: HTMLElement): number {
                return isPreviewContainer(this) ? PREVIEW_SCROLL_HEIGHT : 0;
            },
        },
    });

    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element): DOMRect {
        if (isPreviewContainer(this)) return rectAt(PREVIEW_TOP);

        const container = this.closest('.previewContent');
        const line = Number(this.getAttribute('data-source-line'));
        if (container === null || !Number.isInteger(line) || line <= 0) return rectAt(0);

        return rectAt(PREVIEW_TOP + (line - 1) * 30 - container.scrollTop);
    });
}

function restorePreviewGeometry(): void {
    const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;
    delete prototype.clientHeight;
    delete prototype.scrollHeight;
}

interface StageView {
    editorVisible: boolean;
    previewVisible: boolean;
}

function documentMetadata(previewScrollTop: number): DocumentMetadata {
    return {
        documentId: 'document-1',
        title: 'Synchronized document',
        path: '',
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 100,
        view: {
            arrangement: 'split',
            editorVisible: true,
            previewVisible: true,
            cursor: { line: 1, column: 1 },
            selection: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 },
            },
            scroll: { editor: 0, preview: previewScrollTop },
        },
    };
}

function createAdapter(): EditorStageAdapter {
    return {
        flushBuffer: jest.fn(async (): Promise<void> => undefined),
        flushDocView: jest.fn(async (): Promise<void> => undefined),
        subscribeAcceptedBuffers: jest.fn(() => jest.fn()),
        updateBuffer: jest.fn(async (): Promise<void> => undefined),
        updateDocView: jest.fn(async (): Promise<void> => undefined),
    };
}

async function renderStage(view: StageView, previewScrollTop = 0): Promise<{ show: (next: StageView) => void }> {
    const metadata = documentMetadata(previewScrollTop);
    const activeBuffer = { documentId: metadata.documentId, content: DOCUMENT_CONTENT };
    const adapter = createAdapter();
    store.dispatch(
        hydrateProjection({
            revision: 1,
            documents: { [metadata.documentId]: metadata },
            activeDocumentId: metadata.documentId,
            ui: {},
        }),
    );

    const stage = (current: StageView): React.JSX.Element => (
        <Provider store={store}>
            <EditorSessionProvider activeBuffer={activeBuffer}>
                <EditorStage
                    activeBuffer={activeBuffer}
                    activeDocument={metadata}
                    adapter={adapter}
                    editorVisible={current.editorVisible}
                    previewVisible={current.previewVisible}
                    readOnly={false}
                    view={metadata.view}
                    onLiveCursorChange={jest.fn()}
                    onPreviewWarning={jest.fn()}
                />
            </EditorSessionProvider>
        </Provider>
    );

    const rendered = render(stage(view));
    // By label, not by role: a hidden editor pane is out of the accessibility tree but still mounted.
    await screen.findByLabelText('Markdown source');

    return {
        show: (next: StageView): void => {
            rendered.rerender(stage(next));
        },
    };
}

async function advanceFrames(count: number): Promise<void> {
    await act(async (): Promise<void> => {
        await jest.advanceTimersByTimeAsync(FRAME_MS * count);
    });
}

function previewScrollContainer(): HTMLElement {
    const container = screen.getByRole('region', { name: 'Preview pane' }).querySelector('.previewContent');
    if (container === null) throw new Error('expected a preview scroll container');

    return container as HTMLElement;
}

function currentEditor(): MockEditor {
    const mounted = mockMonaco.instances.at(-1);
    if (mounted === undefined) throw new Error('expected a mounted editor');

    return mounted;
}

beforeEach((): void => {
    jest.useFakeTimers();
    mockMonaco.instances.length = 0;
    stubPreviewGeometry();
});

afterEach((): void => {
    jest.useRealTimers();
    restorePreviewGeometry();
    jest.restoreAllMocks();
    store.dispatch(resetProjection());
    store.dispatch(resetSettingsProjection());
});

it('moves the preview with the editor in split view', async () => {
    await renderStage({ editorVisible: true, previewVisible: true });
    await advanceFrames(3);
    const preview = previewScrollContainer();

    act((): void => {
        currentEditor().userScroll(812);
    });
    await advanceFrames(1);

    expect(preview.scrollTop).toBe(1200);
});

it('moves the editor with the preview in split view', async () => {
    await renderStage({ editorVisible: true, previewVisible: true });
    await advanceFrames(3);
    const preview = previewScrollContainer();

    preview.scrollTop = 600;
    fireEvent.scroll(preview);
    await advanceFrames(1);

    expect(currentEditor().scrollTop).toBe(412);
});

it('aligns the editor to the preview after switching from Preview to Split', async () => {
    const { show } = await renderStage({ editorVisible: false, previewVisible: true }, 600);
    await advanceFrames(3);
    const preview = previewScrollContainer();

    // The preview opens where the document was left, and the editor at its top.
    expect(preview.scrollTop).toBe(600);
    expect(currentEditor().scrollTop).toBe(0);

    show({ editorVisible: true, previewVisible: true });
    await advanceFrames(3);

    expect(currentEditor().scrollTop).toBe(412);
    expect(preview.scrollTop).toBe(600);
});

it('marks the preview scroll container only while synchronized scrolling is active', async () => {
    const { show } = await renderStage({ editorVisible: true, previewVisible: true });
    await advanceFrames(3);

    expect(previewScrollContainer()).toHaveAttribute('data-scroll-sync', 'on');

    // Preview on its own has no editor to stay level with.
    show({ editorVisible: false, previewVisible: true });
    await advanceFrames(1);

    expect(previewScrollContainer()).not.toHaveAttribute('data-scroll-sync');

    show({ editorVisible: true, previewVisible: true });
    await advanceFrames(1);

    expect(previewScrollContainer()).toHaveAttribute('data-scroll-sync', 'on');
});

it('leaves both panes independent when synchronized scrolling is off', async () => {
    store.dispatch(acknowledgeEditorSettings({ ...defaultEditorSettings, scrollSync: false }));
    await renderStage({ editorVisible: true, previewVisible: true });
    await advanceFrames(3);
    const preview = previewScrollContainer();

    expect(preview).not.toHaveAttribute('data-scroll-sync');

    act((): void => {
        currentEditor().userScroll(812);
    });
    await advanceFrames(1);

    expect(preview.scrollTop).toBe(0);

    preview.scrollTop = 600;
    fireEvent.scroll(preview);
    await advanceFrames(1);

    expect(currentEditor().scrollTop).toBe(812);
});
