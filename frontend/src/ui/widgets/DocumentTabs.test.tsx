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
  ClassifiedError,
  ConflictPreview,
  DocumentMetadata,
  DocumentTransitionResult,
  PathCommandResult,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import { store, useAppSelector } from '../../logic/store';
import {
  applyStatePatch,
  hydrateProjection,
  resetProjection,
} from '../../logic/store/appModelProjectionActions';
import { resetNotifications } from '../../logic/store/notificationsSlice';
import { getActionAvailability } from '../../logic/actions/actionRegistry';
import DocumentTabs from './DocumentTabs';
import { EDITOR_TABPANEL_ID } from './editorTabPanel';
import Launcher from './Launcher';

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

/*
 * A conflict adapter that answers "nothing changed" to everything. T133 made
 * `DocumentTabs` run FR-FT-020's foreground check on every window `focus`, so a
 * test that dispatches one — the two T142 cases below do, to prove FR-FT-037's
 * deferred focus restoration — otherwise falls through to the production
 * adapter and calls a Wails bridge that cannot exist under jsdom. Passing this
 * states the dependency instead of relying on the sweep's error handling to
 * hide it.
 */
function quietConflictAdapter(): NonNullable<
  Parameters<typeof DocumentTabs>[0]['conflictAdapter']
> {
  return {
    authorizeKeepMine: jest.fn(async () => ({ status: 'authorized' as const })),
    cancelConflict: jest.fn(async () => ({ status: 'cancelled' as const })),
    checkExternalChanges: jest.fn(async () => ({
      status: 'unchanged' as const,
    })),
    reloadFromDisk: jest.fn(async () => ({ status: 'reloaded' as const })),
    skipConflict: jest.fn(async () => ({ status: 'skipped' as const })),
  };
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

// Proves: FR-FT-037 (partial — the exact seven-item order; focus restoration after a successful Reveal is unproven; T157)
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
      remediations: ['Retry'],
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
      remediations: [
        {
          action: 'retry',
          documentId: 'one',
          intent: 'copy-path',
          labelKey: 'action.retry.label',
        },
      ],
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
 *
 * T142 corrected the fixture as well as the mapping: Go has sent the full pair
 * `['Retry', 'Copy path']` since T125 (`internal/appmodel/copy_path.go`,
 * `revealCommandFailure`), and a double narrower than the real backend cannot
 * see a mapping that drops a member.
 */
// Proves: FR-FT-037 (the Reveal `system-command-failure` pair, as the tab
// surface reports it).
it('FR-FT-037 offers both Retry and Copy path remediations when Reveal fails', async () => {
  hydrate([documentFor('one', '/repo/one.md')]);
  store.dispatch(resetNotifications());
  const revealInFileManager = jest.fn(async (): Promise<PathCommandResult> => ({
    status: 'refused',
    error: {
      category: 'system-command-failure',
      safeSubject: 'one.md',
      message: 'The file manager could not reveal the document.',
      remediations: ['Retry', 'Copy path'],
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
      remediations: [
        {
          action: 'retry',
          documentId: 'one',
          intent: 'reveal',
          labelKey: 'action.retry.label',
        },
        {
          action: 'copy-path',
          documentId: 'one',
          intent: 'copy-path',
          labelKey: 'action.copy-path.label',
        },
      ],
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
      remediations: ['Cancel'],
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

/*
 * T142 gap (a). FR-FT-037 closes with a clause nothing implemented: "After a
 * successful Reveal, focus restoration MUST occur only once the application
 * regains foreground focus, since the file manager may briefly own it." The
 * menu's dispatch ended in `.finally(onClose)` and `onClose` focused the
 * originating tab synchronously, so the application pulled focus back while the
 * file manager was still coming forward. There was no `focus` listener anywhere
 * in `frontend/src` to wait on.
 */
// Proves: FR-FT-037 (the deferred-focus-restoration clause only; the menu's
// contents, order and edge unavailability are proven elsewhere in this file).
it('T142 waits for the application to regain foreground focus before restoring the tab', async () => {
  hydrate([documentFor('one', '/repo/one.md')]);
  store.dispatch(resetNotifications());
  const revealInFileManager = jest.fn(async (): Promise<PathCommandResult> => ({
    status: 'revealed',
  }));
  renderTabs({ revealInFileManager }, quietConflictAdapter());

  const tab = screen.getByRole('tab', { name: /one\.md/u });
  fireEvent.contextMenu(tab);
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Reveal in file manager' }),
  );

  await waitFor(() =>
    expect(
      screen.queryByRole('menu', { name: 'Tab actions' }),
    ).not.toBeInTheDocument(),
  );
  // The file manager may own the foreground here. Grabbing focus back now is
  // exactly what the clause forbids.
  expect(tab).not.toHaveFocus();

  act((): void => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(tab).toHaveFocus();
});

/*
 * The other half of the same clause: the wait is owed to a *successful* Reveal.
 * A refusal never handed the foreground to anyone, so deferring it would leave
 * focus on nothing until the user alt-tabbed away and back.
 */
// Proves: FR-FT-037 (the deferred-focus-restoration clause only).
it('T142 restores focus immediately when Reveal is refused, because nothing took the foreground', async () => {
  hydrate([documentFor('one', '/repo/one.md')]);
  store.dispatch(resetNotifications());
  const revealInFileManager = jest.fn(async (): Promise<PathCommandResult> => ({
    status: 'refused',
    error: {
      category: 'system-command-failure',
      safeSubject: 'one.md',
      message: 'The file manager could not reveal the document.',
      remediations: ['Retry', 'Copy path'],
      documentId: 'one',
      dedupKey: 'reveal:one',
    },
  }));
  renderTabs({ revealInFileManager }, quietConflictAdapter());

  const tab = screen.getByRole('tab', { name: /one\.md/u });
  fireEvent.contextMenu(tab);
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Reveal in file manager' }),
  );

  await waitFor(() => expect(tab).toHaveFocus());
});

/*
 * `fireEvent` in this version has no `auxClick` shorthand, so the auxiliary
 * click is constructed by hand. `button: 1` is the middle button; React's
 * `onAuxClick` is the delegated `auxclick` listener, which is the event a
 * browser raises for any non-primary button.
 */
function auxClick(element: HTMLElement, button: number): void {
  fireEvent(
    element,
    new MouseEvent('auxclick', { bubbles: true, button, cancelable: true }),
  );
}

function middleClick(element: HTMLElement): void {
  auxClick(element, 1);
}

/*
 * T141. FR-FT-034 names three affordances that close the *targeted* tab — the
 * close control, middle-click, and the tab-specific Close action — and only
 * two existed. The rule this proves is the middle-click clause; the routing
 * assertion is what keeps it honest, because a middle-click that called the
 * adapter directly would satisfy "closes the tab" while stepping around the
 * dirty-close prompt the shell installs on `onCloseDocument`.
 */
// Proves: FR-FT-034 (partial — the middle-click clause only)
it('T141 closes the targeted tab on middle-click, through the shell close path', async () => {
  const first = documentFor('one', '/repo/one.md');
  const second = documentFor('two', '/repo/two.md');
  hydrate([first, second], 'two');
  const onCloseDocument = jest.fn(async (): Promise<TabTransitionResult> => ({
    status: 'closed',
    activeDocumentId: 'two',
    orderedDocumentIds: ['two'],
  }));
  const adapterClose = jest.fn(async (): Promise<TabTransitionResult> => ({
    status: 'closed',
    activeDocumentId: 'two',
    orderedDocumentIds: ['two'],
  }));
  render(
    <Provider store={store}>
      <DocumentTabs
        adapter={{ closeDocument: adapterClose }}
        onCloseDocument={onCloseDocument}
      />
    </Provider>,
  );

  middleClick(screen.getByRole('tab', { name: /one\.md/ }));

  await waitFor(() =>
    expect(onCloseDocument).toHaveBeenCalledWith('one', 4, 'single', ['one']),
  );
  // The shell funnel owns the prompt, so the adapter must not be reached
  // behind its back.
  expect(adapterClose).not.toHaveBeenCalled();
});

// Proves: FR-FT-034 (partial — the middle-click clause only; that no other
// auxiliary button closes a tab)
it('T141 leaves the tab open for a right-button auxiliary click', () => {
  const first = documentFor('one', '/repo/one.md');
  hydrate([first]);
  const onCloseDocument = jest.fn(async (): Promise<TabTransitionResult> => ({
    status: 'closed',
    activeDocumentId: undefined,
    orderedDocumentIds: [],
  }));
  render(
    <Provider store={store}>
      <DocumentTabs adapter={{}} onCloseDocument={onCloseDocument} />
    </Provider>,
  );

  auxClick(screen.getByRole('tab', { name: /one\.md/ }), 2);

  expect(onCloseDocument).not.toHaveBeenCalled();
});

/*
 * T145. `role="tab"` requires an owning `tablist`, and a plain `<div>` between
 * them breaks the ownership: the role the markup declares is not the role the
 * accessibility tree reports. jsdom does not compute that tree, so ownership is
 * asserted structurally — every element between a tab and its tablist must be
 * transparent to the tree, which means `presentation` or its synonym `none`.
 */
function ownedByTablist(tab: HTMLElement, tablist: HTMLElement): boolean {
  let node: HTMLElement | null = tab.parentElement;
  while (node !== null && node !== tablist) {
    const role = node.getAttribute('role');
    if (role !== 'presentation' && role !== 'none') return false;
    node = node.parentElement;
  }
  return node === tablist;
}

// Proves: FR-FT-047 (partial — the tab strip's role ownership and tab/panel
// association only)
it('T145 owns every tab from the tablist and points it at the editor panel', () => {
  hydrate(
    [
      documentFor('one', '/repo/one.md'),
      documentFor('two', '/repo/two.md'),
      documentFor('three', '/repo/three.md'),
    ],
    'two',
  );
  renderTabs();

  const tablist = screen.getByRole('tablist');
  const tabs = screen.getAllByRole('tab');
  expect(tabs).toHaveLength(3);
  expect(
    tabs.map((tab) => ({
      id: tab.getAttribute('id'),
      owned: ownedByTablist(tab, tablist),
      controls: tab.getAttribute('aria-controls'),
    })),
  ).toEqual([
    { id: 'tab-one', owned: true, controls: EDITOR_TABPANEL_ID },
    { id: 'tab-two', owned: true, controls: EDITOR_TABPANEL_ID },
    { id: 'tab-three', owned: true, controls: EDITOR_TABPANEL_ID },
  ]);
});

/*
 * The wrapper that gained `role="presentation"` is the same element the roving
 * tabIndex and the Home/End/Arrow handler traverse. T084 already covers that
 * behaviour on its own terms; this case re-anchors it to T145 so the ownership
 * change cannot be made at its expense without a named failure.
 */
// Proves: FR-FT-047 (partial — that the ownership repair leaves the roving
// tabIndex and Home/End/Arrow keyboard model intact)
it('T145 keeps the roving tabIndex and Home/End/Arrow model after the ownership repair', () => {
  hydrate(
    [
      documentFor('one', '/repo/one.md'),
      documentFor('two', '/repo/two.md'),
      documentFor('three', '/repo/three.md'),
    ],
    'two',
  );
  renderTabs();

  const tablist = screen.getByRole('tablist');
  const tabIndexes = (): (string | null)[] =>
    screen.getAllByRole('tab').map((tab) => tab.getAttribute('tabindex'));

  expect(tabIndexes()).toEqual(['-1', '0', '-1']);

  fireEvent.keyDown(tablist, { key: 'Home' });
  expect(screen.getByRole('tab', { name: /one\.md/ })).toHaveFocus();

  fireEvent.keyDown(tablist, { key: 'End' });
  expect(screen.getByRole('tab', { name: /three\.md/ })).toHaveFocus();

  fireEvent.keyDown(tablist, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: /three\.md/ })).toHaveFocus();

  fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
  expect(screen.getByRole('tab', { name: /one\.md/ })).toHaveFocus();
});

/*
 * T153. FR-FT-037's focus chain has four steps and the fourth had no code:
 * "…otherwise the tab strip's New control, otherwise the launcher's New
 * control". The fourth is reachable only once the strip itself is gone, which
 * is what `AppShell` does when the last document closes — it unmounts
 * `EditorView`, and `DocumentTabs` with it, and renders `Launcher` instead. The
 * harness reproduces exactly that swap so the step under test is the real one.
 */
function ShellSwap({
  adapter,
}: {
  adapter: Parameters<typeof DocumentTabs>[0]['adapter'];
}): React.JSX.Element {
  const open = useAppSelector((state) => state.documents.orderedIds.length);
  return open > 0 ? (
    <DocumentTabs adapter={adapter} />
  ) : (
    <Launcher onNewDocument={jest.fn()} />
  );
}

// Proves: FR-FT-037 (partial — the fourth step of the Reveal focus chain only)
it('T153 falls back to the launcher New control once the strip is gone', async () => {
  hydrate([documentFor('only', '/repo/only.md')]);
  const closeDocument = jest.fn(async (): Promise<TabTransitionResult> => {
    store.dispatch(
      applyStatePatch({
        revision: 2,
        tabSetRevision: 5,
        documents: {},
        orderedDocumentIds: [],
        activeDocumentId: null,
      }),
    );
    return {
      status: 'closed',
      activeDocumentId: undefined,
      orderedDocumentIds: [],
    };
  });
  render(
    <Provider store={store}>
      <ShellSwap adapter={{ closeDocument }} />
    </Provider>,
  );

  fireEvent.contextMenu(screen.getByRole('tab', { name: /only\.md/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Close Tab' }));

  await waitFor(() => expect(screen.queryByRole('tab')).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'New File' })).toHaveFocus(),
  );
});

/*
 * T129. FR-FT-034 binds Move tab left/right to `Ctrl/Cmd+Shift+PageUp` and
 * `Ctrl/Cmd+Shift+PageDown`. `shortcutForKeyEvent` already resolved both — the
 * ids were simply in nobody's dispatch list, so pressing either did nothing at
 * all. These press the real keys rather than calling the handler, because the
 * whole defect was the gap between a resolvable binding and a listener that
 * would act on it.
 */
// Proves: FR-FT-034 (partial — the Move tab accelerators, backend-confirmed
// projection and announcement; the edge no-op is proved separately below)
it('T129 reorders the active tab with the Move tab accelerators and announces the move', async () => {
  hydrate(
    [
      documentFor('one', '/repo/one.md'),
      documentFor('two', '/repo/two.md'),
      documentFor('three', '/repo/three.md'),
    ],
    'two',
  );
  store.dispatch(resetNotifications());
  const reorderDocument = jest.fn(async (): Promise<TabTransitionResult> => ({
    status: 'reordered',
    orderedDocumentIds: ['one', 'three', 'two'],
  }));
  renderTabs({ reorderDocument });

  fireEvent.keyDown(document, {
    key: 'PageDown',
    ctrlKey: true,
    shiftKey: true,
  });
  await waitFor(() =>
    expect(reorderDocument).toHaveBeenCalledWith('two', 2, 4),
  );
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Moved two.md to position 3 of 3',
    ),
  );

  fireEvent.keyDown(document, { key: 'PageUp', ctrlKey: true, shiftKey: true });
  await waitFor(() =>
    expect(reorderDocument).toHaveBeenNthCalledWith(2, 'two', 0, 4),
  );
});

/*
 * The genuinely new rule. FR-FT-034: "Moving past an edge MUST succeed as a
 * no-op without incrementing the tab-set revision." Succeeding is what
 * separates it from a refusal — no error is reported — and *not incrementing*
 * is what separates it from a reorder that happens to land where it started.
 * The strongest way to prove no increment is that no command is issued at all.
 */
// Proves: FR-FT-034 (partial — the edge no-op clause only)
it('T129 treats a Move past either edge as a successful no-op that does not bump the tab-set revision', async () => {
  hydrate(
    [documentFor('one', '/repo/one.md'), documentFor('two', '/repo/two.md')],
    'one',
  );
  store.dispatch(resetNotifications());
  const reorderDocument = jest.fn(async (): Promise<TabTransitionResult> => ({
    status: 'reordered',
    orderedDocumentIds: ['two', 'one'],
    tabSetRevision: 5,
  }));
  renderTabs({ reorderDocument });

  const revisionBefore = store.getState().documents.tabSetRevision;
  fireEvent.keyDown(document, { key: 'PageUp', ctrlKey: true, shiftKey: true });
  await Promise.resolve();

  expect(reorderDocument).not.toHaveBeenCalled();
  expect(store.getState().documents.tabSetRevision).toBe(revisionBefore);
  expect(store.getState().documents.orderedIds).toEqual(['one', 'two']);
  expect(store.getState().notifications.items).toHaveLength(0);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

// Proves: FR-FT-034 (partial — the edge no-op clause at the right-hand edge)
it('T129 treats a Move past the right-hand edge as the same successful no-op', async () => {
  hydrate(
    [documentFor('one', '/repo/one.md'), documentFor('two', '/repo/two.md')],
    'two',
  );
  store.dispatch(resetNotifications());
  const reorderDocument = jest.fn(async (): Promise<TabTransitionResult> => ({
    status: 'reordered',
    orderedDocumentIds: ['two', 'one'],
    tabSetRevision: 5,
  }));
  renderTabs({ reorderDocument });

  const revisionBefore = store.getState().documents.tabSetRevision;
  fireEvent.keyDown(document, {
    key: 'PageDown',
    ctrlKey: true,
    shiftKey: true,
  });
  await Promise.resolve();

  expect(reorderDocument).not.toHaveBeenCalled();
  expect(store.getState().documents.tabSetRevision).toBe(revisionBefore);
  expect(store.getState().documents.orderedIds).toEqual(['one', 'two']);
  expect(store.getState().notifications.items).toHaveLength(0);
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

// Proves: FR-FT-034 (partial — that a keyboard Move retains the active
// document and the current focus)
it('T129 keeps the active document and the focused element across a keyboard Move', async () => {
  hydrate(
    [
      documentFor('one', '/repo/one.md'),
      documentFor('two', '/repo/two.md'),
      documentFor('three', '/repo/three.md'),
    ],
    'two',
  );
  const reorderDocument = jest.fn(async (): Promise<TabTransitionResult> => ({
    status: 'reordered',
    orderedDocumentIds: ['two', 'one', 'three'],
    tabSetRevision: 5,
  }));
  const activateDocument = jest.fn(async () => ({}));
  renderTabs({ activateDocument, reorderDocument });

  const activeTab = screen.getByRole('tab', { name: /two\.md/u });
  activeTab.focus();

  fireEvent.keyDown(document, { key: 'PageUp', ctrlKey: true, shiftKey: true });
  await waitFor(() =>
    expect(reorderDocument).toHaveBeenCalledWith('two', 0, 4),
  );

  expect(activateDocument).not.toHaveBeenCalled();
  expect(store.getState().documents.activeDocumentId).toBe('two');
  expect(screen.getByRole('tab', { name: /two\.md/u })).toHaveFocus();
});

/*
 * T156. Go refuses a switch against a stale tab set with `conflict` and sends
 * `Retry` — "The tab set changed; the switch must be retried." This arm
 * declared no intent, so `remediationsFor` dropped the control Go had sent.
 * `retry.documentId` is named explicitly rather than taken from the error,
 * because a stale-tab-set refusal is about the *set* and carries no document;
 * without it the control would be dropped for want of a target the strip has.
 * The command itself runs in `App.tsx`, and `App.test.tsx`'s
 * 'T156 re-activates the named tab against a fresh revision' proves that half.
 */
// Proves: the classified error and remediation contract's `conflict` row
// (partial — only that this caller declares an executable retry, naming the tab
// it acted on. The re-issue is proved in App.test.tsx.)
it('T156 offers Retry on a refused activation, naming the tab it acted on', async () => {
  hydrate([
    documentFor('one', '/repo/one.md'),
    documentFor('two', '/repo/two.md'),
  ]);
  store.dispatch(resetNotifications());
  const activateDocument = jest.fn(
    async (): Promise<DocumentTransitionResult> => ({
      error: {
        category: 'conflict',
        safeSubject: 'two.md',
        message: 'The tab set changed; the switch must be retried.',
        remediations: ['Retry'],
        dedupKey: 'activate:stale-tab-set',
      } satisfies ClassifiedError,
    }),
  );
  renderTabs({ activateDocument });

  fireEvent.click(screen.getByRole('tab', { name: /two\.md/u }));

  await waitFor(() =>
    expect(store.getState().notifications.items).toHaveLength(1),
  );
  expect(store.getState().notifications.items[0]?.remediations).toEqual([
    {
      action: 'retry',
      documentId: 'two',
      intent: 'activate-document',
      labelKey: 'action.retry.label',
    },
  ]);
});

/*
 * FR-FT-020 runs the foreground version check on three occasions: tab
 * activation, "window focus or resume", and before any write — and forbids a
 * background watcher or a polling timer as the means. Tab activation is a
 * backend concern (`internal/appmodel/tab_session.go` attaches the check to
 * every activation); focus and resume are only observable from the webview, so
 * they are checked here. Every assertion below is paired with its negative: the
 * check must not have run before the event, and time passing on its own must
 * not run it at all.
 */
// Proves: FR-FT-020 (the "window focus or resume" occasion, and the
// no-watcher/no-polling-timer constraint on how it is implemented). The "before
// any write" occasion and the stable re-read rules are proved in Go, not here.
it('T133 checks every path-backed document on window focus and on resume, and never on a timer', async () => {
  jest.useFakeTimers();
  try {
    const withPath = documentFor('one', '/repo/one.md');
    const readOnly = {
      ...documentFor('two', '/repo/two.md'),
      capability: 'read-only',
    };
    const untitled = documentFor('three', '');
    hydrate([withPath, readOnly, untitled]);
    const checkExternalChanges = jest.fn(async (documentId: string) => {
      void documentId;
      return { status: 'unchanged' as const };
    });
    renderTabs(
      {},
      {
        authorizeKeepMine: jest.fn(async () => ({
          status: 'authorized' as const,
        })),
        cancelConflict: jest.fn(async () => ({ status: 'cancelled' as const })),
        checkExternalChanges,
        reloadFromDisk: jest.fn(async () => ({ status: 'reloaded' as const })),
        skipConflict: jest.fn(async () => ({ status: 'skipped' as const })),
      },
    );

    // Mounting is not focusing, and no elapsed time is a check either: a run
    // here would mean the check is armed on a timer rather than on the event.
    expect(checkExternalChanges).not.toHaveBeenCalled();
    await act(async (): Promise<void> => {
      jest.advanceTimersByTime(120_000);
    });
    expect(checkExternalChanges).not.toHaveBeenCalled();

    await act(async (): Promise<void> => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    await waitFor(() => expect(checkExternalChanges).toHaveBeenCalledTimes(2));
    expect(checkExternalChanges.mock.calls.map((call) => call[0])).toEqual([
      'one',
      'two',
    ]);

    // Time alone still adds nothing once the listener is armed.
    await act(async (): Promise<void> => {
      jest.advanceTimersByTime(120_000);
    });
    expect(checkExternalChanges).toHaveBeenCalledTimes(2);

    await act(async (): Promise<void> => {
      globalThis.document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    await waitFor(() => expect(checkExternalChanges).toHaveBeenCalledTimes(4));
  } finally {
    jest.useRealTimers();
  }
});

// Proves: FR-FT-020 (partial — that a conflict the focus check detects for the
// active document opens FR-FT-021's prompt. The prompt's own bounds and
// decisions are proved by the tests above.)
it('T133 opens the external-change prompt for a conflict the focus check finds', async () => {
  const first = documentFor('one', '/repo/one.md');
  const preview: ConflictPreview = {
    contentRevision: 0,
    detectedDiskVersion: {
      exists: true,
      mode: 0o644,
      modifiedUnixNano: '9',
      size: 12,
    },
    displayName: 'one.md',
    documentId: 'one',
    onDisk: { byteCount: 6, lineCount: 1, text: 'disk\n', truncated: false },
    path: '/repo/one.md',
    readOnly: false,
    yours: { byteCount: 6, lineCount: 1, text: 'mine\n', truncated: false },
  };
  hydrate([first]);
  renderTabs(
    {},
    {
      authorizeKeepMine: jest.fn(async () => ({
        status: 'authorized' as const,
      })),
      cancelConflict: jest.fn(async () => ({ status: 'cancelled' as const })),
      checkExternalChanges: jest.fn(async () => ({
        status: 'detected' as const,
        documentId: 'one',
        preview,
      })),
      reloadFromDisk: jest.fn(async () => ({ status: 'reloaded' as const })),
      skipConflict: jest.fn(async () => ({ status: 'skipped' as const })),
    },
  );

  expect(
    screen.queryByRole('dialog', { name: 'File changed on disk' }),
  ).not.toBeInTheDocument();
  await act(async (): Promise<void> => {
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
  });

  await waitFor(() =>
    expect(
      screen.getByRole('dialog', { name: 'File changed on disk' }),
    ).toBeVisible(),
  );
});
