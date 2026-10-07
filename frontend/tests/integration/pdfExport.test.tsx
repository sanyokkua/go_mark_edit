import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';

let mockRendererGate: Promise<void> = Promise.resolve();

// The renderer chunk is the one real boundary: the gate decides when it "finishes loading".
jest.mock('../../src/ui/widgets/LazyMarkdownView', () => {
    const react = jest.requireActual<typeof import('react')>('react');
    const actual = jest.requireActual<typeof import('../../src/ui/components/MarkdownView')>(
        '../../src/ui/components/MarkdownView',
    );
    return {
        __esModule: true,
        default: function GatedMarkdownView(props: ComponentProps<typeof actual.default>): React.JSX.Element {
            react.use(mockRendererGate);
            return react.createElement(actual.default, props);
        },
    };
});

jest.mock('../../src/logic/markdown/mermaid/theme', () => ({ resolveMermaidTheme: (): string => 'default' }));

jest.mock('../../src/ui/widgets/AppShell', () => ({ __esModule: true, default: (): null => null }));

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: {
        flushActiveSession: jest.fn(),
        getState: jest.fn(),
        openExternalLink: jest.fn(),
        resolvePreviewImage: jest.fn(
            (documentId: string, source: string): string => `/preview-image?doc=${documentId}&src=${source}`,
        ),
    },
    settingsAdapter: {
        getSettings: jest.fn(async () => ({
            appearance: { defaultOpenMode: 'editor', readingWidth: 'page', mode: 'auto', theme: 'material' },
        })),
        updateAppearance: jest.fn(async () => undefined),
    },
    windowAdapter: { printWindow: jest.fn(async (): Promise<void> => undefined), toggleFullscreen: jest.fn() },
}));

import { AppFrame } from '../../src/app/AppFrame';
import { usePdfExport } from '../../src/app/usePdfExport';
import type { DocumentSession } from '../../src/app/useDocumentSession';
import { appModelAdapter, settingsAdapter, windowAdapter } from '../../src/logic/adapter';
import { mermaidQueue, type MermaidResult } from '../../src/logic/markdown/mermaid/queue';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { resetReading, toggleReading } from '../../src/logic/store/readingSlice';
import { acknowledgeMarkdownSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import type { DocumentMetadata } from '../../src/logic/store/appModelTypes';
import { Provider } from 'react-redux';
import { documentFixture } from '../support/appFixtures';
import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';

const model = appModelAdapter as unknown as Record<string, jest.Mock>;
const printWindow = windowAdapter.printWindow as jest.Mock;

const markdownSettings = loadedMarkdownSettings.markdown!;

function documentWith(id: string, arrangement: DocumentMetadata['view']['arrangement'] = 'editor'): DocumentMetadata {
    const base = documentFixture(id);
    return { ...base, view: { ...base.view, arrangement } };
}

function sessionFor(document: DocumentMetadata | undefined): DocumentSession {
    return {
        activeBuffer:
            document === undefined
                ? null
                : { documentId: document.documentId, content: '', documentRevision: 1, projectionRevision: 1 },
        activeDocument: document,
    } as unknown as DocumentSession;
}

function hydrateDocuments(documents: DocumentMetadata[], activeDocumentId: string | null): void {
    store.dispatch(
        hydrateProjection({
            revision: 1,
            tabSetRevision: 1,
            activeDocumentId,
            orderedDocumentIds: documents.map((document) => document.documentId),
            documents: Object.fromEntries(documents.map((document) => [document.documentId, document])),
            recentItems: [],
            ui: {},
        }),
    );
}

function backendText(documentId: string, content: string, path?: string): void {
    const saved = documentFixture(documentId);
    model.getState.mockResolvedValue({
        snapshot: { documents: { [documentId]: path === undefined ? saved : { ...saved, path } } },
        activeBuffer: { documentId, content, documentRevision: 3, projectionRevision: 3 },
    });
}

function Application({ session }: { session: DocumentSession }): React.JSX.Element {
    const pdf = usePdfExport(session);
    return (
        <AppFrame
            problemsOpen={false}
            onToggleProblems={jest.fn()}
            bootstrap={{ failure: null, isRetrying: false, result: null, retry: jest.fn(), status: 'ready' }}
            menuState={{
                modalOpen: false,
                onAbout: jest.fn(),
                onNewDocument: jest.fn(),
                onOpenDocument: jest.fn(),
                onOpenFolder: jest.fn(),
                onNewWindow: jest.fn(),
                onCloseFolder: jest.fn(),
                onOpenRecentItem: jest.fn(),
                onRefreshRecentItems: jest.fn(),
                onClearRecentItems: jest.fn(),
                onReopenLastFile: jest.fn(),
                onSave: jest.fn(),
                onSaveAs: jest.fn(),
                onCloseDocument: jest.fn(),
                onQuit: jest.fn(),
                onExportPdf: pdf.exportPdf,
                documentId: session.activeDocument?.documentId,
                sessionDocumentId: session.activeBuffer?.documentId,
                writable: true,
                onShortcuts: jest.fn(),
                requestedMenu: null,
                onRequestedMenuHandled: jest.fn(),
            }}
            settingsOpen={false}
            onSettingsOpenChange={jest.fn()}
            onQuit={jest.fn()}
            onRetry={jest.fn()}
            notices={[]}
            banners={[]}
            onDismiss={jest.fn()}
            recovery={null}
            shell={{} as ComponentProps<typeof AppFrame>['shell']}
            printRequest={pdf.request}
        />
    );
}

let root: HTMLElement;

function renderApplication(session: DocumentSession) {
    root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    const view = render(
        <Provider store={store}>
            <Application session={session} />
        </Provider>,
        { container: root },
    );
    return {
        ...view,
        switchTo: (next: DocumentSession): void =>
            view.rerender(
                <Provider store={store}>
                    <Application session={next} />
                </Provider>,
            ),
    };
}

const printCopy = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-print-copy]');

