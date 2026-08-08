import {
  createEvent,
  fireEvent,
  render as rtlRender,
  screen,
} from '@testing-library/react';
import { Provider } from 'react-redux';

import * as actionDispatcher from '../../logic/actions/actionDispatcher';
import { store } from '../../logic/store';
import { hydrateSettings } from '../../logic/store/settingsSlice';
import { DocumentCommandContext } from './editorSession';
import { EditorSessionContext } from './editorSession';
import EditorChrome from './EditorChrome';
import { ModalStateProvider } from './modalState';

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(<Provider store={store}>{ui}</Provider>);

it('T018 renders the complete toolbar groups and a real tab surface', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);

  expect(
    screen.getByRole('tablist', { name: 'Document tabs' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New tab' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Heading 1' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Numbered list' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Format' })).toBeDisabled();
});

it('T068 uses icon-first toolbar controls while retaining localized accessible names', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);

  const bold = screen.getByRole('button', { name: 'Bold' });
  expect(bold).toHaveAttribute('data-icon', 'bold');
  expect(bold).not.toHaveTextContent('Bold');
  expect(screen.getByRole('button', { name: 'Format' })).toHaveTextContent(
    'Format',
  );
});

it('T072 scopes overflow relocation to the documented 768 and 375 width groups', () => {
  const { container } = render(
    <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
  );
  fireEvent.click(
    container.querySelector('summary[aria-label="More actions"]')!,
  );
  expect(
    document.body.querySelector('[class*="overflowAt768"]'),
  ).not.toBeNull();
  expect(
    document.body.querySelector('[class*="overflowAt375"]'),
  ).not.toBeNull();
  expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(2);
});

it('T070 closes the toolbar overflow on Escape and outside pointer input', () => {
  const { container } = render(
    <>
      <button type="button">Outside</button>
      <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />
    </>,
  );
  const trigger = container.querySelector(
    'summary[aria-label="More actions"]',
  ) as HTMLElement;

  fireEvent.click(trigger);
  expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(2);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(1);
  expect(trigger).toHaveFocus();

  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
  expect(screen.getAllByRole('button', { name: 'Link' })).toHaveLength(1);
});

it('T094 renders toolbar overflow as a body-owned viewport popup', () => {
  const { container } = render(
    <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
  );
  const trigger = container.querySelector(
    'summary[aria-label="More actions"]',
  ) as HTMLElement;

  fireEvent.click(trigger);

  const popup = screen.getByRole('menu', { name: 'More actions' });
  expect(popup.parentElement).toBe(document.body);
  expect(popup).toHaveAttribute('data-viewport-popup', 'editor-overflow');
  expect(popup).toHaveStyle({ position: 'fixed' });
});

it('T095 keeps the Editor-stage semantic action signature independent of palette', () => {
  const palettes = [
    ['glass', 'light'],
    ['glass', 'dark'],
    ['material', 'light'],
    ['material', 'dark'],
    ['minimal', 'light'],
    ['minimal', 'dark'],
  ] as const;
  let signature: string[] | undefined;

  for (const [theme, mode] of palettes) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode', mode);
    const rendered = render(
      <EditorChrome arrangement="split" onArrangementChange={jest.fn()} />,
    );
    const current = Array.from(
      rendered.container.querySelectorAll(
        '[role="toolbar"] button, [role="radiogroup"] button',
      ),
    ).map((button) => {
      const control = button as HTMLButtonElement;
      const actionId = button.getAttribute('data-action-id');
      if (actionId === null) {
        throw new Error(
          'Editor-stage controls must expose registry action IDs',
        );
      }
      return [
        actionId,
        button.getAttribute('aria-label') ?? '',
        button.getAttribute('aria-checked') ?? '',
        control.disabled ? 'disabled' : 'enabled',
      ].join('|');
    });
    if (signature === undefined) signature = current;
    expect(current).toEqual(signature);
    rendered.unmount();
  }
});

it('T068 exposes active arrangement state and explicit icon metadata', () => {
  render(<EditorChrome arrangement="split" onArrangementChange={jest.fn()} />);
  expect(screen.getByRole('radio', { name: 'Split' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Quote' })).toHaveAttribute(
    'data-icon',
    'quote',
  );
});

it('T018 keeps the Assistant deferred while exposing real tab controls', () => {
  const invoke = jest.fn();
  render(
    <DocumentCommandContext.Provider value={null}>
      <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
    </DocumentCommandContext.Provider>,
  );

  expect(screen.getByRole('button', { name: 'New tab' })).toBeEnabled();
  expect(invoke).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('region', { name: 'Assistant' }),
  ).not.toBeInTheDocument();
});

it('T091 renders the text-labelled arrangement island in the toolbar', () => {
  render(<EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />);

  expect(screen.getByRole('radio', { name: 'Editor' })).toHaveTextContent(
    'Editor',
  );
  expect(screen.getByRole('radio', { name: 'Split' })).toHaveTextContent(
    'Split',
  );
});

it('T050 keeps the tab-strip New affordance available', () => {
  render(<EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />);

  expect(screen.getByRole('button', { name: 'New tab' })).toBeEnabled();
});

it('preserves the editor selection when a toolbar format button is pressed', () => {
  const commands = {
    getContent: jest.fn(() => ({
      status: 'available' as const,
      value: 'hello',
    })),
    getSelection: jest.fn(() => ({
      status: 'available' as const,
      value: {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 6 },
      },
    })),
    replaceRange: jest.fn(() => ({
      status: 'available' as const,
      value: undefined,
    })),
    replaceAll: jest.fn(() => ({
      status: 'available' as const,
      value: undefined,
    })),
  };

  render(
    <DocumentCommandContext.Provider value={commands}>
      <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
    </DocumentCommandContext.Provider>,
  );

  const bold = screen.getByRole('button', { name: 'Bold' });
  const pointerDown = createEvent.mouseDown(bold);
  fireEvent(bold, pointerDown);

  expect(pointerDown.defaultPrevented).toBe(true);
});

