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
      initialValue: string;
    }
  >(function MockCodeEditor({ initialValue }, ref): React.JSX.Element {
    return React.createElement('textarea', {
      'aria-label': 'Markdown source',
      defaultValue: initialValue,
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
import { EditorSessionContext } from './editorSession';

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

  const editorStyles = readSource('src/ui/widgets/EditorView.module.css');
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const tokens = readSource('src/ui/styles/tokens.css');

  expect(editorStyles).toMatch(/\.panes\s*\{[^}]*display:\s*flex;/s);
  expect(editorStyles).toMatch(/\.pane\s*\{[^}]*flex:\s*1 1 0;/s);
  expect(editorStyles).toContain('padding: 0;');
  expect(editorStyles).toContain('gap: var(--editor-view-gap);');
  expect(editorStyles).toContain('min-width: 0;');
  expect(editorStyles).toMatch(
    /\.previewContent\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s,
  );
  expect(shellStyles).toContain('overflow: hidden;');
  expect(shellStyles).toContain('min-width: 0;');
  expect(tokens).toContain('--editor-pane-min-width: 20rem;');
  expect(tokens).toContain('--pane-gap: 10px;');
  expect(tokens).toContain('--shell-assistant-collapsed-width: 0;');
  expect(editorStyles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
  expect(shellStyles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
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
    const editorStyles = readSource('src/ui/widgets/EditorView.module.css');
    expect(editorStyles).toMatch(/\.pane\s*\{[^}]*flex:\s*1 1 0;/s);
    expect(editorStyles).toMatch(/\.paneHidden\s*\{[^}]*display:\s*none;/s);

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

it('T045 presents the reviewed selection metadata on the parity editor route', () => {
  const originalUrl = window.location.href;
  window.history.replaceState(
    {},
    '',
    '/?parity-case=primary:editor-split:1280:glass-light',
  );
  try {
    renderEditorView('split');

    /*
     * The binding nests the selection metric in its own span so it can carry
     * accent ink against the header's faint text (mockup.html:726). The
     * metadata therefore still reads as one line, but `sel 42w` is a distinct
     * element rather than a bare text fragment — assert both.
     */
    const selection = within(screen.getByLabelText('Editor pane')).getByText(
      'sel 42w',
    );
    expect(selection).toBeInTheDocument();
    expect(selection.parentElement).toHaveTextContent('UTF-8 · LF · sel 42w');
  } finally {
    window.history.replaceState({}, '', originalUrl);
  }
});

it('T045 prevents the parity preview from double-compositing the pane surface', () => {
  const editorStyles = readSource('src/ui/widgets/EditorView.module.css');

  expect(editorStyles).toContain(
    ":global(.application-frame:has([data-parity-shell='true'])) .previewContent",
  );
  expect(editorStyles).toMatch(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\) \.previewContent\s*\{[^}]*background:\s*transparent;[^}]*backdrop-filter:\s*none;/s,
  );
  expect(editorStyles).toMatch(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\)[\s\S]*?\.previewContent\s+:global\(\.gme-preview\)[\s\S]*?line-height:\s*normal;/s,
  );
  expect(editorStyles).toMatch(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\)[\s\S]*?\.previewContent\s+:global\(\.gme-preview\)[\s\S]*?margin-inline-start:\s*20px;[^}]*padding-inline-start:\s*0;/s,
  );
  expect(editorStyles).toMatch(
    /:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\)[\s\S]*?\.previewContent\s+:global\(\.gme-preview\)[\s\S]*?:is\(ul, ol\)\s*\{[^}]*line-height:\s*normal;/s,
  );
});

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
      <EditorSessionContext.Provider
        value={{ documentId: document.documentId, content: '# mine\n' }}
      >
        <EditorView />
      </EditorSessionContext.Provider>
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
      <EditorSessionContext.Provider
        value={{ documentId: document.documentId, content: '# disk\n' }}
      >
        <EditorView />
      </EditorSessionContext.Provider>
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

  const segmentedStyles = readSource('src/ui/primitives/Segmented.module.css');
  expect(segmentedStyles).toMatch(/var\(--segmented-[\w-]+\)/);
  expect(segmentedStyles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
});

it('T045 bounds and places the parity toolbar-overflow editor surface without a computed margin offset', () => {
  const editorStyles = readSource('src/ui/widgets/EditorView.module.css');

  expect(editorStyles).toMatch(
    /@media \(min-width: 769px\)[\s\S]*?:global\(\.application-frame:has\(\[data-parity-family='toolbar-overflow'\]\)\)\s+\.editorView\s*\{[^}]*transform:\s*translateX\(66\.797px\);[^}]*width:\s*720px;/s,
  );
  expect(editorStyles).not.toMatch(
    /data-parity-family='toolbar-overflow'[\s\S]*?margin-inline-start:\s*66\.797px/s,
  );
});

it('T045 keeps the narrow parity paused-preview action above its pane clip', () => {
  const editorStyles = readSource('src/ui/widgets/EditorView.module.css');

  expect(editorStyles).toMatch(
    /@media \(max-width: 376px\)[\s\S]*?:global\(\.application-frame:has\(\[data-parity-shell='true'\]\)\)\s*\.pane:has\(\[data-preview-state='paused'\]\)\s*\{[^}]*overflow:\s*visible;/s,
  );
});
