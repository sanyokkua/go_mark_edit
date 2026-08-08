import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import type {
  ConflictPreview,
  DocumentMetadata,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import { store } from '../../logic/store';
import {
  hydrateProjection,
  resetProjection,
} from '../../logic/store/appModelProjectionActions';
import DocumentTabs from './DocumentTabs';

function documentFor(
  documentId: string,
  path: string,
  dirty = false,
): DocumentMetadata {
  return {
    documentId,
    title: path.split('/').at(-1) ?? 'Untitled',
    path,
    dirty,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 0,
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

function hydrate(
  documents: DocumentMetadata[],
  activeDocumentId = documents[0]?.documentId ?? null,
): void {
  store.dispatch(
    hydrateProjection({
      revision: 1,
      tabSetRevision: 4,
      documents: Object.fromEntries(
        documents.map((document) => [document.documentId, document]),
      ),
      orderedDocumentIds: documents.map((document) => document.documentId),
      activeDocumentId,
      ui: {},
    }),
  );
}

function renderTabs(
  adapter: Parameters<typeof DocumentTabs>[0]['adapter'] = {},
  conflictAdapter: Parameters<
    typeof DocumentTabs
  >[0]['conflictAdapter'] = undefined,
): void {
  render(
    <Provider store={store}>
      <DocumentTabs adapter={adapter} conflictAdapter={conflictAdapter} />
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(resetProjection());
});

it('Move tab actions sit between close and path groups', () => {
  const first = documentFor('one', '/repo/one.md');
  const second = documentFor('two', '/repo/two.md');
  hydrate([first, second]);
  renderTabs({
    reorderDocument: jest.fn(async (): Promise<TabTransitionResult> => ({
      status: 'reordered',
      orderedDocumentIds: ['two', 'one'],
    })),
  });

  fireEvent.contextMenu(screen.getByRole('tab', { name: /one\.md/ }));
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual([
    'Close Tab',
    'Close Others',
    'Close to the Right',
    'Move tab left',
    'Move tab right',
    'Copy path',
    'Reveal in file manager',
  ]);
});

it('Move tab is unavailable at each strip edge', () => {
  const first = documentFor('one', '/repo/one.md');
  const second = documentFor('two', '/repo/two.md');
  hydrate([first, second]);
  renderTabs();

  fireEvent.contextMenu(screen.getByRole('tab', { name: /one\.md/ }));
  expect(
    screen.getByRole('menuitem', { name: 'Move tab left' }),
  ).toBeDisabled();
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.contextMenu(screen.getByRole('tab', { name: /two\.md/ }));
  expect(
    screen.getByRole('menuitem', { name: 'Move tab right' }),
  ).toBeDisabled();
});

it('Move tab waits for backend confirmation before projecting order', async () => {
  const first = documentFor('one', '/repo/one.md');
  const second = documentFor('two', '/repo/two.md');
  hydrate([first, second]);
  let resolveMove: (result: TabTransitionResult) => void = () => undefined;
  const reorderDocument = jest.fn(
    () =>
      new Promise<TabTransitionResult>((resolve) => {
        resolveMove = resolve;
      }),
  );
  renderTabs({ reorderDocument });

  fireEvent.contextMenu(screen.getByRole('tab', { name: /two\.md/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Move tab left' }));
  expect(store.getState().documents.orderedIds).toEqual(['one', 'two']);
  resolveMove({
    status: 'reordered',
    orderedDocumentIds: ['two', 'one'],
    tabSetRevision: 5,
  });
  await waitFor(() =>
    expect(reorderDocument).toHaveBeenCalledWith('two', 0, 4),
  );
  expect(store.getState().documents.orderedIds).toEqual(['one', 'two']);
});

it('renders real dirty state and full canonical path tooltips', () => {
  const document = documentFor('one', '/private/work/readme.md', true);
  hydrate([document]);
  renderTabs();

  const tab = screen.getByRole('tab', { name: /readme\.md/ });
  expect(tab).toHaveAttribute('title', '/private/work/readme.md');
  expect(screen.getByLabelText('Modified')).toBeInTheDocument();
});

it('ExternalChangePrompt decisions and invalidation', async () => {
  const first = documentFor('one', '/repo/one.md');
  const second = documentFor('two', '/repo/two.md');
  hydrate([first, second]);
  const preview: ConflictPreview = {
    contentRevision: 0,
    detectedDiskVersion: {
      exists: true,
      mode: 0o644,
      modifiedUnixNano: '4',
      size: 12,
    },
    displayName: 'two.md',
    documentId: 'two',
    path: '/repo/two.md',
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
  const authorizeKeepMine = jest.fn(async () => ({
    status: 'authorized' as const,
    documentId: 'two',
    decisionToken: 'decision-1',
  }));
  const activateDocument = jest.fn(async () => ({
    conflict: preview,
    data: { content: 'mine\n', documentId: 'two', documentRevision: 0 },
  }));
  renderTabs(
    { activateDocument },
    {
      authorizeKeepMine,
      cancelConflict: jest.fn(async () => ({ status: 'cancelled' as const })),
      checkExternalChanges: jest.fn(async () => ({
        status: 'unchanged' as const,
      })),
      reloadFromDisk: jest.fn(async () => ({ status: 'reloaded' as const })),
      skipConflict: jest.fn(async () => ({ status: 'skipped' as const })),
    },
  );

  fireEvent.click(screen.getByRole('tab', { name: /two\.md/iu }));
  await waitFor(() =>
    expect(
      screen.getByRole('dialog', { name: 'File changed on disk' }),
    ).toBeVisible(),
  );
  expect(screen.getByRole('button', { name: 'Skip' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
  await waitFor(() =>
    expect(authorizeKeepMine).toHaveBeenCalledWith(
      'two',
      0,
      '/repo/two.md',
      preview.detectedDiskVersion,
    ),
  );
});

it('queued conflict tabs render blocked-by-conflict', () => {
  const first = {
    ...documentFor('one', '/repo/one.md'),
    conflictBlocked: true,
  };
  const second = {
    ...documentFor('two', '/repo/two.md'),
    conflictBlocked: true,
  };
  hydrate([first, second]);
  renderTabs();

  expect(screen.getAllByText('Blocked by conflict')).toHaveLength(2);
  expect(
    screen.getByRole('tab', { name: /one\.md.*Blocked by conflict/iu }),
  ).toBeVisible();
  expect(
    screen.getByRole('tab', { name: /two\.md.*Blocked by conflict/iu }),
  ).toBeVisible();
});