it('T044 passes acknowledged marker preferences into toolbar formatting', async () => {
  const replaceRange = jest.fn(() => ({
    status: 'available' as const,
    value: undefined,
  }));
  const commands = {
    getContent: jest.fn(() => ({
      status: 'available' as const,
      value: 'word',
    })),
    getSelection: jest.fn(() => ({
      status: 'available' as const,
      value: {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
      },
    })),
    replaceRange,
    replaceAll: jest.fn(),
  };

  store.dispatch(
    hydrateSettings({
      appearance: {
        theme: 'material',
        mode: 'auto',
        defaultOpenMode: 'editor',
      },
      markdown: {
        standard: 'gfm',
        formatOnSave: false,
        lintOnSave: false,
        bulletMarker: '*',
        emphasisMarker: '_',
        headingStyle: 'atx',
      },
      contentPrivacy: { remotePolicy: 'ask' },
      editor: { lineNumbers: true, wordWrap: false, fontSize: 14 },
    }),
  );
  render(
    <Provider store={store}>
      <EditorSessionContext.Provider
        value={{ documentId: 'doc-1', content: 'word' }}
      >
        <DocumentCommandContext.Provider value={commands}>
          <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
        </DocumentCommandContext.Provider>
      </EditorSessionContext.Provider>
    </Provider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Italic' }));

  await expect(replaceRange).toHaveBeenCalledWith(
    expect.anything(),
    '_word_',
    expect.anything(),
  );
});

it('T043 routes deferred editor shortcuts through the typed dispatcher', () => {
  const dispatch = jest
    .spyOn(actionDispatcher, 'dispatchAction')
    .mockResolvedValue({
      status: 'unavailable',
      actionId: 'format',
      reason: 'deferred',
    });
  const commands = {
    getContent: jest.fn(() => ({
      status: 'available' as const,
      value: 'word',
    })),
    getSelection: jest.fn(() => ({
      status: 'available' as const,
      value: {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
      },
    })),
    replaceRange: jest.fn(),
    replaceAll: jest.fn(),
  };

  const { container } = render(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <DocumentCommandContext.Provider value={commands}>
        <div data-editor-surface="true" tabIndex={0}>
          <EditorChrome arrangement="editor" onArrangementChange={jest.fn()} />
        </div>
      </DocumentCommandContext.Provider>
    </EditorSessionContext.Provider>,
  );

  const editorSurface = container.querySelector(
    '[data-editor-surface]',
  ) as HTMLElement | null;
  if (editorSurface === null) throw new Error('editor surface not rendered');
  editorSurface.focus();
  fireEvent.keyDown(editorSurface, {
    altKey: true,
    key: 'f',
    shiftKey: true,
  });

  expect(dispatch).toHaveBeenCalledWith(
    'format',
    expect.objectContaining({ editorFocused: true }),
  );
  dispatch.mockRestore();
});

it('T058 suppresses editor shortcuts while the Shortcuts dialog modal state is active', () => {
  const commands = {
    getContent: jest.fn(() => ({
      status: 'available' as const,
      value: 'word',
    })),
    getSelection: jest.fn(() => ({
      status: 'available' as const,
      value: {
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 5 },
      },
    })),
    replaceRange: jest.fn(),
    replaceAll: jest.fn(),
  };

  const { container } = render(
    <ModalStateProvider modalOpen>
      <EditorSessionContext.Provider
        value={{ documentId: 'doc-1', content: 'word' }}
      >
        <DocumentCommandContext.Provider value={commands}>
          <div data-editor-surface tabIndex={0}>
            <EditorChrome
              arrangement="editor"
              onArrangementChange={jest.fn()}
            />
          </div>
        </DocumentCommandContext.Provider>
      </EditorSessionContext.Provider>
    </ModalStateProvider>,
  );

  const editorSurface = container.querySelector(
    '[data-editor-surface]',
  ) as HTMLElement | null;
  if (editorSurface === null) throw new Error('editor surface not rendered');
  editorSurface.focus();
  fireEvent.keyDown(editorSurface, {
    code: 'KeyB',
    key: 'b',
    ctrlKey: true,
  });

  expect(commands.getContent).not.toHaveBeenCalled();
  expect(commands.replaceRange).not.toHaveBeenCalled();
});
