import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import type { DocViewInput } from '../../logic/store/appModelTypes';

const mockSetDocView = jest.fn<Promise<void>, [string, DocViewInput]>(
  async (): Promise<void> => undefined,
);
const mockAdapter = {
  flushBuffer: jest.fn(async (): Promise<void> => undefined),
  flushDocView: jest.fn(async (): Promise<void> => undefined),
  getState: jest.fn(),
  setDocView: mockSetDocView,
  setUILayout: jest.fn(async (): Promise<void> => undefined),
  subscribeAcceptedBuffers: jest.fn((): (() => void) => jest.fn()),
  subscribeStatePatches: jest.fn((): (() => void) => jest.fn()),
  updateBuffer: jest.fn(async (): Promise<void> => undefined),
  updateDocView: jest.fn(async (): Promise<void> => undefined),
};

jest.mock('../../logic/adapter', () => ({ appModelAdapter: mockAdapter }));

jest.mock('../components/CodeEditor', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const MockCodeEditor = React.forwardRef<
    HTMLTextAreaElement,
    {
      activationId?: string;
      initialValue: string;
    }
  >(function MockCodeEditor(
    { activationId, initialValue },
    ref,
  ): React.JSX.Element {
    return React.createElement('textarea', {
      'aria-label': 'Markdown source',
      defaultValue: initialValue,
      key: activationId,
      ref,
    });
  });

  return { __esModule: true, default: MockCodeEditor };
});

import {
  hydrateProjection,
  resetProjection,
} from '../../logic/store/appModelProjectionActions';
import type {
  DocumentMetadata,
  ViewArrangement,
} from '../../logic/store/appModelTypes';
import { store } from '../../logic/store';
import AppShell from './AppShell';
import EditorView from './EditorView';
import {
  EditorSessionContext,
  EditorSessionEpochContext,
} from './editorSession';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

function documentFor(arrangement: ViewArrangement): DocumentMetadata {
  return {
    documentId: 'document-1',
    title: 'Technical note',
    path: '',
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 2,
    view: {
      arrangement,
      editorVisible: arrangement !== 'preview',
      previewVisible: arrangement !== 'editor',
      cursor: { line: 1, column: 1 },
      selection: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
      scroll: { editor: 0, preview: 0 },
    },
  };
}

function renderEditorView(arrangement: ViewArrangement): void {
  const document = documentFor(arrangement);
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    }),
  );

  render(
    <Provider store={store}>
      <EditorSessionContext.Provider
        value={{
          documentId: document.documentId,
          content: '# Rendered Preview',
        }}
      >
        <EditorView />
      </EditorSessionContext.Provider>
    </Provider>,
  );
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
}

/*
 * jsdom has no `matchMedia`, so the minimum-window hook falls back to
 * `window.innerWidth` for its first read and is never reactive here. A test
 * that has to prove the collapse follows a resize installs this instead: a
 * query whose `matches` it controls and whose change listeners it can fire.
 */
function installMinimumWindowQuery(): {
  emit: (matches: boolean) => void;
  restore: () => void;
} {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  let matches = false;
  const query = {
    get matches(): boolean {
      return matches;
    },
    addEventListener: (
      _type: string,
      listener: (event: { matches: boolean }) => void,
    ): void => {
      listeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: (event: { matches: boolean }) => void,
    ): void => {
      listeners.delete(listener);
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (): typeof query => query,
  });
  return {
    emit: (next: boolean): void => {
      matches = next;
      act((): void => {
        for (const listener of listeners) listener({ matches: next });
      });
    },
    restore: (): void => {
      delete (window as { matchMedia?: unknown }).matchMedia;
    },
  };
}

beforeEach((): void => {
  store.dispatch(resetProjection());
  mockSetDocView.mockClear();
});

afterEach((): void => {
  cleanup();
  store.dispatch(resetProjection());
});

