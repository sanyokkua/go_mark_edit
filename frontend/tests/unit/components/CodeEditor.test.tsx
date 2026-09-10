import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import type { EditorProps } from '@monaco-editor/react';
import type { editor, IPosition, IRange, ISelection } from 'monaco-editor';

import CodeEditor, {
  type CodeEditorHandle,
  type EditorPosition,
  type EditorSelection,
} from '../../../src/ui/components/CodeEditor';
import { applyMonacoThemeFromRoot } from '../../../src/ui/components/monacoSetup';
import { createDocumentCommands } from '../../../src/logic/hooks/useDocumentCommands';

interface MockModel {
  dispose: jest.Mock<void, []>;
  getFullModelRange: jest.Mock<IRange, []>;
  getValue: jest.Mock<string, []>;
  setValue: jest.Mock<void, [string]>;
}

interface MockMonacoRuntime {
  blurListener: (() => void) | null;
  content: string;
  cursorListener: ((event: { position: IPosition }) => void) | null;
  editor: editor.IStandaloneCodeEditor;
  model: MockModel;
  props: EditorProps | null;
  scrollTop: number;
  selection: ISelection | null;
  selectionListener: ((event: { selection: ISelection }) => void) | null;
}

const fullModelRange: IRange = {
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 2,
  endColumn: 1,
};

const mockRuntime = {} as MockMonacoRuntime;

function resetMockMonaco(): void {
  mockRuntime.blurListener = null;
  mockRuntime.content = '';
  mockRuntime.cursorListener = null;
  mockRuntime.selectionListener = null;
  mockRuntime.selection = {
    selectionStartLineNumber: 1,
    selectionStartColumn: 1,
    positionLineNumber: 1,
    positionColumn: 1,
  } as ISelection;
  mockRuntime.model = {
    dispose: jest.fn<void, []>(),
    getFullModelRange: jest.fn<IRange, []>(() => fullModelRange),
    getValue: jest.fn<string, []>(() => mockRuntime.content),
    setValue: jest.fn<void, [string]>(),
  };
  mockRuntime.editor = {
    executeEdits: jest.fn(),
    getModel: jest.fn(() => mockRuntime.model as unknown as editor.ITextModel),
    getScrollTop: jest.fn(() => mockRuntime.scrollTop),
    getSelection: jest.fn(() => mockRuntime.selection),
    setSelection: jest.fn(),
    deltaDecorations: jest.fn(() => []),
    onDidBlurEditorText: jest.fn((listener: () => void) => {
      mockRuntime.blurListener = listener;

      return { dispose: jest.fn() };
    }),
    onDidChangeCursorPosition: jest.fn(
      (listener: (event: { position: IPosition }) => void) => {
        mockRuntime.cursorListener = listener;

        return { dispose: jest.fn() };
      },
    ),
    onDidChangeCursorSelection: jest.fn(
      (listener: (event: { selection: ISelection }) => void) => {
        mockRuntime.selectionListener = listener;

        return { dispose: jest.fn() };
      },
    ),
    pushUndoStop: jest.fn(),
    dispose: jest.fn(),
  } as unknown as editor.IStandaloneCodeEditor;
  mockRuntime.props = null;
  mockRuntime.scrollTop = 0;
}

