import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import type { EditorProps } from '@monaco-editor/react';
import type { editor, IRange, ISelection } from 'monaco-editor';

const mockSetDocView = jest.fn(async (): Promise<void> => undefined);
let mockStatePatchListener:
  | ((patch: import('../../logic/store/appModelTypes').AppStatePatch) => void)
  | undefined;

jest.mock('../../logic/adapter', () => ({
  appModelAdapter: {
    flushBuffer: jest.fn(async (): Promise<void> => undefined),
    flushDocView: jest.fn(async (): Promise<void> => undefined),
    getState: jest.fn(),
    setDocView: mockSetDocView,
    setUILayout: jest.fn(async (): Promise<void> => undefined),
    subscribeAcceptedBuffers: jest.fn((): (() => void) => jest.fn()),
    subscribeStatePatches: jest.fn(
      (
        listener: (
          patch: import('../../logic/store/appModelTypes').AppStatePatch,
        ) => void,
      ): (() => void) => {
        mockStatePatchListener = listener;
        return (): void => {
          mockStatePatchListener = undefined;
        };
      },
    ),
    updateBuffer: jest.fn(async (): Promise<void> => undefined),
    updateDocView: jest.fn(async (): Promise<void> => undefined),
  },
}));

interface MockMonacoRuntime {
  cursorPositionListener:
    ((event: editor.ICursorPositionChangedEvent) => void) | undefined;
  editor: editor.IStandaloneCodeEditor;
  model: {
    getFullModelRange: jest.Mock<IRange, []>;
    setValue: jest.Mock<void, [string]>;
  };
  props: EditorProps | null;
  selection: ISelection | null;
}

const mockRuntime = {} as MockMonacoRuntime;

function resetMockMonaco(): void {
  mockRuntime.cursorPositionListener = undefined;
  mockRuntime.selection = {
    selectionStartLineNumber: 1,
    selectionStartColumn: 1,
    positionLineNumber: 1,
    positionColumn: 1,
  } as ISelection;
  mockRuntime.model = {
    getFullModelRange: jest.fn<IRange, []>(() => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    })),
    setValue: jest.fn<void, [string]>(),
  };
  mockRuntime.editor = {
    executeEdits: jest.fn(),
    getModel: jest.fn(() => mockRuntime.model as unknown as editor.ITextModel),
    getSelection: jest.fn(() => mockRuntime.selection),
    onDidBlurEditorText: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeCursorPosition: jest.fn(
      (listener: (event: editor.ICursorPositionChangedEvent) => void) => {
        mockRuntime.cursorPositionListener = listener;

        return { dispose: jest.fn() };
      },
    ),
    onDidChangeCursorSelection: jest.fn(() => ({ dispose: jest.fn() })),
    pushUndoStop: jest.fn(),
  } as unknown as editor.IStandaloneCodeEditor;
  mockRuntime.props = null;
}

jest.mock('@monaco-editor/react', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  const MockMonacoEditor = (props: EditorProps): React.JSX.Element => {
    const editorInstance = React.useMemo(() => mockRuntime.editor, []);
    mockRuntime.props = props;

    React.useEffect((): void => {
      props.onMount?.(
        editorInstance,
        {} as Parameters<NonNullable<EditorProps['onMount']>>[1],
      );
    }, [editorInstance, props]);

    return React.createElement('textarea', {
      'aria-label': 'Markdown source',
      defaultValue: props.defaultValue,
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
        mockRuntime.model.setValue(event.target.value);
        props.onChange?.(
          event.target.value,
          {} as Parameters<NonNullable<EditorProps['onChange']>>[1],
        );
      },
    });
  };

  return {
    __esModule: true,
    default: MockMonacoEditor,
    loader: { config: jest.fn() },
  };
});

jest.mock('../components/monacoSetup', () => ({
  __esModule: true,
  monaco: {},
}));

