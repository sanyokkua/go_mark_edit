import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider } from 'react-redux';

import type {
  ConflictPreview,
  DocumentMetadata,
  DocumentTransitionResult,
  PathCommandResult,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import { store } from '../../logic/store';
import {
  applyStatePatch,
  hydrateProjection,
  resetProjection,
} from '../../logic/store/appModelProjectionActions';
import { resetNotifications } from '../../logic/store/notificationsSlice';
import { getActionAvailability } from '../../logic/actions/actionRegistry';
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
  /*
   * The binding's `.tab` bounds (`mockup.html:272`) are tokens like every other
   * binding metric, so the label cap and the tab box are asserted through the
   * token rather than as a literal repeated in the stylesheet. `tokens.css`
   * owns the value.
   */
  expect(tabStyles).toContain('max-width: var(--tab-max-width)');
  expect(tabStyles).toContain('border-radius: var(--tab-radius)');
  expect(tabStyles).toContain('gap: var(--tab-gap)');
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

/*
 * T084 gap 1 — the roving tabindex at DocumentTabs.tsx:505 (`tabIndex={active ? 0 : -1}`)
 * had no assertion anywhere in the suite. One tab stop for the whole strip is what
 * keeps Tab from walking every open document, so it is asserted as a property of the
 * strip (exactly one `0`) rather than as a property of the selected tab alone.
 */
it('T084 keeps exactly one tab in the roving tabindex and moves it with the selection', () => {
  hydrate(
    [
      documentFor('one', '/repo/one.md'),
      documentFor('two', '/repo/two.md'),
      documentFor('three', '/repo/three.md'),
    ],
    'two',
  );
  renderTabs();

  const tabIndexes = (): (string | null)[] =>
    screen.getAllByRole('tab').map((tab) => tab.getAttribute('tabindex'));

  expect(tabIndexes()).toEqual(['-1', '0', '-1']);
  expect(tabIndexes().filter((value) => value === '0')).toHaveLength(1);
  expect(screen.getByRole('tab', { name: /two\.md/u })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  act((): void => {
    store.dispatch(applyStatePatch({ revision: 2, activeDocumentId: 'three' }));
  });

  expect(tabIndexes()).toEqual(['-1', '-1', '0']);
  expect(screen.getByRole('tab', { name: /three\.md/u })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

/*
 * T084 gap 2 — Home and End are handled on the tablist (DocumentTabs.tsx:465) and move
 * DOM focus only; they deliberately do not activate, so no backend command is issued.
 */
it('T084 moves tab-strip focus to the first and last tab with Home and End', () => {
  hydrate(
    [
      documentFor('one', '/repo/one.md'),
      documentFor('two', '/repo/two.md'),
      documentFor('three', '/repo/three.md'),
    ],
    'two',
  );
  const activateDocument = jest.fn(async () => ({}));
  renderTabs({ activateDocument });

  const tablist = screen.getByRole('tablist');
  fireEvent.keyDown(tablist, { key: 'End' });
  expect(screen.getByRole('tab', { name: /three\.md/u })).toHaveFocus();

  fireEvent.keyDown(tablist, { key: 'Home' });
  expect(screen.getByRole('tab', { name: /one\.md/u })).toHaveFocus();

  expect(activateDocument).not.toHaveBeenCalled();
});

/*
 * T084 gap 2 — ArrowLeft/ArrowRight on the tablist (DocumentTabs.tsx:474) activate the
 * adjacent document and clamp at both edges: unlike the next-tab/previous-tab shortcuts
 * below, arrow navigation does not wrap.
 */
it('T084 activates the adjacent tab with ArrowRight and ArrowLeft and clamps at both edges', async () => {
  hydrate(
    [
      documentFor('one', '/repo/one.md'),
      documentFor('two', '/repo/two.md'),
      documentFor('three', '/repo/three.md'),
    ],
    'one',
  );
  const activateDocument = jest.fn(async () => ({}));
  renderTabs({ activateDocument });

  const tablist = screen.getByRole('tablist');
  fireEvent.keyDown(tablist, { key: 'ArrowRight' });
  await waitFor(() => expect(activateDocument).toHaveBeenCalledWith('two', 4));
  /*
   * Focus moves with the arrow, not just selection — the WAI-ARIA tabs
   * pattern. Activating alone left the caret on a tab the roving tabIndex had
   * just set to -1, so the next Tab press escaped from an invisible place.
   */
  expect(screen.getByRole('tab', { name: /two\.md/u })).toHaveFocus();

  fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
  await waitFor(() =>
    expect(activateDocument).toHaveBeenNthCalledWith(2, 'one', 4),
  );
  expect(screen.getByRole('tab', { name: /one\.md/u })).toHaveFocus();

  // At the first tab ArrowLeft clamps onto the same document rather than
  // wrapping round to the last one.
  fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
  await waitFor(() =>
    expect(activateDocument).toHaveBeenNthCalledWith(3, 'one', 4),
  );

  act((): void => {
    store.dispatch(applyStatePatch({ revision: 2, activeDocumentId: 'three' }));
  });
  fireEvent.keyDown(tablist, { key: 'ArrowRight' });
  await waitFor(() =>
    expect(activateDocument).toHaveBeenNthCalledWith(4, 'three', 4),
  );
});

/*
 * T084 gap 2 — only next-tab was ever pressed anywhere in the suite. Both bindings are
 * exercised here through their canonical aliases (shortcutRegistry.test.ts:19-22:
 * `Ctrl+PageDown` for next-tab, `Ctrl+PageUp` for previous-tab), including the wrap
 * that distinguishes them from arrow navigation.
 */
it('T018 cycles the active tab with the next-tab and previous-tab shortcuts', async () => {
  hydrate(
    [
      documentFor('one', '/repo/one.md'),
      documentFor('two', '/repo/two.md'),
      documentFor('three', '/repo/three.md'),
    ],
    'one',
  );
  const activateDocument = jest.fn(async () => ({}));
  renderTabs({ activateDocument });

  fireEvent.keyDown(document, { key: 'PageDown', ctrlKey: true });
  await waitFor(() => expect(activateDocument).toHaveBeenCalledWith('two', 4));

  // previous-tab from the first tab wraps to the last.
  fireEvent.keyDown(document, { key: 'PageUp', ctrlKey: true });
  await waitFor(() =>
    expect(activateDocument).toHaveBeenNthCalledWith(2, 'three', 4),
  );
});

/*
 * T084 gap 3 — FR-FT-037: Copy path copies the exact canonical absolute path and
 * announces `Copied path for {safe filename}` in a transient polite live region naming
 * only the safe label. The menu closes and focus returns to the originating tab.
 */
it('FR-FT-037 copies the canonical path through the tab menu and announces the safe filename', async () => {
  hydrate([
    documentFor('one', '/repo/one.md'),
    documentFor('two', '/repo/two.md'),
  ]);
  store.dispatch(resetNotifications());
  const copyPath = jest.fn(async (): Promise<PathCommandResult> => ({
    status: 'copied',
  }));
  renderTabs({ copyPath });

  fireEvent.contextMenu(screen.getByRole('tab', { name: /two\.md/u }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }));

  await waitFor(() => expect(copyPath).toHaveBeenCalledWith('two'));
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Copied path for two.md',
    ),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('menu', { name: 'Tab actions' }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('tab', { name: /two\.md/u })).toHaveFocus();
  expect(store.getState().notifications.items).toHaveLength(0);
});

/*
 * T084 gap 3 — FR-FT-037: a clipboard write failure reports one deduplicated
 * `system-command-failure` naming only the safe basename and offering Retry.
 */
it('FR-FT-037 reports a Copy path clipboard failure as system-command-failure with Retry', async () => {
  hydrate([documentFor('one', '/repo/one.md')]);
  store.dispatch(resetNotifications());
  const copyPath = jest.fn(async (): Promise<PathCommandResult> => ({
    status: 'refused',
    error: {
      category: 'system-command-failure',
      safeSubject: 'one.md',
      message: 'The path could not be copied.',
      remediation: 'Retry',
      documentId: 'one',
      dedupKey: 'copy-path:one',
    },
  }));
  renderTabs({ copyPath });

  fireEvent.contextMenu(screen.getByRole('tab', { name: /one\.md/u }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }));

  await waitFor(() =>
    expect(store.getState().notifications.items).toHaveLength(1),
  );
  expect(store.getState().notifications.items[0]).toEqual(
    expect.objectContaining({
      code: 'system-command-failure',
      remediation: { action: 'retry', labelKey: 'action.retry.label' },
      severity: 'error',
      subject: 'copy-path:one',
      title: 'one.md',
    }),
  );
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

/*
 * T084 gap 4 — FR-FT-037: OS acceptance of a Reveal is success and MUST produce no
 * toast, and Reveal is not announced in the live region either.
 */
it('FR-FT-037 invokes Reveal in file manager and reports nothing on OS acceptance', async () => {
  hydrate([documentFor('one', '/repo/one.md')]);
  store.dispatch(resetNotifications());
  const revealInFileManager = jest.fn(async (): Promise<PathCommandResult> => ({
    status: 'revealed',
  }));
  renderTabs({ revealInFileManager });

  fireEvent.contextMenu(screen.getByRole('tab', { name: /one\.md/u }));
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Reveal in file manager' }),
  );

  await waitFor(() => expect(revealInFileManager).toHaveBeenCalledWith('one'));
  await waitFor(() =>
    expect(
      screen.queryByRole('menu', { name: 'Tab actions' }),
    ).not.toBeInTheDocument(),
  );
  expect(store.getState().notifications.items).toHaveLength(0);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

/*
 * T084 gap 4 — FR-FT-037: an OS command failure for Reveal reports one deduplicated
 * `system-command-failure` that additionally offers Copy path.
 */
it('FR-FT-037 offers Copy path remediation when Reveal fails', async () => {
  hydrate([documentFor('one', '/repo/one.md')]);
  store.dispatch(resetNotifications());
  const revealInFileManager = jest.fn(async (): Promise<PathCommandResult> => ({
    status: 'refused',
    error: {
      category: 'system-command-failure',
      safeSubject: 'one.md',
      message: 'The file manager could not reveal the document.',
      remediation: 'Copy path',
      documentId: 'one',
      dedupKey: 'reveal:one',
    },
  }));
  renderTabs({ revealInFileManager });

  fireEvent.contextMenu(screen.getByRole('tab', { name: /one\.md/u }));
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Reveal in file manager' }),
  );

  await waitFor(() =>
    expect(store.getState().notifications.items).toHaveLength(1),
  );
  expect(store.getState().notifications.items[0]).toEqual(
    expect.objectContaining({
      code: 'system-command-failure',
      remediation: { action: 'copy-path', labelKey: 'action.copy-path.label' },
      severity: 'error',
      subject: 'reveal:one',
      title: 'one.md',
    }),
  );
});

/*
 * T084 gap 6 — the only thing a detached document changes on the tab surface is the
 * availability of Reveal. FR-FT-037: a document already known missing shows Reveal as
 * unavailable rather than invoking it, while Copy path stays available because the
 * canonical path is still defined. Availability is read from the registry, which is the
 * authority; the rendered menu is asserted to agree with it.
 */
it('FR-FT-037 marks Reveal unavailable for a detached document while Copy path stays available', () => {
  const detached = {
    ...documentFor('one', '/repo/one.md'),
    detached: true,
  };
  hydrate([detached, documentFor('two', '/repo/two.md')]);
  const revealInFileManager = jest.fn(async (): Promise<PathCommandResult> => ({
    status: 'revealed',
  }));
  renderTabs({ revealInFileManager });

  const projection = {
    activeDocumentId: 'one',
    documents: { one: { detached: true, path: '/repo/one.md' } },
    orderedDocumentIds: ['one', 'two'],
  };
  expect(
    getActionAvailability('reveal-in-file-manager', {
      documentId: 'one',
      projectedState: projection,
    }).kind,
  ).toBe('unavailable');
  expect(
    getActionAvailability('copy-path', {
      documentId: 'one',
      projectedState: projection,
    }).kind,
  ).toBe('available');

  fireEvent.contextMenu(screen.getByRole('tab', { name: /one\.md/u }));
  expect(
    screen.getByRole('menuitem', { name: 'Reveal in file manager' }),
  ).toBeDisabled();
  expect(screen.getByRole('menuitem', { name: 'Copy path' })).toBeEnabled();

  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Reveal in file manager' }),
  );
  expect(revealInFileManager).not.toHaveBeenCalled();
});

/*
 * T084 gap 7 — the tab half of the committed Save As outcome. The adopted path arrives
 * as a `state:patch` from Go (the store is a projection, never written to directly), so
 * the tab must relabel from the patch alone.
 */
it('T084 relabels the tab from the adopted path after a committed Save As', () => {
  hydrate([documentFor('one', '/repo/draft.md')]);
  renderTabs();

  expect(screen.getByRole('tab', { name: /draft\.md/u })).toHaveAttribute(
    'title',
    '/repo/draft.md',
  );

  act((): void => {
    store.dispatch(
      applyStatePatch({
        revision: 2,
        documents: {
          upsert: {
            one: {
              ...documentFor('one', '/repo/release-notes.md'),
              status: 'saved',
            },
          },
        },
      }),
    );
  });

  expect(
    screen.getByRole('tab', { name: /release-notes\.md/u }),
  ).toHaveAttribute('title', '/repo/release-notes.md');
  expect(screen.queryByRole('tab', { name: /draft\.md/u })).toBeNull();
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

/*
 * FR-FT-004 + the classified-error table: `capacity-limit` is remediated
 * "message-only, naming the limit". The backend already names it
 * (`internal/appmodel/file_lifecycle.go:184` — "The window already contains 40
 * documents."); this asserts the new-tab control carries that message to the
 * user instead of discarding the result, which is what it did until now.
 */
it('FR-FT-004 surfaces the 40-document refusal raised by the new-tab control', async () => {
  hydrate([documentFor('one', '/repo/one.md')]);
  store.dispatch(resetNotifications());
  const newDocument = jest.fn(async (): Promise<DocumentTransitionResult> => ({
    error: {
      category: 'capacity-limit',
      safeSubject: 'Untitled',
      message: 'The window already contains 40 documents.',
      remediation: 'Cancel',
      dedupKey: 'capacity-limit:new',
    },
  }));
  renderTabs({ newDocument });

  fireEvent.click(screen.getByRole('button', { name: 'New tab' }));

  await waitFor(() =>
    expect(store.getState().notifications.items).toHaveLength(1),
  );
  expect(store.getState().notifications.items[0]).toEqual(
    expect.objectContaining({
      code: 'capacity-limit',
      message: 'The window already contains 40 documents.',
      severity: 'error',
      subject: 'capacity-limit:new',
    }),
  );
});