jest.mock('@monaco-editor/react', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  const MockMonacoEditor = (props: EditorProps): React.JSX.Element => {
    const { onMount } = props;
    const editorInstance = React.useMemo(() => mockRuntime.editor, []);

    mockRuntime.props = props;

    React.useEffect(() => {
      onMount?.(
        editorInstance,
        {} as unknown as Parameters<NonNullable<EditorProps['onMount']>>[1],
      );
    }, [editorInstance, onMount]);

    return React.createElement('textarea', {
      'aria-label': 'Markdown source',
      defaultValue: props.defaultValue,
      onBlur: () => mockRuntime.blurListener?.(),
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        mockRuntime.model.setValue(event.target.value);
        props.onChange?.(
          event.target.value,
          {} as unknown as Parameters<NonNullable<EditorProps['onChange']>>[1],
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

jest.mock('../../../src/ui/components/monacoSetup', () => ({
  __esModule: true,
  monaco: {},
  applyMonacoThemeFromRoot: jest.fn(() => jest.fn()),
}));

beforeEach((): void => {
  resetMockMonaco();
});

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

it('configures the default Markdown editor tokens and options', async () => {
  render(<CodeEditor documentId="document-1" initialValue="# Heading" />);

  expect(
    await screen.findByRole('textbox', { name: 'Markdown source' }),
  ).toHaveValue('# Heading');
  expect(mockRuntime.props).toMatchObject({
    defaultValue: '# Heading',
    language: 'markdown',
    path: 'inmemory://gomarkedit/document-1.md',
    options: {
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      wordWrap: 'off',
      minimap: { enabled: false },
      fontSize: 14,
      padding: { top: 12, bottom: 12 },
    },
  });

  expect(readSource('src/ui/styles/tokens.css')).toContain(
    '--editor-font-size: 14px;',
  );
  expect(readSource('src/ui/components/CodeEditor.module.css')).toContain(
    'min-height: var(--editor-min-height);',
  );
  expect(readSource('src/ui/components/CodeEditor.tsx')).toContain(
    "getPropertyValue('--editor-font-size')",
  );
});

it('restores the acknowledged selection at the fresh editor activation boundary', async () => {
  render(
    <CodeEditor
      documentId="document-1"
      initialValue="first\nselected"
      initialSelection={{
        start: { lineNumber: 2, column: 1 },
        end: { lineNumber: 2, column: 9 },
      }}
    />,
  );

  await screen.findByRole('textbox', { name: 'Markdown source' });
  expect(mockRuntime.editor.setSelection).toHaveBeenCalledWith({
    startLineNumber: 2,
    startColumn: 1,
    endLineNumber: 2,
    endColumn: 9,
  });
});

it('reports Monaco edits immediately', async () => {
  const onChange = jest.fn<void, [string]>();

  render(
    <CodeEditor
      documentId="document-1"
      initialValue="before"
      onChange={onChange}
    />,
  );

  fireEvent.change(
    await screen.findByRole('textbox', { name: 'Markdown source' }),
    { target: { value: 'after' } },
  );

  expect(mockRuntime.model.setValue).toHaveBeenCalledWith('after');
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('after');
});

it('seeds a model only for a new document identity', async () => {
  const { rerender } = render(
    <CodeEditor documentId="document-1" initialValue="first document" />,
  );
  const firstModel = await screen.findByRole('textbox', {
    name: 'Markdown source',
  });

  rerender(
    <CodeEditor
      documentId="document-1"
      initialValue="must not overwrite the focused model"
    />,
  );

  expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBe(
    firstModel,
  );
  expect(firstModel).toHaveValue('first document');
  expect(mockRuntime.model.setValue).not.toHaveBeenCalled();

  rerender(
    <CodeEditor documentId="document-2" initialValue="second document" />,
  );

  const secondModel = screen.getByRole('textbox', {
    name: 'Markdown source',
  });
  expect(secondModel).not.toBe(firstModel);
  expect(secondModel).toHaveValue('second document');
  expect(mockRuntime.props).toMatchObject({
    defaultValue: 'second document',
    path: 'inmemory://gomarkedit/document-2.md',
  });
});

it('creates a fresh activation model and drops prior undo identity', async () => {
  const { rerender } = render(
    <CodeEditor
      documentId="document-1"
      activationId="Symbol(editor-activation-1)"
      initialValue="first activation"
    />,
  );
  await screen.findByRole('textbox', { name: 'Markdown source' });
  const firstPath = mockRuntime.props?.path;

  rerender(
    <CodeEditor
      documentId="document-1"
      activationId="Symbol(editor-activation-2)"
      initialValue="second activation"
    />,
  );

  expect(mockRuntime.props?.path).not.toBe(firstPath);
  expect(mockRuntime.props?.defaultValue).toBe('second activation');
  expect(mockRuntime.model.dispose).toHaveBeenCalled();
  expect(mockRuntime.editor.dispose).toHaveBeenCalled();
});

it('preserves the model cursor and selection on metadata rerender', async () => {
  const ref = { current: null as CodeEditorHandle | null };
  const selection: ISelection = {
    selectionStartLineNumber: 3,
    selectionStartColumn: 7,
    positionLineNumber: 2,
    positionColumn: 4,
  } as ISelection;
  mockRuntime.selection = selection;

  const { rerender } = render(
    <CodeEditor
      ref={ref}
      documentId="document-1"
      initialValue="unchanged"
      lineNumbers="on"
      minimap={false}
    />,
  );
  const model = await screen.findByRole('textbox', {
    name: 'Markdown source',
  });

  rerender(
    <CodeEditor
      ref={ref}
      documentId="document-1"
      initialValue="unchanged"
      lineNumbers="off"
      minimap
    />,
  );

  expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBe(model);
  expect(mockRuntime.model.setValue).not.toHaveBeenCalled();
  expect(ref.current?.getSelection()).toEqual({
    start: { lineNumber: 2, column: 4 },
    end: { lineNumber: 3, column: 7 },
  });
});

it('keeps the mounted Monaco model intact when the root palette changes', async (): Promise<void> => {
  const { unmount } = render(
    <CodeEditor documentId="document-1" initialValue="palette-safe content" />,
  );
  const model = await screen.findByRole('textbox', { name: 'Markdown source' });

  document.documentElement.setAttribute('data-theme', 'minimal');
  document.documentElement.setAttribute('data-mode', 'dark');
  await Promise.resolve();

  expect(screen.getByRole('textbox', { name: 'Markdown source' })).toBe(model);
  expect(mockRuntime.editor.getModel()).toBe(mockRuntime.model);
  expect(mockRuntime.model.setValue).not.toHaveBeenCalled();
  expect(applyMonacoThemeFromRoot).toHaveBeenCalledTimes(1);

  unmount();
});

it('preserves content selection scroll and undo state across a palette mutation', async (): Promise<void> => {
  const ref = { current: null as CodeEditorHandle | null };
  mockRuntime.content = '# heading\nselected text';
  mockRuntime.scrollTop = 240;
  mockRuntime.selection = {
    selectionStartLineNumber: 2,
    selectionStartColumn: 1,
    positionLineNumber: 2,
    positionColumn: 9,
  } as ISelection;

  render(
    <CodeEditor
      ref={ref}
      documentId="document-1"
      initialValue={mockRuntime.content}
    />,
  );
  await screen.findByRole('textbox', { name: 'Markdown source' });
  const editorInstance = mockRuntime.editor;
  const model = mockRuntime.model;

  document.documentElement.setAttribute('data-theme', 'glass');
  document.documentElement.setAttribute('data-mode', 'dark');
  await Promise.resolve();

  expect(mockRuntime.editor).toBe(editorInstance);
  expect(mockRuntime.editor.getModel()).toBe(model);
  expect(ref.current?.getContent()).toBe('# heading\nselected text');
  expect(ref.current?.getSelection()).toEqual({
    start: { lineNumber: 2, column: 1 },
    end: { lineNumber: 2, column: 9 },
  });
  expect(mockRuntime.editor.getScrollTop()).toBe(240);
  expect(mockRuntime.editor.executeEdits).not.toHaveBeenCalled();
  expect(mockRuntime.editor.pushUndoStop).not.toHaveBeenCalled();
});

it('keeps the editor component presentational', async () => {
  const ref = { current: null as CodeEditorHandle | null };
  const onBlur = jest.fn();
  const onCursorPositionChange = jest.fn<void, [EditorPosition]>();
  const onSelectionChange = jest.fn<void, [EditorSelection | null]>();
  const onEditorMounted = jest.fn();

  render(
    <CodeEditor
      ref={ref}
      documentId="document-1"
      initialValue="selection"
      onBlur={onBlur}
      onCursorPositionChange={onCursorPositionChange}
      onSelectionChange={onSelectionChange}
      onEditorMounted={onEditorMounted}
    />,
  );

  fireEvent.blur(
    await screen.findByRole('textbox', { name: 'Markdown source' }),
  );
  mockRuntime.cursorListener?.({ position: { lineNumber: 4, column: 2 } });
  mockRuntime.selectionListener?.({
    selection: {
      selectionStartLineNumber: 4,
      selectionStartColumn: 2,
      positionLineNumber: 2,
      positionColumn: 1,
    } as ISelection,
  });
  ref.current?.replaceRange(
    {
      start: { lineNumber: 1, column: 1 },
      end: { lineNumber: 1, column: 10 },
    },
    'replacement',
  );
  ref.current?.replaceAll('whole document');

  expect(onBlur).toHaveBeenCalledTimes(1);
  expect(onCursorPositionChange).toHaveBeenCalledWith({
    lineNumber: 4,
    column: 2,
  });
  expect(onSelectionChange).toHaveBeenCalledWith({
    start: { lineNumber: 2, column: 1 },
    end: { lineNumber: 4, column: 2 },
  });
  expect(onEditorMounted).toHaveBeenCalledWith(mockRuntime.editor);
  expect(mockRuntime.editor.executeEdits).toHaveBeenNthCalledWith(
    1,
    'gomarkedit',
    [
      {
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 10,
        },
        text: 'replacement',
        forceMoveMarkers: true,
      },
    ],
  );
  expect(mockRuntime.editor.executeEdits).toHaveBeenNthCalledWith(
    2,
    'gomarkedit',
    [
      {
        range: fullModelRange,
        text: 'whole document',
        forceMoveMarkers: true,
      },
    ],
  );
  expect(mockRuntime.editor.pushUndoStop).toHaveBeenCalledTimes(4);

  const source = readSource('src/ui/components/CodeEditor.tsx');
  expect(source).not.toMatch(
    /from\s+['"][^'"]*(?:logic\/adapter|redux|wailsjs)[^'"]*['"]/,
  );
});

it('applies formatter caret and range selection intent after a Monaco edit', async () => {
  const ref = { current: null as CodeEditorHandle | null };
  render(<CodeEditor ref={ref} documentId="document-1" initialValue="hello" />);
  await screen.findByRole('textbox', { name: 'Markdown source' });

  const selection: EditorSelection = {
    start: { lineNumber: 1, column: 3 },
    end: { lineNumber: 1, column: 8 },
  };
  ref.current?.replaceRange(
    {
      start: { lineNumber: 1, column: 1 },
      end: { lineNumber: 1, column: 6 },
    },
    '**hello**',
    selection,
  );

  expect(mockRuntime.editor.setSelection).toHaveBeenCalledWith({
    startLineNumber: 1,
    startColumn: 3,
    endLineNumber: 1,
    endColumn: 8,
  });
});

it('routes the editable command seam through Monaco and UpdateBuffer', async () => {
  const ref = { current: null as CodeEditorHandle | null };
  const updateBuffer = jest.fn<void, [string, string]>();
  render(
    <CodeEditor
      ref={ref}
      documentId="document-1"
      initialValue="before"
      onChange={(content: string): void => {
        updateBuffer('document-1', content);
      }}
    />,
  );
  await screen.findByRole('textbox', { name: 'Markdown source' });
  const handle = ref.current;
  if (handle === null) {
    throw new Error('expected mounted editor handle');
  }
  const session = {
    documentId: 'document-1',
    handle,
    token: Symbol('editor-session'),
  };
  const commands = createDocumentCommands(
    session.documentId,
    session.token,
    () => session,
  );
  (mockRuntime.editor.executeEdits as jest.Mock).mockImplementation(
    (_source: string, edits: Array<{ text: string }>): void => {
      mockRuntime.props?.onChange?.(
        edits[0].text,
        {} as Parameters<NonNullable<EditorProps['onChange']>>[1],
      );
    },
  );

  commands.replaceRange(
    {
      start: { lineNumber: 1, column: 1 },
      end: { lineNumber: 1, column: 7 },
    },
    'range replacement',
  );
  commands.replaceAll('whole replacement');

  expect(mockRuntime.editor.executeEdits).toHaveBeenCalledTimes(2);
  expect(mockRuntime.editor.pushUndoStop).toHaveBeenCalledTimes(4);
  expect(updateBuffer).toHaveBeenNthCalledWith(
    1,
    'document-1',
    'range replacement',
  );
  expect(updateBuffer).toHaveBeenNthCalledWith(
    2,
    'document-1',
    'whole replacement',
  );
  expect(commands.getSelection()).toEqual({
    status: 'available',
    value: {
      start: { lineNumber: 1, column: 1 },
      end: { lineNumber: 1, column: 1 },
    },
  });
});

it('applies one undo edit through the normal buffer queue', async () => {
  const ref = { current: null as CodeEditorHandle | null };
  const updateBuffer = jest.fn<void, [string]>();
  mockRuntime.content = 'alpha beta\ngamma';
  (mockRuntime.editor.executeEdits as jest.Mock).mockImplementation(
    (_source: string, edits: Array<{ range: IRange; text: string }>): void => {
      const edit = edits[0];
      mockRuntime.content = edit.text;
      mockRuntime.props?.onChange?.(
        mockRuntime.content,
        {} as Parameters<NonNullable<EditorProps['onChange']>>[1],
      );
    },
  );

  render(
    <CodeEditor
      ref={ref}
      documentId="document-1"
      initialValue={mockRuntime.content}
      onChange={updateBuffer}
    />,
  );
  await screen.findByRole('textbox', { name: 'Markdown source' });

  expect(ref.current?.getContent()).toBe('alpha beta\ngamma');
  expect(
    ref.current?.replaceRange(
      {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 6 },
      },
      'delta',
    ),
  ).toBe(true);
  expect(ref.current?.replaceAll('whole replacement')).toBe(true);

  expect(mockRuntime.editor.executeEdits).toHaveBeenCalledTimes(2);
  expect(mockRuntime.editor.pushUndoStop).toHaveBeenCalledTimes(4);
  expect(updateBuffer).toHaveBeenNthCalledWith(1, 'delta');
  expect(updateBuffer).toHaveBeenNthCalledWith(2, 'whole replacement');
});

it('keeps replacement undo groups and complete-buffer callbacks at the Monaco boundary', async () => {
  const ref = { current: null as CodeEditorHandle | null };
  const updateBuffer = jest.fn<void, [string, string]>();
  const initialContent = 'alpha beta\ngamma';
  mockRuntime.content = initialContent;
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

  render(
    <CodeEditor
      ref={ref}
      documentId="document-1"
      initialValue={initialContent}
      onChange={(content: string): void => {
        updateBuffer('document-1', content);
      }}
    />,
  );
  await screen.findByRole('textbox', { name: 'Markdown source' });

  ref.current?.replaceRange(
    {
      start: { lineNumber: 1, column: 7 },
      end: { lineNumber: 1, column: 11 },
    },
    'delta',
  );
  ref.current?.replaceAll('whole\nreplacement');

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

/*
 * . Two `…` lint cases were removed here — the decoration's styling and
 * the decoration itself. The two Monaco geometry cases above them survive,
 * because the branches they pin survive.
 *
 * The decoration drew a wavy underline over a hardcoded range of a hardcoded
 * document id, so the harness photographed a lint finding no lint engine had
 * produced. That is a substitution, not a capture condition: the mockup shows a
 * squiggle under "exited", the fixture's misspellings are still there, and if
 * the application is to underline them a lint engine has to say so.
 *
 * The geometry branches were nearly deleted with it, on the reasoning that
 * excludes the Monaco interior from every variant so they pin pixels
 * nothing compares. A measurement said otherwise: removing them grew 's
 * `popup-antialiased-boundary` residual from 181 pixels to 239, because the
 * File popup composites over the editor and its antialiased edge blends against
 * whatever glyphs are behind it. An excluded *region* can still be load-bearing
 * for a comparison outside it — re-measure before trusting the exclusion.
 */