it('STORY-015-AC-1 applies the responsive split layout contract', () => {
  render(
    <Provider store={store}>
      <EditorSessionContext.Provider value={null}>
        <AppShell />
      </EditorSessionContext.Provider>
    </Provider>,
  );

  expect(
    screen.getByRole('complementary', { name: 'Workspace' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Document area' }),
  ).toBeEmptyDOMElement();
  expect(screen.queryByLabelText('Assistant')).not.toBeInTheDocument();
});

it('STORY-015-AC-3 renders each arrangement', () => {
  renderEditorView('editor');
  expect(screen.getByLabelText('Editor pane')).toBeInTheDocument();
  expect(screen.queryByLabelText('Preview pane')).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Editor' })).toBeChecked();
  expect(screen.getByLabelText('Markdown source')).toBeInTheDocument();

  cleanup();
  store.dispatch(resetProjection());
  renderEditorView('split');
  expect(screen.getByLabelText('Editor pane')).toBeInTheDocument();
  expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Split' })).toBeChecked();
  expect(
    screen.getByRole('heading', { name: 'Rendered Preview' }),
  ).toBeInTheDocument();

  cleanup();
  store.dispatch(resetProjection());
  renderEditorView('preview');
  expect(screen.getByLabelText('Editor pane')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(screen.getByLabelText('Markdown source')).toBeInTheDocument();
  expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Preview' })).toBeChecked();
  expect(
    screen.getByRole('heading', { name: 'Rendered Preview' }),
  ).toBeInTheDocument();
});

it('T078 keeps only the editor at the minimum window in Editor mode', () => {
  setViewportWidth(375);
  try {
    renderEditorView('editor');

    const editorPane = screen.getByLabelText('Editor pane');
    expect(editorPane).not.toHaveClass('paneHidden');
    expect(editorPane).toHaveAttribute('aria-hidden', 'false');
    expect(screen.queryAllByLabelText('Preview pane')).toHaveLength(0);
    expect(editorPane.parentElement?.children).toHaveLength(1);
  } finally {
    setViewportWidth(1024);
  }
});

it('T078 keeps only the viewer at the minimum window in Preview mode', () => {
  setViewportWidth(375);
  try {
    renderEditorView('preview');

    const previewPane = screen.getByLabelText('Preview pane');
    expect(previewPane).toHaveClass('pane');
    expect(previewPane).not.toHaveClass('paneHidden');
    expect(
      within(previewPane).getByRole('heading', { name: 'Rendered Preview' }),
    ).toBeInTheDocument();
    /*
     * The editor element stays mounted so its model and view state survive the
     * round trip, exactly as it does in Preview mode on a wide window — but it
     * is `display: none` and out of the accessibility tree, so the viewer is
     * the only pane laid out in the region.
     */
    const editorPane = screen.getByLabelText('Editor pane');
    expect(editorPane).toHaveClass('paneHidden');
    expect(editorPane).toHaveAttribute('aria-hidden', 'true');
  } finally {
    setViewportWidth(1024);
  }
});

it('T078 collapses Split to the editor at the minimum window and removes the preview', () => {
  setViewportWidth(375);
  try {
    renderEditorView('split');

    const editorPane = screen.getByLabelText('Editor pane');
    expect(editorPane).toHaveClass('pane');
    expect(editorPane).not.toHaveClass('paneHidden');
    expect(editorPane).toHaveAttribute('aria-hidden', 'false');
    /*
     * Removed from the tree, not merely zero-width: a preview that is still
     * rendered still costs a render pass and can still be reached by a
     * screen reader, and the region is supposed to carry one pane.
     */
    expect(screen.queryAllByLabelText('Preview pane')).toHaveLength(0);
    expect(editorPane.parentElement?.children).toHaveLength(1);

    /*
     * The surviving pane fills the region: it is the only child of the pane
     * row, and `.pane` is a fully flexible item.
     */
    const paneStyles = readSource('src/ui/components/Pane/Pane.module.css');
    expect(paneStyles).toMatch(/\.pane\s*\{[^}]*flex:\s*1 1 0;/s);
    expect(paneStyles).toMatch(/\.paneHidden\s*\{[^}]*display:\s*none;/s);

    /*
     * The recorded mode is still Split. The collapse is a presentation of the
     * current width, so the toolbar keeps reporting what the document stores.
     */
    expect(screen.getByRole('radio', { name: 'Split' })).toBeChecked();
  } finally {
    setViewportWidth(1024);
  }
});

it('T079 restores Split when the window widens again without writing an arrangement', () => {
  const minimumWindowQuery = installMinimumWindowQuery();
  try {
    renderEditorView('split');

    expect(screen.getByLabelText('Editor pane')).toBeInTheDocument();
    expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();

    minimumWindowQuery.emit(true);
    expect(screen.getByLabelText('Editor pane')).not.toHaveClass('paneHidden');
    expect(screen.queryAllByLabelText('Preview pane')).toHaveLength(0);

    // No user action in between — only the window got wider again.
    minimumWindowQuery.emit(false);
    expect(screen.getByLabelText('Editor pane')).not.toHaveClass('paneHidden');
    expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();

    expect(screen.getByRole('radio', { name: 'Split' })).toBeChecked();
    const storedView = store.getState().documents.byId['document-1']?.view;
    expect(storedView?.editorVisible).toBe(true);
    expect(storedView?.previewVisible).toBe(true);
    expect(mockSetDocView).not.toHaveBeenCalled();
  } finally {
    minimumWindowQuery.restore();
  }
});

// Proves: FR-006
it('replaces the same-document editor model when a Reload acknowledgement changes content', () => {
  const document = documentFor('split');
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    }),
  );
  const rendered = render(
    <Provider store={store}>
      <EditorSessionEpochContext.Provider value={0}>
        <EditorSessionContext.Provider
          value={{ documentId: document.documentId, content: '# mine\n' }}
        >
          <EditorView />
        </EditorSessionContext.Provider>
      </EditorSessionEpochContext.Provider>
    </Provider>,
  );

  expect(screen.getByLabelText('Markdown source')).toHaveValue('# mine\n');
  expect(
    within(screen.getByLabelText('Preview pane')).getByRole('heading', {
      name: 'mine',
    }),
  ).toBeInTheDocument();
  rendered.rerender(
    <Provider store={store}>
      <EditorSessionEpochContext.Provider value={1}>
        <EditorSessionContext.Provider
          value={{ documentId: document.documentId, content: '# disk\n' }}
        >
          <EditorView />
        </EditorSessionContext.Provider>
      </EditorSessionEpochContext.Provider>
    </Provider>,
  );

  expect(screen.getByLabelText('Markdown source')).toHaveValue('# disk\n');
  expect(
    within(screen.getByLabelText('Preview pane')).getByRole('heading', {
      name: 'disk',
    }),
  ).toBeInTheDocument();
});