import {
  applyStatePatch,
  hydrateProjection,
  resetProjection,
} from '../../logic/store/appModelProjectionActions';
import {
  bootstrapAppModelProjection,
  disposeAppModelProjection,
} from '../../logic/store/appModelProjection';
import type {
  AppModelState,
  DocumentMetadata,
} from '../../logic/store/appModelTypes';
import { appModelAdapter } from '../../logic/adapter';
import { store } from '../../logic/store';
import { EditorSessionContext } from './editorSession';
import EditorView from './EditorView';

beforeEach((): void => {
  jest.useFakeTimers();
  resetMockMonaco();
});

afterEach((): void => {
  jest.useRealTimers();
  disposeAppModelProjection();
  store.dispatch(resetProjection());
});

function statusDocument(
  overrides: Partial<DocumentMetadata> = {},
): DocumentMetadata {
  const view = overrides.view ?? {
    arrangement: 'split',
    editorVisible: true,
    previewVisible: true,
    cursor: { line: 1, column: 1 },
    selection: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    },
    scroll: { editor: 0, preview: 0 },
  };

  return {
    documentId: 'document-1',
    title: 'Untitled',
    path: '',
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 0,
    ...overrides,
    view,
  };
}

async function renderStatusEditor(
  document: DocumentMetadata,
  content: string,
): Promise<void> {
  const initialState: AppModelState = {
    snapshot: {
      revision: 1,
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    },
    activeBuffer: { documentId: document.documentId, content },
  };
  const mockedAdapter = appModelAdapter as jest.Mocked<typeof appModelAdapter>;

  mockedAdapter.getState.mockResolvedValue(initialState);
  await bootstrapAppModelProjection(appModelAdapter);

  render(
    <Provider store={store}>
      <EditorSessionContext.Provider value={initialState.activeBuffer}>
        <EditorView />
      </EditorSessionContext.Provider>
    </Provider>,
  );
}

// Proves: STORY-016-AC-2
it('STORY-016-AC-2 displays live one-based cursor position without Redux truth', async () => {
  const workingCopy = 'Monaco-only working copy';
  await renderStatusEditor(statusDocument(), workingCopy);

  const status = await screen.findByRole('contentinfo', {
    name: 'Document status',
  });
  expect(status).toHaveTextContent('Ln 1, Col 1');
  await screen.findByRole('textbox', { name: 'Markdown source' });
  expect(mockRuntime.cursorPositionListener).toEqual(expect.any(Function));

  act((): void => {
    mockRuntime.cursorPositionListener?.({
      position: { lineNumber: 7, column: 11 },
    } as editor.ICursorPositionChangedEvent);
  });

  await waitFor((): void => {
    expect(status).toHaveTextContent('Ln 7, Col 11');
  });
  expect(store.getState().documents.byId['document-1'].view.cursor).toEqual({
    line: 1,
    column: 1,
  });
  expect(JSON.stringify(store.getState())).not.toContain(workingCopy);
});

// Proves: STORY-016-AC-3
it('STORY-016-AC-3 renders higher-revision backend word count without Monaco or store content', async () => {
  const workingCopy = 'one Monaco word';
  const document = statusDocument({ wordCount: 0 });
  await renderStatusEditor(document, workingCopy);

  const status = await screen.findByRole('contentinfo', {
    name: 'Document status',
  });
  expect(status).toHaveTextContent('0 words');

  act((): void => {
    mockStatePatchListener?.({
      revision: 2,
      documents: {
        upsert: {
          [document.documentId]: { ...document, wordCount: 1024 },
        },
      },
    });
  });

  expect(status).toHaveTextContent('1,024 words');
  expect(JSON.stringify(store.getState())).not.toContain(workingCopy);
  expect(mockRuntime.model.getFullModelRange).not.toHaveBeenCalled();
});

