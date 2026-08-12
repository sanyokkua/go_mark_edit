import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

it('T033 applies the contained tab-strip metrics and fixed add-control size', () => {
  const tabStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/DocumentTabs.module.css'),
    'utf8',
  );

  expect(tabStyles).toContain('gap: var(--tabs-gap)');
  expect(tabStyles).toContain('padding: var(--tabs-row-padding)');
  expect(tabStyles).toContain('padding: var(--tab-padding)');
  expect(tabStyles).toContain('font-size: var(--tab-label-font-size)');
  expect(tabStyles).toMatch(
    /\.tab\s*\{[^}]*align-items:\s*center;[^}]*display:\s*inline-flex;/s,
  );
  expect(tabStyles).toContain('block-size: var(--tabs-row-height)');
  expect(tabStyles).toContain('max-width: 190px');
  expect(tabStyles).toContain('block-size: var(--tab-add-size)');
  expect(tabStyles).toContain('inline-size: var(--tab-add-size)');
  expect(tabStyles).toMatch(/overflow-x:\s*auto/);
  expect(tabStyles).toContain(":global(:root[data-theme='material'])");
  expect(tabStyles).toContain(":global(:root[data-theme='minimal'])");
  expect(tabStyles).toContain('border-bottom: 2px solid transparent');
});

it('T045 bounds the parity tab menu to the reviewed reference anchor', () => {
  const tabStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/DocumentTabs.module.css'),
    'utf8',
  );

  const parityRule = tabStyles.match(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\) \.contextMenu\s*\{([^}]*)\}/s,
  )?.[1];
  expect(parityRule).toBeDefined();
  expect(parityRule).toMatch(/left:\s*210px/);
  expect(parityRule).toMatch(/top:\s*106px/);
  expect(parityRule).toMatch(/inline-size:\s*190px/);
  expect(parityRule).toMatch(/padding:\s*5px/);
  expect(parityRule).toMatch(/backdrop-filter:\s*var\(--blur\)/);
  expect(parityRule).toMatch(/border-radius:\s*11px/);
  expect(parityRule).toMatch(/gap:\s*normal/);
});

it('T045 uses the binding context-menu shadow token', () => {
  const tabStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/DocumentTabs.module.css'),
    'utf8',
  );
  const tokens = readFileSync(
    resolve(process.cwd(), 'src/ui/styles/tokens.css'),
    'utf8',
  );

  expect(tabStyles).toContain('box-shadow: var(--context-menu-shadow)');
  expect(tokens).toContain('--context-menu-shadow:');
  expect(tokens).toMatch(
    /:root\[data-theme='material'\][\s\S]*?--context-menu-shadow:\s*0 1px 2px rgba\(30, 30, 60, 0\.1\),\s*0 1px 3px rgba\(30, 30, 60, 0\.08\);/s,
  );
});

it('T045 moves the narrow parity tab menu into the reviewed viewport position', () => {
  const tabStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/DocumentTabs.module.css'),
    'utf8',
  );

  expect(tabStyles).toMatch(
    /@media \(max-width: 376px\)[\s\S]*?\.contextMenu\s*\{[^}]*left:\s*172px;[^}]*top:\s*-116px;/s,
  );
});

it('T045 restores the parity new-tab control surface', () => {
  const tabStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/DocumentTabs.module.css'),
    'utf8',
  );

  expect(tabStyles).toMatch(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\) \.tabAdd\s*\{[^}]*background:\s*var\(--surface\);[^}]*border:\s*1px solid var\(--border\);/s,
  );
});

it('T062 renders tab glyphs with the binding-compatible text and CSS primitives', () => {
  hydrate([documentFor('one', '/repo/one.md', true)]);
  renderTabs();

  const tab = screen.getByRole('tab', { name: /one\.md/u });
  expect(tab.querySelector('[aria-label="Modified"] svg')).toBeNull();
  expect(screen.getByRole('button', { name: 'New tab' })).toHaveTextContent(
    '+',
  );
});

it('T062 makes the tablist the direct tab-and-add layout surface', () => {
  hydrate([documentFor('one', '/repo/one.md', true)]);
  renderTabs();

  const tablist = screen.getByRole('tablist');
  expect(tablist).toContainElement(
    screen.getByRole('tab', { name: /one\.md/u }),
  );
  expect(tablist).toContainElement(
    screen.getByRole('button', { name: 'New tab' }),
  );
  expect(tablist.children).toHaveLength(2);
});

it('T062 keeps the minimal new-tab control as a block text control', () => {
  const tabStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/DocumentTabs.module.css'),
    'utf8',
  );

  expect(tabStyles).toMatch(
    /\.tabAdd\s*\{[^}]*display:\s*block;[^}]*text-align:\s*center;/s,
  );
  expect(tabStyles).toMatch(/\.tabAdd\s*\{[^}]*font-family:\s*Arial;/s);
  expect(tabStyles).toMatch(/\.tabAdd\s*\{[^}]*white-space:\s*normal;/s);
  expect(tabStyles).not.toMatch(/\.tabAdd\s*\{[^}]*min-inline-size:/s);
});

it('T045 raises the parity tab strip above the compressed shell menu hit area', () => {
  const tabStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/DocumentTabs.module.css'),
    'utf8',
  );

  expect(tabStyles).toMatch(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\) \.tabStrip\s*\{[^}]*z-index:\s*calc\(var\(--z-sticky\) \+ 1\);/s,
  );
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

it('mutes the dirty dot only while the backend reports a write in flight', () => {
  const document = {
    ...documentFor('one', '/private/work/readme.md', true),
    writeInFlight: true,
  };
  hydrate([document]);
  renderTabs();

  expect(screen.getByLabelText('Modified')).toHaveAttribute(
    'data-write-in-flight',
    'true',
  );
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

it('renders bounded conflict content even when both retained texts compare equal', async () => {
  const first = documentFor('one', '/repo/one.md');
  const second = documentFor('two', '/repo/two.md');
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
    onDisk: {
      byteCount: 5_500,
      lineCount: 13,
      text: 'same retained text',
      truncated: true,
    },
    path: '/repo/two.md',
    readOnly: false,
    yours: {
      byteCount: 5_500,
      lineCount: 13,
      text: 'same retained text',
      truncated: true,
    },
  };
  hydrate([first, second]);
  renderTabs({
    activateDocument: jest.fn(async () => ({
      conflict: preview,
      data: { content: 'mine\n', documentId: 'two', documentRevision: 0 },
    })),
  });

  fireEvent.click(screen.getByRole('tab', { name: /two\.md/iu }));
  await waitFor(() =>
    expect(
      screen.getByRole('dialog', { name: 'File changed on disk' }),
    ).toBeVisible(),
  );
  expect(
    document.querySelector('[data-conflict-truncated="onDisk"]'),
  ).toBeInTheDocument();
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