it('STORY-015-AC-4 prevents an empty document arrangement', async () => {
  renderEditorView('split');

  const expectedVisibility = new Map([
    ['Editor', { editorVisible: true, previewVisible: false }],
    ['Split', { editorVisible: true, previewVisible: true }],
    ['Preview', { editorVisible: false, previewVisible: true }],
  ]);

  for (const [label, visibility] of expectedVisibility) {
    fireEvent.click(screen.getByRole('radio', { name: label }));
    await waitFor((): void => {
      expect(mockSetDocView).toHaveBeenLastCalledWith(
        'document-1',
        expect.objectContaining(visibility),
        expect.anything(),
      );
    });
  }

  const requestedViews = mockSetDocView.mock.calls.map(([, view]) => view);
  expect(requestedViews).toHaveLength(3);
  expect(
    requestedViews.every(
      (view): boolean => view.editorVisible || view.previewVisible,
    ),
  ).toBe(true);
});

it('STORY-015-AC-6 matches the split-view structure', () => {
  renderEditorView('split');

  expect(screen.getByLabelText('Document toolbar')).toBeInTheDocument();
  const arrangement = screen.getByRole('radiogroup', {
    name: 'View arrangement',
  });
  expect(within(arrangement).getAllByRole('radio')).toHaveLength(3);
  expect(
    within(arrangement).getByRole('radio', { name: 'Split' }),
  ).toBeChecked();

  const editorPane = screen.getByLabelText('Editor pane');
  expect(within(editorPane).getByText('Editor · Technical note')).toBeVisible();
  expect(within(editorPane).getByText('UTF-8 · LF')).toBeVisible();

  const previewPane = screen.getByLabelText('Preview pane');
  expect(within(previewPane).getByText('● Preview · live')).toBeVisible();
  expect(within(previewPane).getByText('GFM')).toBeVisible();

  const segmentedStyles = readSource(
    'src/ui/primitives/Segmented/Segmented.module.css',
  );
  expect(segmentedStyles).toMatch(/var\(--segmented-[\w-]+\)/);
  expect(segmentedStyles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
});

/*
 * T193. Three `T045` cases were removed here with the five CSS rules they
 * described: the paused-pane overflow, the preview's transparent background,
 * the two `.gme-preview` line-height overrides, and the `toolbar-overflow`
 * editor transform.
 *
 * Each read `EditorView.module.css` as text and asserted a declaration appeared
 * in it. That is only worth doing if the declaration does something, and T193
 * measured that it does not: those selectors match only when the parity harness
 * puts `data-parity-shell` on the application frame, and neutralising all five
 * leaves `[parity accounting]` at 147/147 with the suite green. A rule that
 * moves no compared pixel has nothing for a test to prove, so the assertions
 * pinned their own text and no behaviour.
 *
 * The measurement is in
 * `evidence/ft-vs-08/phase-18/shell-attribute-css-classification.md`, which also
 * records the opposite verdict for `FormattingToolbar.module.css`'s 34 rules — those
 * move an attributed residual from 181 to 184 pixels and stay.
 */
/*
 * T173. `T045 presents the reviewed selection metadata on the parity editor
 * route` was removed with the readout it described.
 *
 * The mockup's pane header carries `· sel 42w` (mockup.html:726) and Feature 003
 * builds no selection readout, so `EditorView` rendered a hardcoded `sel 42w`
 * on `?parity-case` to make the two sides agree. The 2026-08-13 clarification
 * recorded against this exact region requires the opposite: out-of-scope
 * reference content is "removed from the reference rather than manufactured in
 * production", which is how the deferred rich-rendering widgets are handled.
 *
 * The readout is now stripped from the reference by
 * `adaptEditorPaneSelection`, and the pane header and its metadata remain fully
 * compared — the clarification's other half.
 */