// Proves: STORY-016-AC-4
it('STORY-016-AC-4 reflects a backend Preview-only view patch in the status bar', async () => {
  const document = statusDocument();
  await renderStatusEditor(document, '# Backend preview');

  const status = await screen.findByRole('contentinfo', {
    name: 'Document status',
  });
  expect(status).toHaveTextContent('Split');

  act((): void => {
    mockStatePatchListener?.({
      revision: 2,
      documents: {
        upsert: {
          [document.documentId]: {
            ...document,
            view: {
              ...document.view,
              arrangement: 'preview',
              editorVisible: false,
              previewVisible: true,
            },
          },
        },
      },
    });
  });

  expect(status).toHaveTextContent('Preview');
  expect(screen.queryByLabelText('Editor pane')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();
});

// Proves: STORY-016-AC-5
it('STORY-016-AC-5 formats Phase-01 canonical wire metadata labels', async () => {
  await renderStatusEditor(
    statusDocument({ encoding: 'utf-8', lineEnding: 'lf' }),
    'Untitled buffer',
  );

  const status = await screen.findByRole('contentinfo', {
    name: 'Document status',
  });

  expect(status).toHaveTextContent('UTF-8');
  expect(status).toHaveTextContent('LF');
});

it('STORY-019-AC-3 preserves Monaco state on metadata patches', async () => {
  // Proves: EC-DOCS-12
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: {
        'document-1': {
          documentId: 'document-1',
          title: 'Untitled',
          path: '',
          dirty: false,
          encoding: 'utf-8',
          lineEnding: 'lf',
          wordCount: 1,
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
        },
      },
      activeDocumentId: 'document-1',
      ui: {},
    }),
  );

  render(
    <Provider store={store}>
      <EditorSessionContext.Provider
        value={{ documentId: 'document-1', content: '# Local working copy' }}
      >
        <EditorView />
      </EditorSessionContext.Provider>
    </Provider>,
  );
  const editor = await screen.findByRole<HTMLTextAreaElement>('textbox', {
    name: 'Markdown source',
  });

  fireEvent.change(editor, { target: { value: '# Local user edit' } });
  editor.focus();
  editor.setSelectionRange(3, 3);
  expect(mockRuntime.model.setValue).toHaveBeenCalledWith('# Local user edit');
  mockRuntime.model.setValue.mockClear();

  act((): void => {
    store.dispatch(
      applyStatePatch({
        revision: 2,
        documents: {
          upsert: {
            'document-1': {
              ...store.getState().documents.byId['document-1'],
              dirty: true,
              wordCount: 5,
            },
          },
        },
      }),
    );
  });

  expect(editor).toHaveValue('# Local user edit');
  expect(editor.selectionStart).toBe(3);
  expect(editor.selectionEnd).toBe(3);
  expect(mockRuntime.model.setValue).not.toHaveBeenCalled();
  expect(JSON.stringify(store.getState())).not.toContain('Local user edit');
});

it('STORY-015-AC-2 round trips view mode through the backend patch', async () => {
  const initialDocument: DocumentMetadata = {
    documentId: 'document-1',
    title: 'Untitled',
    path: '',
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 1,
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
  const initialState: AppModelState = {
    snapshot: {
      revision: 1,
      documents: { [initialDocument.documentId]: initialDocument },
      activeDocumentId: initialDocument.documentId,
      ui: {},
    },
    activeBuffer: {
      documentId: initialDocument.documentId,
      content: '# Backend-owned preview',
    },
  };
  const mockedAdapter = appModelAdapter as jest.Mocked<typeof appModelAdapter>;
  mockedAdapter.getState.mockResolvedValue(initialState);
  mockSetDocView.mockClear();

  await bootstrapAppModelProjection(appModelAdapter);

  render(
    <Provider store={store}>
      <EditorSessionContext.Provider value={initialState.activeBuffer}>
        <EditorView />
      </EditorSessionContext.Provider>
    </Provider>,
  );

  expect(screen.getByLabelText('Editor pane')).toBeInTheDocument();
  expect(screen.queryByLabelText('Preview pane')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: 'Preview' }));

  await Promise.resolve();
  expect(mockSetDocView).toHaveBeenCalledWith('document-1', {
    editorVisible: false,
    previewVisible: true,
    cursor: { line: 1, column: 1 },
    selection: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    },
    scroll: { editor: 0, preview: 0 },
  });
  expect(screen.getByLabelText('Editor pane')).toBeInTheDocument();
  expect(screen.queryByLabelText('Preview pane')).not.toBeInTheDocument();

  act((): void => {
    mockStatePatchListener?.({
      revision: 2,
      documents: {
        upsert: {
          'document-1': {
            ...initialDocument,
            view: {
              ...initialDocument.view,
              arrangement: 'preview',
              editorVisible: false,
              previewVisible: true,
            },
          },
        },
      },
    });
  });

  expect(screen.queryByLabelText('Editor pane')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Backend-owned preview' }),
  ).toBeInTheDocument();
});

