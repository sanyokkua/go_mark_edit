import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useContext } from 'react';
import { Provider } from 'react-redux';
import type { EditorProps } from '@monaco-editor/react';
import type { editor, IRange, ISelection } from 'monaco-editor';

import {
  BUFFER_SYNC_MS,
  createAppModelAdapter,
  type AcceptedBuffer,
  type AppModelRuntime,
} from '../../logic/adapter/appModelAdapter';
import type { WireError } from '../../logic/utils/parseError';

const mockSetDocView = jest.fn(async (): Promise<void> => undefined);
const mockGetSettings = jest.fn();
const mockResetAppearance = jest.fn(async (): Promise<void> => undefined);
const mockUpdateAppearance = jest.fn(async (): Promise<void> => undefined);
let mockStatePatchListener:
  | ((patch: import('../../logic/store/appModelTypes').AppStatePatch) => void)
  | undefined;

jest.mock('../../logic/adapter', () => ({
  settingsAdapter: {
    getSettings: mockGetSettings,
    resetAppearance: mockResetAppearance,
    updateAppearance: mockUpdateAppearance,
  },
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
    updateLocalDocView: jest.fn(async (): Promise<void> => undefined),
  },
}));

interface MockMonacoRuntime {
  content: string;
  cursorPositionListener:
    ((event: editor.ICursorPositionChangedEvent) => void) | undefined;
  cursorSelectionListener:
    ((event: editor.ICursorSelectionChangedEvent) => void) | undefined;
  editor: editor.IStandaloneCodeEditor;
  model: {
    getFullModelRange: jest.Mock<IRange, []>;
    setValue: jest.Mock<void, [string]>;
  };
  props: EditorProps | null;
  selection: ISelection | null;
  viewState: editor.ICodeEditorViewState;
}

const mockRuntime = {} as MockMonacoRuntime;

function resetMockMonaco(): void {
  mockRuntime.content = '';
  mockRuntime.cursorPositionListener = undefined;
  mockRuntime.cursorSelectionListener = undefined;
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
  mockRuntime.viewState = {
    scrollTop: 480,
  } as unknown as editor.ICodeEditorViewState;
  mockRuntime.editor = {
    dispose: jest.fn(),
    executeEdits: jest.fn(),
    getModel: jest.fn(() => mockRuntime.model as unknown as editor.ITextModel),
    getSelection: jest.fn(() => mockRuntime.selection),
    layout: jest.fn(),
    setSelection: jest.fn((selection: IRange): void => {
      mockRuntime.selection = {
        selectionStartLineNumber: selection.startLineNumber,
        selectionStartColumn: selection.startColumn,
        positionLineNumber: selection.endLineNumber,
        positionColumn: selection.endColumn,
      } as ISelection;
    }),
    onDidBlurEditorText: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeCursorPosition: jest.fn(
      (listener: (event: editor.ICursorPositionChangedEvent) => void) => {
        mockRuntime.cursorPositionListener = listener;

        return { dispose: jest.fn() };
      },
    ),
    onDidChangeCursorSelection: jest.fn(
      (listener: (event: editor.ICursorSelectionChangedEvent) => void) => {
        mockRuntime.cursorSelectionListener = listener;
        return { dispose: jest.fn() };
      },
    ),
    onDidScrollChange: jest.fn(() => ({ dispose: jest.fn() })),
    pushUndoStop: jest.fn(),
    restoreViewState: jest.fn(
      (viewState: editor.ICodeEditorViewState | null): void => {
        const selection = (
          viewState as
            | (editor.ICodeEditorViewState & {
                selection?: ISelection;
              })
            | null
        )?.selection;
        if (selection !== undefined) {
          mockRuntime.selection = { ...selection } as ISelection;
        }
      },
    ),
    saveViewState: jest.fn((): editor.ICodeEditorViewState => {
      const viewState = mockRuntime.viewState as editor.ICodeEditorViewState & {
        selection?: ISelection;
      };
      viewState.selection =
        mockRuntime.selection === null
          ? undefined
          : { ...mockRuntime.selection };
      return viewState;
    }),
  } as unknown as editor.IStandaloneCodeEditor;
  mockRuntime.props = null;
}

