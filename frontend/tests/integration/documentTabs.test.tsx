import { useEffect, useState } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { type DocumentConflictAdapter } from '../../src/logic/adapter';
import type {
  ConflictPreview,
  DocumentMetadata,
  TabTransitionResult,
} from '../../src/logic/store/appModelTypes';
import { store, useAppSelector } from '../../src/logic/store';
import {
  hydrateProjection,
  resetProjection,
} from '../../src/logic/store/appModelProjectionActions';
import DocumentTabs from '../../src/ui/widgets/DocumentTabs';
import ExternalChangePrompt from '../../src/ui/widgets/ExternalChangePrompt';
import { onApplicationForeground } from '../../src/ui/widgets/foregroundFocus';

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
      documents: Object.fromEntries(
        documents.map((document) => [document.documentId, document]),
      ),
      orderedDocumentIds: documents.map((document) => document.documentId),
      activeDocumentId: documents[0]?.documentId ?? null,
      ui: {},
    }),
  );
}

function previewFor(documentId: string): ConflictPreview {
  return {
    contentRevision: 0,
    detectedDiskVersion: {
      exists: true,
      mode: 0o644,
      modifiedUnixNano: '2',
      size: 6,
    },
    displayName: `${documentId}.md`,
    documentId,
    path: `/repo/${documentId}.md`,
    onDisk: {
      byteCount: 6,
      lineCount: 1,
      text: 'disk\n',
      truncated: false,
    },
    readOnly: false,
    yours: {
      byteCount: 6,
      lineCount: 1,
      text: 'mine\n',
      truncated: false,
    },
  };
}

function renderTabSurface({
  adapter = {},
  conflictAdapter,
}: {
  adapter?: Parameters<typeof DocumentTabs>[0]['adapter'];
  conflictAdapter?: DocumentConflictAdapter;
} = {}): void {
  render(
    <Provider store={store}>
      <ApplicationTabLayer
        adapter={adapter}
        conflictAdapter={conflictAdapter}
      />
    </Provider>,
  );
}

function ApplicationTabLayer({
  adapter,
  conflictAdapter,
}: {
  adapter: Parameters<typeof DocumentTabs>[0]['adapter'];
  conflictAdapter?: DocumentConflictAdapter;
}): React.JSX.Element {
  const [preview, setPreview] = useState<ConflictPreview | null>(null);
  const orderedIds = useAppSelector((state) => state.documents.orderedIds);
  const documentsById = useAppSelector((state) => state.documents.byId);
  const activeDocumentId = useAppSelector(
    (state) => state.documents.activeDocumentId,
  );

  useEffect(() => {
    if (conflictAdapter === undefined) return undefined;
    return onApplicationForeground((): void => {
      void (async (): Promise<void> => {
        for (const documentId of orderedIds) {
          const document = documentsById[documentId];
          if (document === undefined || document.path === '') continue;
          const result = await conflictAdapter.checkExternalChanges(documentId);
          if (
            result.status === 'detected' &&
            result.preview !== undefined &&
            documentId === activeDocumentId
          ) {
            setPreview(result.preview);
          }
        }
      })();
    });
  }, [activeDocumentId, conflictAdapter, documentsById, orderedIds]);

  return (
    <>
      <DocumentTabs adapter={adapter} onExternalConflict={setPreview} />
      <ExternalChangePrompt
        onDecision={jest.fn()}
        open={preview !== null}
        preview={preview ?? undefined}
      />
    </>
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
      const [moved] = orderedDocumentIds.splice(
        orderedDocumentIds.indexOf(documentId),
        1,
      );
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
      const items =
        this.parentElement?.querySelectorAll<HTMLElement>('[data-tab-item]') ??
        [];
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
    fireEvent(
      document,
      new MouseEvent('pointermove', { bubbles: true, clientX: 175 }),
    );
    fireEvent(
      document,
      new MouseEvent('pointerup', { bubbles: true, clientX: 175 }),
    );
  } finally {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  }

  await waitFor(() =>
    expect(reorderDocument).toHaveBeenCalledWith('one', 1, 4),
  );
});

it('runs the foreground sweep in the app layer and opens one active-tab prompt', async () => {
  const first = documentFor('one', '/repo/one.md');
  const second = documentFor('two', '/repo/two.md');
  hydrate([first, second]);
  const checkExternalChanges = jest.fn(async (documentId: string) =>
    documentId === 'one'
      ? { status: 'detected' as const, preview: previewFor(documentId) }
      : { status: 'unchanged' as const },
  );

  renderTabSurface({
    conflictAdapter: {
      authorizeKeepMine: jest.fn(),
      cancelConflict: jest.fn(),
      checkExternalChanges,
      reloadFromDisk: jest.fn(),
      skipConflict: jest.fn(),
    },
  });

  fireEvent.focus(window);

  await waitFor(() => {
    expect(checkExternalChanges).toHaveBeenCalledWith('one');
    expect(checkExternalChanges).toHaveBeenCalledWith('two');
    expect(
      screen.getByRole('dialog', { name: 'File changed on disk' }),
    ).toBeVisible();
  });
});

it('passes pointer context anchors through the consumer to the tab menu', async () => {
  hydrate([
    documentFor('one', '/repo/one.md'),
    documentFor('two', '/repo/two.md'),
  ]);
  renderTabSurface();

  fireEvent.contextMenu(screen.getByRole('tab', { name: /one\.md/iu }), {
    clientX: 42,
    clientY: 58,
  });

  const menu = await screen.findByRole('menu', { name: 'Tab actions' });
  expect(menu).toHaveAttribute('data-viewport-popup', 'tab-menu');
  expect(menu).toHaveStyle({ left: '42px', top: '58px' });
  expect(
    screen.getByRole('menuitem', { name: 'Move tab right' }),
  ).toHaveAttribute('aria-keyshortcuts');
});