it('STORY-015-AC-5 keeps keyboard selection and focus backend-controlled', async () => {
  const initialDocument: DocumentMetadata = {
    documentId: 'document-1',
    title: 'Untitled',
    path: '',
    dirty: false,
    encoding: 'utf-8',
    lineEnding: 'lf',
    wordCount: 1,
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
  const initialState: AppModelState = {
    snapshot: {
      revision: 1,
      documents: { [initialDocument.documentId]: initialDocument },
      activeDocumentId: initialDocument.documentId,
      ui: {},
    },
    activeBuffer: {
      documentId: initialDocument.documentId,
      content: '# Backend-owned preview',
    },
  };
  const mockedAdapter = appModelAdapter as jest.Mocked<typeof appModelAdapter>;
  mockedAdapter.getState.mockResolvedValue(initialState);
  mockSetDocView.mockClear();

  await bootstrapAppModelProjection(appModelAdapter);

  render(
    <Provider store={store}>
      <EditorSessionContext.Provider value={initialState.activeBuffer}>
        <EditorView />
      </EditorSessionContext.Provider>
    </Provider>,
  );

  const editor = screen.getByRole('radio', { name: 'Editor' });
  editor.focus();

  fireEvent.keyDown(editor, { key: 'End' });
  await waitFor((): void => {
    expect(mockSetDocView).toHaveBeenCalledTimes(1);
  });
  expect(mockSetDocView).toHaveBeenLastCalledWith(
    'document-1',
    expect.objectContaining({ editorVisible: false, previewVisible: true }),
  );
  expect(editor).toBeChecked();
  expect(editor).toHaveFocus();

  act((): void => {
    mockStatePatchListener?.({
      revision: 2,
      documents: {
        upsert: {
          'document-1': {
            ...initialDocument,
            view: {
              ...initialDocument.view,
              arrangement: 'preview',
              editorVisible: false,
              previewVisible: true,
            },
          },
        },
      },
    });
  });

  const preview = screen.getByRole('radio', { name: 'Preview' });
  expect(preview).toBeChecked();
  expect(preview).toHaveFocus();

  fireEvent.keyDown(preview, { key: 'Home' });
  await waitFor((): void => {
    expect(mockSetDocView).toHaveBeenCalledTimes(2);
  });
  expect(mockSetDocView).toHaveBeenLastCalledWith(
    'document-1',
    expect.objectContaining({ editorVisible: true, previewVisible: false }),
  );
  expect(preview).toBeChecked();
  expect(preview).toHaveFocus();

  mockSetDocView.mockRejectedValueOnce(new Error('backend rejected command'));
  fireEvent.keyDown(preview, { key: 'ArrowLeft' });
  await waitFor((): void => {
    expect(mockSetDocView).toHaveBeenCalledTimes(3);
  });
  expect(mockSetDocView).toHaveBeenLastCalledWith(
    'document-1',
    expect.objectContaining({ editorVisible: true, previewVisible: true }),
  );
  expect(preview).toBeChecked();
  expect(preview).toHaveFocus();
});
