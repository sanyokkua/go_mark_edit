import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
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
        <AppShell assistantVisible={false} />
      </EditorSessionContext.Provider>
    </Provider>,
  );

  expect(
    screen.getByRole('complementary', { name: 'File explorer' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Document area' }),
  ).toBeEmptyDOMElement();
  expect(screen.getByLabelText('Assistant')).toHaveAttribute('hidden');

  const editorStyles = readSource('src/ui/widgets/EditorView.module.css');
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const tokens = readSource('src/ui/styles/tokens.css');

  expect(editorStyles).toMatch(
    /grid-template-columns:\s*repeat\(\s*auto-fit,\s*minmax\(min\(var\(--editor-pane-min-width\), 100%\), 1fr\)\s*\)/,
  );
  expect(editorStyles).toContain('gap: var(--editor-view-gap);');
  expect(editorStyles).toContain('min-width: 0;');
  expect(shellStyles).toContain('overflow: hidden;');
  expect(shellStyles).toContain('min-width: 0;');
  expect(tokens).toContain('--editor-pane-min-width: 20rem;');
  expect(tokens).toContain('--editor-view-gap: 0.75rem;');
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