function pressPrint(): boolean {
    return fireEvent.keyDown(window, { key: 'p', code: 'KeyP', ctrlKey: true });
}

// React renders only between act calls, so time moves in one poll interval per act.
async function advance(milliseconds: number): Promise<void> {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) {
        await act(async () => {
            await jest.advanceTimersByTimeAsync(100);
        });
    }
}

beforeEach(async () => {
    jest.useFakeTimers();
    mockRendererGate = Promise.resolve();
    store.dispatch(acknowledgeMarkdownSettings(markdownSettings));
    model.flushActiveSession.mockResolvedValue(undefined);
    printWindow.mockResolvedValue(undefined);
});

afterEach(() => {
    jest.useRealTimers();
    root.remove();
    store.dispatch(resetProjection());
    store.dispatch(resetReading());
    store.dispatch(resetNotifications());
    store.dispatch(resetSettingsProjection());
    jest.clearAllMocks();
});

describe('Export to PDF with a document open', () => {
    const doc = documentWith('doc-1');

    beforeEach(() => hydrateDocuments([doc], 'doc-1'));

    it('prints the backend text of an unsaved document after flushing, and leaves the document modified', async () => {
        backendText('doc-1', '# Draft');
        renderApplication(sessionFor(doc));

        expect(pressPrint()).toBe(false);
        await advance(300);

        expect(within(printCopy()!).getByRole('heading', { name: 'Draft' })).toBeInTheDocument();
        expect(printWindow).toHaveBeenCalledTimes(1);
        expect(model.flushActiveSession).toHaveBeenCalledWith('doc-1');
        expect(model.flushActiveSession.mock.invocationCallOrder[0]).toBeLessThan(
            model.getState.mock.invocationCallOrder[0] ?? Infinity,
        );
        expect(store.getState().documents.byId['doc-1']?.dirty).toBe(true);
    });

    it.each([
        ['clean', 'clean'],
        ['styled', 'styled'],
    ])('marks the print copy %s while the on-screen application keeps its dark theme', async (stored, expected) => {
        (settingsAdapter.getSettings as jest.Mock).mockResolvedValueOnce({
            appearance: {
                defaultOpenMode: 'editor',
                readingWidth: 'page',
                pdfAppearance: stored,
                mode: 'dark',
                theme: 'material',
            },
        });
        backendText('doc-1', '# Appearance');
        renderApplication(sessionFor(doc));
        await advance(100);

        pressPrint();
        await advance(300);

        expect(printCopy()).toHaveAttribute('data-print-appearance', expected);
        expect(document.documentElement).toHaveAttribute('data-mode', 'dark');
        expect(root.querySelector('[data-print-appearance]')).toBeNull();
    });

    it('renders the copy as a child of the body outside the application root', async () => {
        backendText('doc-1', 'Some text');
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(300);

        expect(printCopy()?.parentElement).toBe(document.body);
        expect(root.contains(printCopy())).toBe(false);
        expect(screen.queryAllByRole('menubar').every((menubar) => !printCopy()!.contains(menubar))).toBe(true);
    });

    it('prints from the File menu entry and leaves the arrangement and modified state unchanged', async () => {
        backendText('doc-1', '# Menu');
        renderApplication(sessionFor(doc));

        fireEvent.click(screen.getByRole('button', { name: 'File' }));
        const entry = within(screen.getByRole('menu', { name: 'File' })).getByRole('menuitem', {
            name: 'Export to PDF',
        });
        expect(entry).toBeEnabled();
        fireEvent.click(entry);
        await advance(300);

        expect(printWindow).toHaveBeenCalledTimes(1);
        expect(store.getState().documents.byId['doc-1']?.view.arrangement).toBe('editor');
        expect(store.getState().documents.byId['doc-1']?.dirty).toBe(true);
    });

    it('keeps Reading mode active after Ctrl+P', async () => {
        backendText('doc-1', '# Reading');
        store.dispatch(toggleReading());
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(300);

        expect(printWindow).toHaveBeenCalledTimes(1);
        expect(store.getState().reading.active).toBe(true);
    });

    it('waits for the renderer chunk on a first export and prints once the content has rendered', async () => {
        let loadRenderer: () => void = () => undefined;
        mockRendererGate = new Promise<void>((resolve) => {
            loadRenderer = resolve;
        });
        backendText('doc-1', '# Late');
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(2000);

        expect(printCopy()?.querySelector('[data-print-pending]')).not.toBeNull();
        expect(printWindow).not.toHaveBeenCalled();

        loadRenderer();
        await advance(300);

        expect(within(printCopy()!).getByRole('heading', { name: 'Late' })).toBeInTheDocument();
        expect(printCopy()?.querySelector('[data-print-pending]')).toBeNull();
        expect(printWindow).toHaveBeenCalledTimes(1);
    });

    it('prints after 10 seconds when the content never renders', async () => {
        mockRendererGate = new Promise<void>(() => undefined);
        backendText('doc-1', '# Never');
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(9800);
        expect(printWindow).not.toHaveBeenCalled();

        await advance(300);
        expect(printWindow).toHaveBeenCalledTimes(1);
    });

    it('ignores a second request while the first is waiting', async () => {
        let loadRenderer: () => void = () => undefined;
        mockRendererGate = new Promise<void>((resolve) => {
            loadRenderer = resolve;
        });
        backendText('doc-1', '# Once');
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(300);
        pressPrint();
        await advance(300);
        expect(model.getState).toHaveBeenCalledTimes(1);

        loadRenderer();
        await advance(2000);
        expect(printWindow).toHaveBeenCalledTimes(1);
    });

    it('replaces the copy with the next export', async () => {
        backendText('doc-1', '# First');
        renderApplication(sessionFor(doc));
        pressPrint();
        await advance(300);
        expect(within(printCopy()!).getByRole('heading', { name: 'First' })).toBeInTheDocument();

        backendText('doc-1', '# Second');
        pressPrint();
        await advance(300);

        expect(document.querySelectorAll('[data-print-copy]')).toHaveLength(1);
        expect(within(printCopy()!).getByRole('heading', { name: 'Second' })).toBeInTheDocument();
        expect(printWindow).toHaveBeenCalledTimes(2);
    });

    it('removes the copy when another document becomes active', async () => {
        const other = documentWith('doc-2');
        hydrateDocuments([doc, other], 'doc-1');
        backendText('doc-1', '# First');
        const view = renderApplication(sessionFor(doc));
        pressPrint();
        await advance(300);
        expect(printCopy()).not.toBeNull();

        act(() => hydrateDocuments([doc, other], 'doc-2'));
        view.switchTo(sessionFor(other));
        await advance(300);

        expect(printCopy()).toBeNull();
    });

    it('suggests the file name as the page title before the print dialog opens, and restores it on a document switch', async () => {
        const other = documentWith('doc-2');
        hydrateDocuments([doc, other], 'doc-1');
        document.title = 'GoMarkEdit';
        backendText('doc-1', '# Named', '/notes/guide.md');
        let titleAtPrint = '';
        printWindow.mockImplementation(async () => {
            titleAtPrint = document.title;
        });
        const view = renderApplication(sessionFor(doc));

        pressPrint();
        await advance(300);

        expect(titleAtPrint).toBe('guide');

        act(() => hydrateDocuments([doc, other], 'doc-2'));
        view.switchTo(sessionFor(other));
        await advance(300);

        expect(printCopy()).toBeNull();
        expect(document.title).toBe('GoMarkEdit');
    });

    it('leaves the page title unchanged when exporting an Untitled document', async () => {
        document.title = 'GoMarkEdit';
        backendText('doc-1', '# Draft', '');
        let titleAtPrint = '';
        printWindow.mockImplementation(async () => {
            titleAtPrint = document.title;
        });
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(300);

        expect(printWindow).toHaveBeenCalledTimes(1);
        expect(titleAtPrint).toBe('GoMarkEdit');
        expect(document.title).toBe('GoMarkEdit');
    });

    it('does not print when the document changes while the export is waiting', async () => {
        const other = documentWith('doc-2');
        hydrateDocuments([doc, other], 'doc-1');
        mockRendererGate = new Promise<void>(() => undefined);
        backendText('doc-1', '# Waiting');
        const view = renderApplication(sessionFor(doc));
        pressPrint();
        await advance(500);

        act(() => hydrateDocuments([doc, other], 'doc-2'));
        view.switchTo(sessionFor(other));
        await advance(11_000);

        expect(printWindow).not.toHaveBeenCalled();
    });

    it('renders a 3 MiB document in full, not the paused notice', async () => {
        const words = 'word '.repeat(630_000);
        backendText('doc-1', `# Big\n\n${words}\n\nFINAL PARAGRAPH`);
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(300);

        expect(printCopy()).toHaveTextContent('FINAL PARAGRAPH');
        expect(printCopy()).not.toHaveTextContent('paused');
        expect(printWindow).toHaveBeenCalledTimes(1);
    }, 60_000);

    it('shows the preview placeholder for a remote image and requests nothing', async () => {
        backendText('doc-1', '![Remote](https://example.com/a.png)');
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(300);

        expect(within(printCopy()!).getByRole('img', { name: 'Remote' })).toHaveClass('gme-preview-image-fallback');
        expect(printCopy()!.querySelector('img')).toBeNull();
        expect(model.resolvePreviewImage).not.toHaveBeenCalled();
    });

    it('resolves a local image through the same resolver as the preview', async () => {
        backendText('doc-1', '![Figure](./figure.png)');
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(300);

        expect(model.resolvePreviewImage).toHaveBeenCalledWith('doc-1', './figure.png');
        expect(printCopy()!.querySelector('img')).toHaveAttribute('src', '/preview-image?doc=doc-1&src=./figure.png');
    });

    describe('waiting for diagrams and images', () => {
        const diagramSource = '```mermaid\ngraph TD; A-->B\n```';
        let finishDiagram: (result: MermaidResult) => void;

        beforeEach(() => {
            jest.spyOn(mermaidQueue, 'render').mockImplementation(
                () =>
                    new Promise<MermaidResult>((resolve) => {
                        finishDiagram = resolve;
                    }),
            );
            store.dispatch(acknowledgeMarkdownSettings({ ...markdownSettings, standard: 'full' }));
        });

        afterEach(() => jest.restoreAllMocks());

        const image = (): HTMLImageElement => printCopy()!.querySelector('img')!;
        function holdImageIncomplete(): void {
            Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => false });
        }
        function completeImage(): void {
            Object.defineProperty(image(), 'complete', { configurable: true, value: true });
        }
        afterEach(() => {
            delete (HTMLImageElement.prototype as { complete?: boolean }).complete;
        });

        it('waits for a pending diagram and prints once it is drawn', async () => {
            backendText('doc-1', diagramSource);
            renderApplication(sessionFor(doc));

            pressPrint();
            await advance(2000);
            expect(printCopy()!.querySelector("[data-mermaid-state='pending']")).not.toBeNull();
            expect(printWindow).not.toHaveBeenCalled();

            await act(async () =>
                finishDiagram({ kind: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }),
            );
            await advance(300);

            expect(printCopy()!.querySelector("[data-mermaid-state='drawn']")).not.toBeNull();
            expect(printWindow).toHaveBeenCalledTimes(1);
        });

        it('waits for an incomplete image and prints once it has loaded', async () => {
            holdImageIncomplete();
            backendText('doc-1', '![Figure](./figure.png)');
            renderApplication(sessionFor(doc));

            pressPrint();
            await advance(2000);
            expect(printWindow).not.toHaveBeenCalled();

            completeImage();
            await advance(300);
            expect(printWindow).toHaveBeenCalledTimes(1);
        });

        it('prints only after both the diagram and the image have settled', async () => {
            holdImageIncomplete();
            backendText('doc-1', `${diagramSource}\n\n![Figure](./figure.png)`);
            renderApplication(sessionFor(doc));

            pressPrint();
            await advance(300);
            await act(async () =>
                finishDiagram({ kind: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }),
            );
            await advance(1000);
            expect(printWindow).not.toHaveBeenCalled();

            completeImage();
            await advance(300);
            expect(printWindow).toHaveBeenCalledTimes(1);
        });

        it('prints at 10 seconds when a diagram stays pending', async () => {
            backendText('doc-1', diagramSource);
            renderApplication(sessionFor(doc));

            pressPrint();
            await advance(9800);
            expect(printWindow).not.toHaveBeenCalled();

            await advance(300);
            expect(printWindow).toHaveBeenCalledTimes(1);
        });

        it('prints at 10 seconds when an image never completes', async () => {
            holdImageIncomplete();
            backendText('doc-1', '![Figure](./figure.png)');
            renderApplication(sessionFor(doc));

            pressPrint();
            await advance(9800);
            expect(printWindow).not.toHaveBeenCalled();

            await advance(300);
            expect(printWindow).toHaveBeenCalledTimes(1);
        });

        it('treats a diagram error as settled', async () => {
            backendText('doc-1', diagramSource);
            renderApplication(sessionFor(doc));

            pressPrint();
            await advance(300);
            await act(async () => finishDiagram({ kind: 'error', message: 'Parse error' }));
            await advance(300);

            expect(printCopy()!.querySelector("[data-mermaid-state='error']")).not.toBeNull();
            expect(printWindow).toHaveBeenCalledTimes(1);
        });

        it('treats a limit placeholder as settled', async () => {
            backendText('doc-1', `\`\`\`mermaid\n${'x'.repeat(50_001)}\n\`\`\``);
            renderApplication(sessionFor(doc));

            pressPrint();
            await advance(300);

            expect(printCopy()!.querySelector("[data-mermaid-state='limit']")).not.toBeNull();
            expect(printWindow).toHaveBeenCalledTimes(1);
        });
    });

    it('shows $x^2$ literally under GFM and rendered under Full', async () => {
        store.dispatch(acknowledgeMarkdownSettings({ ...markdownSettings, standard: 'gfm' }));
        backendText('doc-1', '$x^2$');
        renderApplication(sessionFor(doc));

        pressPrint();
        await advance(300);
        expect(printCopy()).toHaveTextContent('$x^2$');
        expect(printCopy()!.querySelector('.katex')).toBeNull();

        act(() => {
            store.dispatch(acknowledgeMarkdownSettings({ ...markdownSettings, standard: 'full' }));
        });
        pressPrint();
        await advance(300);
        expect(printCopy()!.querySelector('.katex')).not.toBeNull();
    });
});

describe('Export to PDF without a document', () => {
    it('keeps Export disabled, prevents the default of Ctrl+P and prints nothing', async () => {
        hydrateDocuments([], null);
        renderApplication(sessionFor(undefined));

        expect(pressPrint()).toBe(false);
        await advance(300);

        expect(printWindow).not.toHaveBeenCalled();
        expect(model.getState).not.toHaveBeenCalled();
        expect(printCopy()).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'File' }));
        expect(
            within(screen.getByRole('menu', { name: 'File' })).getByRole('menuitem', { name: 'Export to PDF' }),
        ).toBeDisabled();
    });
});