jest.mock('@monaco-editor/react', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  const MockMonacoEditor = (props: EditorProps): React.JSX.Element => {
    const editorInstance = React.useMemo(() => mockRuntime.editor, []);

    React.useEffect((): void => {
      mockRuntime.props = props;
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
  applyMonacoThemeFromRoot: jest.fn(() => jest.fn()),
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
import {
  DocumentCommandContext,
  EditorSessionContext,
  EditorSessionProvider,
} from './editorSession';
import AppearanceControls from './AppearanceControls';
import EditorView, { type EditorViewAdapter } from './EditorView';

type VoidResult = { error?: WireError };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((complete): void => {
    resolve = complete;
  });

  return { promise, resolve: resolve as (value: T) => void };
}

const SessionCommandControls: React.FC = (): React.JSX.Element => {
  const commands = useContext(DocumentCommandContext);

  return (
    <>
      <button
        type="button"
        onClick={(): void => {
          commands?.replaceRange(
            {
              start: { lineNumber: 1, column: 7 },
              end: { lineNumber: 1, column: 11 },
            },
            'delta',
          );
        }}
      >
        Replace range through session
      </button>
      <button
        type="button"
        onClick={(): void => {
          commands?.replaceAll('whole\nreplacement');
        }}
      >
        Replace all through session
      </button>
    </>
  );
};

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
      applicationVersion: 'dev',
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    },
    activeBuffer: { documentId: document.documentId, content },
  };
  const mockedAdapter = appModelAdapter as jest.Mocked<typeof appModelAdapter>;

  mockedAdapter.getState.mockResolvedValue(initialState);
  await bootstrapAppModelProjection(appModelAdapter);
  const { default: AppShell } = await import('./AppShell');

  render(
    <Provider store={store}>
      <EditorSessionContext.Provider value={initialState.activeBuffer}>
        <AppShell />
      </EditorSessionContext.Provider>
    </Provider>,
  );
}

it('FR-WS-017 keeps a long document title available while both centre panes render', async () => {
  const title =
    'A deliberately long Markdown document title that remains available in the editor pane';
  const document = statusDocument({
    title,
    view: {
      arrangement: 'split',
      editorVisible: true,
      previewVisible: true,
      cursor: { line: 1, column: 1 },
      selection: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
      scroll: { editor: 0, preview: 0 },
    },
  });
  const adapter: EditorViewAdapter = {
    flushBuffer: async (): Promise<void> => undefined,
    flushDocView: async (): Promise<void> => undefined,
    subscribeAcceptedBuffers: (): (() => void) => (): void => undefined,
    updateBuffer: async (): Promise<void> => undefined,
    updateDocView: async (): Promise<void> => undefined,
  };
  await act(async (): Promise<void> => {
    renderLivePreviewEditor('# Long title document', adapter, document);
    await Promise.resolve();
  });

  expect(screen.getByLabelText('Editor pane')).toHaveTextContent(
    `Editor · ${title}`,
  );
  expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();
});

function renderLivePreviewEditor(
  content: string,
  adapter: EditorViewAdapter,
  document = statusDocument(),
): ReturnType<typeof render> {
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: { [document.documentId]: document },
      activeDocumentId: document.documentId,
      ui: {},
    }),
  );

  return render(
    <Provider store={store}>
      <EditorSessionContext.Provider
        value={{ documentId: document.documentId, content }}
      >
        <EditorView adapter={adapter} />
      </EditorSessionContext.Provider>
    </Provider>,
  );
}

function createRenderedEditorAdapter(): EditorViewAdapter {
  return {
    flushBuffer: async (): Promise<void> => undefined,
    flushDocView: async (): Promise<void> => undefined,
    subscribeAcceptedBuffers: (): (() => void) => (): void => undefined,
    updateBuffer: async (): Promise<void> => undefined,
    updateDocView: async (): Promise<void> => undefined,
  };
}

function appearanceSettings(
  theme: 'glass' | 'material' | 'minimal',
  mode: 'light' | 'dark',
): {
  appearance: { defaultOpenMode: string; mode: string; theme: string };
  contentPrivacy: { remotePolicy: string };
  markdown: {
    bulletMarker: string;
    emphasisMarker: string;
    formatOnSave: boolean;
    headingStyle: string;
    lintOnSave: boolean;
    standard: string;
  };
} {
  return {
    appearance: { defaultOpenMode: 'editor', mode, theme },
    contentPrivacy: { remotePolicy: 'ask' },
    markdown: {
      bulletMarker: '-',
      emphasisMarker: '*',
      formatOnSave: false,
      headingStyle: 'atx',
      lintOnSave: false,
      standard: 'gfm',
    },
  };
}

