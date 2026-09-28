import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import type { DocumentMetadata, TabTransitionResult } from '../../src/logic/store/appModelTypes';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import DocumentTabs from '../../src/ui/widgets/DocumentTabs/DocumentTabs';

function documentFor(documentId: string, path: string): DocumentMetadata {
    return {
        documentId,
        title: path.split('/').at(-1) ?? 'Untitled',
        path,
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 0,
        contentRevision: 0,
        view: {
            arrangement: 'editor',
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 1, column: 1 },
            selection: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 },
            },
            scroll: { editor: 0, preview: 0 },
        },
    };
}

function hydrate(documents: DocumentMetadata[]): void {
    store.dispatch(
        hydrateProjection({
            revision: 1,
            tabSetRevision: 4,
            documents: Object.fromEntries(documents.map((document) => [document.documentId, document])),
            orderedDocumentIds: documents.map((document) => document.documentId),
            activeDocumentId: documents[0]?.documentId ?? null,
            ui: {},
        }),
    );
}

function renderTabSurface({ adapter = {} }: { adapter?: Parameters<typeof DocumentTabs>[0]['adapter'] } = {}): void {
    render(
        <Provider store={store}>
            <DocumentTabs adapter={adapter} />
        </Provider>,
    );
}

beforeEach(() => {
    store.dispatch(resetProjection());
});

afterEach(() => {
    store.dispatch(resetProjection());
});

it('routes add and reorder commands from the app-layer tab surface', async () => {
    hydrate([
        documentFor('one', '/repo/one.md'),
        documentFor('two', '/repo/two.md'),
        documentFor('three', '/repo/three.md'),
    ]);
    const newDocument = jest.fn(async () => ({}));
    const reorderDocument = jest.fn(
        async (
            documentId: string,
            targetIndex: number,
            expectedTabSetRevision: number,
        ): Promise<TabTransitionResult> => {
            const orderedDocumentIds = ['one', 'two', 'three'];
            const [moved] = orderedDocumentIds.splice(orderedDocumentIds.indexOf(documentId), 1);
            if (moved !== undefined) orderedDocumentIds.splice(targetIndex, 0, moved);
            return {
                status: 'reordered',
                documentId,
                orderedDocumentIds,
                tabSetRevision: expectedTabSetRevision + 1,
            };
        },
    );
    renderTabSurface({ adapter: { newDocument, reorderDocument } });

    fireEvent.click(screen.getByRole('button', { name: 'New tab' }));
    expect(newDocument).toHaveBeenCalledWith(4);

    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getRect(): DOMRect {
        if (this.dataset.tabItem !== undefined) {
            const items = this.parentElement?.querySelectorAll<HTMLElement>('[data-tab-item]') ?? [];
            const index = Array.from(items).indexOf(this);
            return new DOMRect(index * 100, 0, 100, 30);
        }
        return originalRect.call(this);
    };

    try {
        const firstTab = screen.getByRole('tab', { name: /one\.md/iu });
        fireEvent(
            firstTab,
            new MouseEvent('pointerdown', {
                bubbles: true,
                button: 0,
                clientX: 10,
            }),
        );
        fireEvent(document, new MouseEvent('pointermove', { bubbles: true, clientX: 175 }));
        fireEvent(document, new MouseEvent('pointerup', { bubbles: true, clientX: 175 }));
    } finally {
        HTMLElement.prototype.getBoundingClientRect = originalRect;
    }

    await waitFor(() => expect(reorderDocument).toHaveBeenCalledWith('one', 1, 4));
});

it('passes pointer context anchors through the consumer to the tab menu', async () => {
    hydrate([documentFor('one', '/repo/one.md'), documentFor('two', '/repo/two.md')]);
    renderTabSurface();

    fireEvent.contextMenu(screen.getByRole('tab', { name: /one\.md/iu }), {
        clientX: 42,
        clientY: 58,
    });

    const menu = await screen.findByRole('menu', { name: 'Tab actions' });
    expect(menu).toHaveAttribute('data-viewport-popup', 'tab-menu');
    expect(menu).toHaveStyle({ left: '42px', top: '58px' });
    expect(screen.getByRole('menuitem', { name: 'Move tab right' })).toHaveAttribute('aria-keyshortcuts');
});