it('FR-WS-017 renders the translated editor catalogue and preview text', async () => {
  await act(async (): Promise<void> => {
    renderLivePreviewEditor('# Local preview', createRenderedEditorAdapter());
    await Promise.resolve();
  });

  expect(screen.getByLabelText('Editor view')).toBeInTheDocument();
  expect(screen.getByLabelText('Document toolbar')).toBeInTheDocument();
  expect(
    screen.getByRole('radiogroup', { name: 'View arrangement' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Editor' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Split' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Preview' })).toBeInTheDocument();
  expect(screen.getByText('● Preview · live')).toBeInTheDocument();
  expect(screen.getByText('GFM')).toBeInTheDocument();
});

it('FR-WS-017 applies every persisted palette to the rendered Settings control', async () => {
  const palettes = [
    ['glass', 'light'],
    ['glass', 'dark'],
    ['material', 'light'],
    ['material', 'dark'],
    ['minimal', 'light'],
    ['minimal', 'dark'],
  ] as const;
  mockGetSettings.mockReset();
  for (const [theme, mode] of palettes) {
    mockGetSettings.mockResolvedValueOnce(appearanceSettings(theme, mode));
    const rendered = render(
      <Provider store={store}>
        <AppearanceControls />
      </Provider>,
    );

    await waitFor((): void => {
      expect(document.documentElement).toHaveAttribute('data-theme', theme);
      expect(document.documentElement).toHaveAttribute('data-mode', mode);
    });
    expect(
      rendered.getByRole('button', { name: 'Settings' }),
    ).toBeInTheDocument();
    rendered.unmount();
  }
  expect(mockGetSettings).toHaveBeenCalledTimes(6);
});

it('FR-WS-017 ships a zero-duration reduced-motion override beside the rendered editor', async () => {
  await act(async (): Promise<void> => {
    renderLivePreviewEditor(
      '# Motion-safe preview',
      createRenderedEditorAdapter(),
    );
    await Promise.resolve();
  });
  expect(screen.getByLabelText('Editor view')).toBeInTheDocument();

  const stylesheet = document.createElement('style');
  stylesheet.textContent = readFileSync(
    resolve(process.cwd(), 'src/ui/styles/tokens.css'),
    'utf8',
  );
  document.head.append(stylesheet);
  const reducedMotionRule = Array.from(stylesheet.sheet?.cssRules ?? []).find(
    (rule): rule is CSSMediaRule =>
      rule.type === CSSRule.MEDIA_RULE &&
      (rule as CSSMediaRule).media.mediaText ===
        '(prefers-reduced-motion: reduce)',
  );
  const rootRule = reducedMotionRule?.cssRules[0] as CSSStyleRule | undefined;

  expect(rootRule?.style.getPropertyValue('--dur-fast')).toBe('0ms');
  expect(rootRule?.style.getPropertyValue('--dur-base')).toBe('0ms');
  expect(rootRule?.style.getPropertyValue('--dur-slow')).toBe('0ms');
  stylesheet.remove();
});

it('STORY-023-AC-4 preserves replacement undo and UpdateBuffer routing', async () => {
  const document = statusDocument({
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
  });
  const updateBuffer = jest.fn<Promise<void>, [string, string]>(
    async (): Promise<void> => undefined,
  );
  const adapter: EditorViewAdapter = {
    flushBuffer: async (): Promise<void> => undefined,
    flushDocView: async (): Promise<void> => undefined,
    subscribeAcceptedBuffers: (): (() => void) => (): void => undefined,
    updateBuffer,
    updateDocView: async (): Promise<void> => undefined,
  };
  mockRuntime.content = 'alpha beta\ngamma';
  mockRuntime.model.getFullModelRange.mockReturnValue({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 2,
    endColumn: 6,
  });
  (mockRuntime.editor.executeEdits as jest.Mock).mockImplementation(
    (_source: string, edits: Array<{ range: IRange; text: string }>): void => {
      const edit = edits[0];
      const offsetFor = (lineNumber: number, column: number): number => {
        const lines = mockRuntime.content.split('\n');
        return (
          lines
            .slice(0, lineNumber - 1)
            .reduce((offset, line): number => offset + line.length + 1, 0) +
          column -
          1
        );
      };
      const start = offsetFor(
        edit.range.startLineNumber,
        edit.range.startColumn,
      );
      const end = offsetFor(edit.range.endLineNumber, edit.range.endColumn);
      mockRuntime.content = `${mockRuntime.content.slice(0, start)}${edit.text}${mockRuntime.content.slice(end)}`;
      mockRuntime.props?.onChange?.(
        mockRuntime.content,
        {} as Parameters<NonNullable<EditorProps['onChange']>>[1],
      );
    },
  );
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
      <EditorSessionProvider
        activeBuffer={{
          documentId: document.documentId,
          content: mockRuntime.content,
        }}
      >
        <SessionCommandControls />
        <EditorView adapter={adapter} />
      </EditorSessionProvider>
    </Provider>,
  );
  await screen.findByRole('textbox', { name: 'Markdown source' });

  fireEvent.click(
    screen.getByRole('button', { name: 'Replace range through session' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Replace all through session' }),
  );

  expect(mockRuntime.editor.executeEdits).toHaveBeenCalledTimes(2);
  expect(mockRuntime.editor.executeEdits).toHaveBeenNthCalledWith(
    1,
    'gomarkedit',
    [expect.objectContaining({ text: 'delta' })],
  );
  expect(mockRuntime.editor.executeEdits).toHaveBeenNthCalledWith(
    2,
    'gomarkedit',
    [expect.objectContaining({ text: 'whole\nreplacement' })],
  );
  expect(mockRuntime.editor.pushUndoStop).toHaveBeenCalledTimes(4);
  expect(updateBuffer).toHaveBeenNthCalledWith(
    1,
    'document-1',
    'alpha delta\ngamma',
  );
  expect(updateBuffer).toHaveBeenNthCalledWith(
    2,
    'document-1',
    'whole\nreplacement',
  );
});

// Proves: STORY-016-AC-2
it('STORY-016-AC-2 displays live one-based cursor position without Redux truth', async () => {
  const workingCopy = 'Monaco-only working copy';
  await renderStatusEditor(statusDocument(), workingCopy);

  const status = await screen.findByRole('status', {
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

  const status = await screen.findByRole('status', {
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

  await screen.findByRole('status', { name: 'Document status' });
  // The arrangement is read off the panes themselves; the status row no longer
  // repeats the label the Editor/Split/Preview switch already carries.
  expect(screen.getByLabelText('Editor pane')).not.toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();

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

  expect(screen.getByLabelText('Editor pane')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(screen.getByLabelText('Markdown source')).toBeInTheDocument();
  expect(screen.getByLabelText('Preview pane')).toBeInTheDocument();
});

// Proves: STORY-016-AC-5
it('STORY-016-AC-5 formats Phase-01 canonical wire metadata labels', async () => {
  await renderStatusEditor(
    statusDocument({ encoding: 'utf-8', lineEnding: 'lf' }),
    'Untitled buffer',
  );

  const status = await screen.findByRole('status', {
    name: 'Document status',
  });

  expect(status).toHaveTextContent('UTF-8');
  expect(status).toHaveTextContent('LF');
});

it('STORY-017-AC-4 keeps preview text outside Redux', () => {
  let acceptedListener: ((buffer: AcceptedBuffer) => void) | undefined;
  const unsubscribe = jest.fn();
  const adapter: EditorViewAdapter = {
    flushBuffer: async (): Promise<void> => undefined,
    flushDocView: async (): Promise<void> => undefined,
    subscribeAcceptedBuffers(
      listener: (buffer: AcceptedBuffer) => void,
    ): () => void {
      acceptedListener = listener;
      return unsubscribe;
    },
    updateBuffer: async (): Promise<void> => undefined,
    updateDocView: async (): Promise<void> => undefined,
  };
  const bootstrapPreview = '# Bootstrap preview remains ephemeral';
  const rendered = renderLivePreviewEditor(bootstrapPreview, adapter);

  expect(
    screen.getByRole('heading', {
      name: 'Bootstrap preview remains ephemeral',
    }),
  ).toBeInTheDocument();
  expect(JSON.stringify(store.getState())).not.toContain(bootstrapPreview);

  const contentFreePatch = { revision: 2, ui: { sidebarVisible: true } };
  act((): void => {
    store.dispatch(applyStatePatch(contentFreePatch));
    acceptedListener?.({
      documentId: 'other-document',
      content: '# Ignored preview callback',
      generation: 1,
    });
  });

  expect(JSON.stringify(contentFreePatch)).not.toContain(bootstrapPreview);
  expect(JSON.stringify(store.getState())).not.toContain(bootstrapPreview);
  expect(
    screen.getByRole('heading', {
      name: 'Bootstrap preview remains ephemeral',
    }),
  ).toBeInTheDocument();

  rendered.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect((): void => {
    act((): void => {
      acceptedListener?.({
        documentId: 'document-1',
        content: '# Ignored after cleanup',
        generation: 2,
      });
    });
  }).not.toThrow();
  expect(JSON.stringify(store.getState())).not.toContain(
    'Ignored after cleanup',
  );
});

it('T045 keeps the editor region in binding content order without an extra wrapper', async () => {
  await renderStatusEditor(
    statusDocument({
      view: {
        arrangement: 'split',
        editorVisible: true,
        previewVisible: true,
        cursor: { line: 1, column: 1 },
        selection: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
        },
        scroll: { editor: 0, preview: 0 },
      },
    }),
    '# Release Notes — v2.1',
  );

  const editorRegion = screen.getByRole('region', { name: 'Editor view' });
  expect(editorRegion.querySelector(':scope > header')).toBeNull();
  expect(
    editorRegion.querySelector(':scope > [role="tablist"]'),
  ).not.toBeNull();
  expect(
    editorRegion.querySelector(':scope > [role="toolbar"]'),
  ).not.toBeNull();
  expect(
    editorRegion.querySelector(':scope > [class*="panes"]'),
  ).not.toBeNull();
});

it('STORY-017-AC-5 renders accepted GFM within the debounce target', async () => {
  const acknowledgement = deferred<VoidResult>();
  const updateBuffer = jest.fn<Promise<VoidResult>, [string, string]>(
    (documentId: string, content: string): Promise<VoidResult> => {
      void documentId;
      void content;
      return acknowledgement.promise;
    },
  );
  const runtime: AppModelRuntime = {
    eventsOn: (): (() => void) => (): void => undefined,
  };
  const adapter = createAppModelAdapter(
    {
      getState: async (): Promise<{ data: AppModelState }> => ({
        data: {
          snapshot: {
            revision: 1,
            applicationVersion: 'dev',
            documents: {},
            activeDocumentId: '',
            ui: {},
          },
          activeBuffer: { documentId: '', content: '' },
        },
      }),
      updateBuffer,
      setDocView: async (): Promise<VoidResult> => ({}),
      setUILayout: async (): Promise<VoidResult> => ({}),
    },
    runtime,
  );
  renderLivePreviewEditor('# Bootstrap preview', adapter);
  const editor = screen.getByRole('textbox', { name: 'Markdown source' });
  const gfmTable = '| Name | Status |\n| --- | --- |\n| Preview | Accepted |';

  const typingStoppedAt = Date.now();
  fireEvent.change(editor, { target: { value: gfmTable } });

  await act(async (): Promise<void> => {
    await jest.advanceTimersByTimeAsync(BUFFER_SYNC_MS - 1);
  });
  expect(updateBuffer).not.toHaveBeenCalled();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();

  await act(async (): Promise<void> => {
    await jest.advanceTimersByTimeAsync(1);
  });
  expect(updateBuffer).toHaveBeenCalledWith('document-1', gfmTable);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(Date.now() - typingStoppedAt).toBe(BUFFER_SYNC_MS);

  await act(async (): Promise<void> => {
    acknowledgement.resolve({});
    await jest.advanceTimersByTimeAsync(0);
  });

  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Accepted' })).toBeInTheDocument();
});

// Proves: STORY-019-AC-3
it('STORY-022-AC-4 (EC-DOCS-12) keeps focused hidden-editor patches content-free', async () => {
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
            arrangement: 'preview',
            editorVisible: false,
            previewVisible: true,
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
  const editor =
    await screen.findByLabelText<HTMLTextAreaElement>('Markdown source');
  expect(screen.getByLabelText('Editor pane')).toHaveAttribute(
    'aria-hidden',
    'true',
  );

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

it('STORY-022-AC-1 flushes session state before hiding the editor and does not hide after a flush error', async () => {
  const initialDocument = statusDocument({
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
  });
  const initialState: AppModelState = {
    snapshot: {
      revision: 1,
      applicationVersion: 'dev',
      documents: { [initialDocument.documentId]: initialDocument },
      activeDocumentId: initialDocument.documentId,
      ui: {},
    },
    activeBuffer: {
      documentId: initialDocument.documentId,
      content: '# Draft',
    },
  };
  const bufferFlush = deferred<void>();
  const viewFlush = deferred<void>();
  const mockedAdapter = appModelAdapter as jest.Mocked<typeof appModelAdapter>;
  mockedAdapter.getState.mockResolvedValue(initialState);
  mockedAdapter.flushBuffer.mockImplementationOnce(
    (): Promise<void> => bufferFlush.promise,
  );
  mockedAdapter.flushDocView.mockImplementationOnce(
    (): Promise<void> => viewFlush.promise,
  );

  await bootstrapAppModelProjection(appModelAdapter);
  render(
    <Provider store={store}>
      <EditorSessionContext.Provider value={initialState.activeBuffer}>
        <EditorView />
      </EditorSessionContext.Provider>
    </Provider>,
  );

  fireEvent.click(screen.getByRole('radio', { name: 'Preview' }));
  await waitFor((): void => {
    expect(mockedAdapter.flushBuffer).toHaveBeenCalledWith('document-1');
  });
  expect(mockedAdapter.flushDocView).not.toHaveBeenCalled();
  expect(mockSetDocView).not.toHaveBeenCalled();

  await act(async (): Promise<void> => {
    bufferFlush.resolve();
  });
  await waitFor((): void => {
    expect(mockedAdapter.flushDocView).toHaveBeenCalledWith('document-1');
  });
  expect(mockSetDocView).not.toHaveBeenCalled();

  await act(async (): Promise<void> => {
    viewFlush.resolve();
  });
  await waitFor((): void => {
    expect(mockSetDocView).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ editorVisible: false, previewVisible: true }),
      expect.anything(),
    );
  });
  expect(mockedAdapter.flushBuffer.mock.invocationCallOrder[0]).toBeLessThan(
    mockedAdapter.flushDocView.mock.invocationCallOrder[0],
  );
  expect(mockedAdapter.flushDocView.mock.invocationCallOrder[0]).toBeLessThan(
    mockSetDocView.mock.invocationCallOrder[0],
  );

  mockedAdapter.flushBuffer.mockRejectedValueOnce(new Error('flush failed'));
  mockSetDocView.mockClear();
  fireEvent.click(screen.getByRole('radio', { name: 'Preview' }));
  await waitFor((): void => {
    expect(mockedAdapter.flushBuffer).toHaveBeenCalledTimes(2);
  });
  expect(mockSetDocView).not.toHaveBeenCalled();
});

it('STORY-028-AC-2 acknowledges buffer and view before hiding the persistent session', async () => {
  const document = statusDocument({
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
  });
  const bufferFlush = deferred<void>();
  const viewFlush = deferred<void>();
  const commandAck = deferred<void>();
  const mockedAdapter = appModelAdapter as jest.Mocked<typeof appModelAdapter>;
  mockedAdapter.flushBuffer.mockImplementationOnce(
    (): Promise<void> => bufferFlush.promise,
  );
  mockedAdapter.flushDocView.mockImplementationOnce(
    (): Promise<void> => viewFlush.promise,
  );
  mockSetDocView.mockImplementationOnce(
    (): Promise<void> => commandAck.promise,
  );
  await renderStatusEditor(document, '# Persistent session');
  const source = await screen.findByRole('textbox', {
    name: 'Markdown source',
  });

  fireEvent.click(screen.getByRole('radio', { name: 'Preview' }));
  expect(mockedAdapter.flushBuffer).toHaveBeenCalledWith(document.documentId);
  expect(mockedAdapter.flushDocView).not.toHaveBeenCalled();
  expect(screen.getByRole('radio', { name: 'Editor' })).toBeChecked();

  await act(async (): Promise<void> => {
    bufferFlush.resolve();
  });
  expect(mockedAdapter.flushDocView).toHaveBeenCalledWith(document.documentId);
  expect(mockSetDocView).not.toHaveBeenCalled();

  await act(async (): Promise<void> => {
    viewFlush.resolve();
  });
  await waitFor((): void => expect(mockSetDocView).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('radio', { name: 'Editor' })).toBeChecked();
  expect(screen.getByLabelText('Markdown source')).toBe(source);

  await act(async (): Promise<void> => {
    commandAck.resolve();
  });
  expect(screen.getByRole('radio', { name: 'Editor' })).toBeChecked();
  expect(mockedAdapter.flushBuffer.mock.invocationCallOrder[0]).toBeLessThan(
    mockedAdapter.flushDocView.mock.invocationCallOrder[0],
  );
  expect(mockedAdapter.flushDocView.mock.invocationCallOrder[0]).toBeLessThan(
    mockSetDocView.mock.invocationCallOrder[0],
  );
});

it('STORY-028-AC-4 (EC-DOCS-12) preserves newer local view values and focused Monaco content and selection during patch and flush', async () => {
  const document = statusDocument({
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
  });
  const bufferFlush = deferred<void>();
  const mockedAdapter = appModelAdapter as jest.Mocked<typeof appModelAdapter>;
  mockedAdapter.flushBuffer.mockImplementationOnce(
    (): Promise<void> => bufferFlush.promise,
  );
  await renderStatusEditor(document, '# Local working copy');
  const source = await screen.findByRole<HTMLTextAreaElement>('textbox', {
    name: 'Markdown source',
  });
  mockedAdapter.updateLocalDocView.mockClear();
  mockRuntime.model.setValue.mockClear();
  fireEvent.change(source, { target: { value: '# Latest local content' } });
  source.focus();
  source.setSelectionRange(3, 10);

  act((): void => {
    mockRuntime.cursorPositionListener?.({
      position: { lineNumber: 9, column: 4 },
    } as editor.ICursorPositionChangedEvent);
    mockRuntime.cursorSelectionListener?.({
      selection: {
        selectionStartLineNumber: 8,
        selectionStartColumn: 2,
        positionLineNumber: 9,
        positionColumn: 4,
      },
    } as editor.ICursorSelectionChangedEvent);
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Preview' }));
  expect(mockedAdapter.flushBuffer).toHaveBeenCalledWith(document.documentId);

  act((): void => {
    store.dispatch(
      applyStatePatch({
        revision: 2,
        documents: {
          upsert: {
            [document.documentId]: { ...document, dirty: true, wordCount: 7 },
          },
        },
      }),
    );
  });

  expect(mockedAdapter.updateLocalDocView).toHaveBeenLastCalledWith(
    document.documentId,
    expect.objectContaining({
      cursor: { line: 9, column: 4 },
      selection: {
        start: { line: 8, column: 2 },
        end: { line: 9, column: 4 },
      },
    }),
  );
  expect(source).toHaveValue('# Latest local content');
  expect(source.selectionStart).toBe(3);
  expect(source.selectionEnd).toBe(10);
  expect(mockRuntime.model.setValue).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(store.getState())).not.toContain(
    'Latest local content',
  );

  await act(async (): Promise<void> => {
    bufferFlush.resolve();
  });
});

it('STORY-028-AC-6 isolates pending view intent across document switch', async () => {
  const first = statusDocument({
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
  });
  const second = {
    ...statusDocument({ title: 'Second document' }),
    documentId: 'document-2',
  };
  const bufferFlush = deferred<void>();
  const mockedAdapter = appModelAdapter as jest.Mocked<typeof appModelAdapter>;
  mockedAdapter.flushBuffer.mockImplementationOnce(
    (): Promise<void> => bufferFlush.promise,
  );
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: { [first.documentId]: first },
      activeDocumentId: first.documentId,
      ui: {},
    }),
  );
  const rendered = render(
    <Provider store={store}>
      <EditorSessionContext.Provider
        value={{
          documentId: first.documentId,
          content: '# First working copy',
        }}
      >
        <EditorView />
      </EditorSessionContext.Provider>
    </Provider>,
  );

  fireEvent.click(screen.getByRole('radio', { name: 'Preview' }));
  expect(mockedAdapter.flushBuffer).toHaveBeenCalledWith(first.documentId);
  act((): void => {
    store.dispatch(
      hydrateProjection({
        revision: 2,
        documents: { [second.documentId]: second },
        activeDocumentId: second.documentId,
        ui: {},
      }),
    );
  });
  rendered.rerender(
    <Provider store={store}>
      <EditorSessionContext.Provider
        value={{
          documentId: second.documentId,
          content: '# Second working copy',
        }}
      >
        <EditorView />
      </EditorSessionContext.Provider>
    </Provider>,
  );
  expect(screen.getByLabelText('Markdown source')).toHaveValue(
    '# Second working copy',
  );

  await act(async (): Promise<void> => {
    bufferFlush.resolve();
  });
  await waitFor((): void => {
    expect(mockSetDocView).toHaveBeenCalledWith(
      first.documentId,
      expect.objectContaining({ editorVisible: false, previewVisible: true }),
      expect.anything(),
    );
  });
  expect(mockSetDocView).not.toHaveBeenCalledWith(
    second.documentId,
    expect.anything(),
  );
  expect(screen.getByLabelText('Markdown source')).toHaveValue(
    '# Second working copy',
  );
});

it('STORY-022-AC-2 keeps Monaco mounted while preview-only is visible', async () => {
  const document = statusDocument({
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
  });
  await renderStatusEditor(document, '# Kept model');
  const source = await screen.findByRole('textbox', {
    name: 'Markdown source',
  });
  const mountedEditor = mockRuntime.editor;
  const mountedModel = mockRuntime.model;

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

  expect(screen.getByLabelText('Editor pane')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(screen.getByLabelText('Markdown source')).toBe(source);
  expect(mockRuntime.editor).toBe(mountedEditor);
  expect(mockRuntime.model).toBe(mountedModel);
  expect(
    (mountedEditor as unknown as { dispose: jest.Mock }).dispose,
  ).not.toHaveBeenCalled();
});

it('STORY-022-AC-3 restores the exact Monaco session and saved scroll state without bootstrap reseeding', async () => {
  const document = statusDocument({
    view: {
      arrangement: 'editor',
      editorVisible: true,
      previewVisible: false,
      cursor: { line: 1, column: 1 },
      selection: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
      },
      scroll: { editor: 47, preview: 0 },
    },
  });
  await renderStatusEditor(document, '# Bootstrap content');
  const mockedAdapter = appModelAdapter as jest.Mocked<typeof appModelAdapter>;
  mockSetDocView.mockClear();
  mockedAdapter.flushBuffer.mockClear();
  mockedAdapter.flushDocView.mockClear();
  const source = await screen.findByRole<HTMLTextAreaElement>('textbox', {
    name: 'Markdown source',
  });
  const mountedEditor = mockRuntime.editor;
  const mockedEditor = mountedEditor as unknown as {
    layout: jest.Mock<void, []>;
    restoreViewState: jest.Mock<void, [editor.ICodeEditorViewState | null]>;
    saveViewState: jest.Mock<editor.ICodeEditorViewState, []>;
  };
  const mountedModel = mockRuntime.model;
  mockRuntime.selection = {
    selectionStartLineNumber: 2,
    selectionStartColumn: 3,
    positionLineNumber: 2,
    positionColumn: 8,
  } as ISelection;
  fireEvent.change(source, { target: { value: '# Local session edit' } });
  source.setSelectionRange(3, 9);
  mockRuntime.model.setValue.mockClear();

  const applyAcceptedView = (
    revision: number,
    view: Pick<
      DocumentMetadata['view'],
      'arrangement' | 'editorVisible' | 'previewVisible'
    >,
  ): void => {
    act((): void => {
      mockStatePatchListener?.({
        revision,
        documents: {
          upsert: {
            [document.documentId]: {
              ...document,
              view: { ...document.view, ...view },
            },
          },
        },
      });
    });
  };

  fireEvent.click(screen.getByRole('radio', { name: 'Preview' }));
  await waitFor((): void => {
    expect(mockSetDocView).toHaveBeenCalledWith(
      'document-1',
      expect.objectContaining({ editorVisible: false, previewVisible: true }),
      expect.anything(),
    );
  });
  expect(mockedEditor.saveViewState).toHaveBeenCalledWith();
  expect(mockedEditor.saveViewState.mock.invocationCallOrder[0]).toBeLessThan(
    mockSetDocView.mock.invocationCallOrder[0],
  );

  applyAcceptedView(2, {
    arrangement: 'preview',
    editorVisible: false,
    previewVisible: true,
  });
  applyAcceptedView(3, {
    arrangement: 'editor',
    editorVisible: true,
    previewVisible: false,
  });
  await act(async (): Promise<void> => {
    await jest.advanceTimersByTimeAsync(16);
  });

  fireEvent.click(screen.getByRole('radio', { name: 'Preview' }));
  await waitFor((): void => {
    expect(mockSetDocView).toHaveBeenCalledTimes(2);
  });
  applyAcceptedView(4, {
    arrangement: 'preview',
    editorVisible: false,
    previewVisible: true,
  });
  applyAcceptedView(5, {
    arrangement: 'split',
    editorVisible: true,
    previewVisible: true,
  });
  await act(async (): Promise<void> => {
    await jest.advanceTimersByTimeAsync(16);
  });

  expect(screen.getByLabelText('Markdown source')).toBe(source);
  expect(source).toHaveValue('# Local session edit');
  expect(source.selectionStart).toBe(3);
  expect(source.selectionEnd).toBe(9);
  expect(mockRuntime.editor).toBe(mountedEditor);
  expect(mockRuntime.model).toBe(mountedModel);
  expect(mockRuntime.selection).toEqual({
    selectionStartLineNumber: 2,
    selectionStartColumn: 3,
    positionLineNumber: 2,
    positionColumn: 8,
  });
  expect(mockRuntime.model.setValue).not.toHaveBeenCalled();
  expect(source).not.toHaveValue('# Bootstrap content');
  expect(mockedEditor.saveViewState).toHaveBeenCalledTimes(2);
  expect(mockedEditor.layout).toHaveBeenCalledTimes(2);
  expect(mockedEditor.restoreViewState).toHaveBeenCalledTimes(2);
  expect(mockedEditor.restoreViewState).toHaveBeenNthCalledWith(
    1,
    mockRuntime.viewState,
  );
  expect(mockedEditor.restoreViewState).toHaveBeenNthCalledWith(
    2,
    mockRuntime.viewState,
  );
  expect(mockedEditor.layout.mock.invocationCallOrder[0]).toBeLessThan(
    mockedEditor.restoreViewState.mock.invocationCallOrder[0],
  );
  expect(mockedEditor.layout.mock.invocationCallOrder[1]).toBeLessThan(
    mockedEditor.restoreViewState.mock.invocationCallOrder[1],
  );
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
      applicationVersion: 'dev',
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

  await waitFor((): void => {
    expect(mockSetDocView).toHaveBeenCalledWith(
      'document-1',
      { editorVisible: false, previewVisible: true },
      {
        editorVisible: false,
        previewVisible: true,
        cursor: { line: 1, column: 1 },
        selection: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 1 },
        },
        scroll: { editor: 0, preview: 0 },
      },
    );
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

  expect(screen.getByLabelText('Editor pane')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
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
      applicationVersion: 'dev',
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
    expect.anything(),
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
    expect.anything(),
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
    expect.anything(),
  );
  expect(preview).toBeChecked();
  expect(preview).toHaveFocus();
});
