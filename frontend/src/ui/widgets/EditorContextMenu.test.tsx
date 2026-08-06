import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider } from 'react-redux';

import { getAction } from '../../logic/actions/actionRegistry';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import { store } from '../../logic/store';
import { hydrateSettings } from '../../logic/store/settingsSlice';
import EditorContextMenu from './EditorContextMenu';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(<Provider store={store}>{ui}</Provider>);

it('T030 derives the exact context-menu order and surface-specific inventory', () => {
  render(
    <EditorContextMenu>
      <textarea aria-label="Markdown source" />
    </EditorContextMenu>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'), {
    clientX: 20,
    clientY: 30,
  });

  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual([
    'Cut',
    'Copy',
    'Paste',
    'Paste as plain text',
    'Bold',
    'Italic',
    'Link',
    'Format document',
    'Compact',
    'Command palette',
  ]);
  expect(
    screen.queryByRole('menuitem', { name: 'Lint' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('menuitem', { name: 'Heading 1' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('menuitem', { name: 'Format document' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('menuitem', { name: 'Command palette' }),
  ).toBeDisabled();
});

it('T071 clamps context-menu placement and uses the selection captured at opening', async () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 320,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 240,
  });
  const bounds = jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 280, 200));
  const commands = {
    getContent: jest.fn(() => ({
      status: 'available' as const,
      value: 'word',
    })),
    getSelection: jest
      .fn()
      .mockReturnValueOnce({
        status: 'available' as const,
        value: {
          start: { lineNumber: 1, column: 1 },
          end: { lineNumber: 1, column: 5 },
        },
      })
      .mockReturnValue({
        status: 'available' as const,
        value: {
          start: { lineNumber: 1, column: 3 },
          end: { lineNumber: 1, column: 3 },
        },
      }),
    replaceRange: jest.fn(() => ({
      status: 'available' as const,
      value: undefined,
    })),
    replaceAll: jest.fn(),
  };
  render(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <DocumentCommandContext.Provider value={commands}>
        <EditorContextMenu>
          <textarea aria-label="Markdown source" />
        </EditorContextMenu>
      </DocumentCommandContext.Provider>
    </EditorSessionContext.Provider>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'), {
    clientX: 300,
    clientY: 220,
  });
  expect(screen.getByRole('menu')).toHaveStyle({ left: '32px', top: '12px' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Bold' }));
  await waitFor(() =>
    expect(commands.replaceRange).toHaveBeenCalledWith(
      expect.anything(),
      '**word**',
      expect.anything(),
    ),
  );
  bounds.mockRestore();
});

it('T089 measures the rendered context menu and flips it above a lower viewport pointer', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 320,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 480,
  });
  const bounds = jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 280, 300));

  render(
    <EditorContextMenu>
      <textarea aria-label="Markdown source" />
    </EditorContextMenu>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'), {
    clientX: 300,
    clientY: 460,
  });

  expect(screen.getByRole('menu')).toHaveStyle({
    left: '32px',
    top: '152px',
  });
  bounds.mockRestore();
});

it('T030 keeps the originating session callback available without tab or assistant state', () => {
  const onAction = jest.fn();
  render(
    <EditorContextMenu onAction={onAction}>
      <textarea aria-label="Markdown source" />
    </EditorContextMenu>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Bold' }));
  expect(onAction).toHaveBeenCalledWith('bold');
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Assistant' }),
  ).not.toBeInTheDocument();
});

it('keeps a context-menu formatting action mounted through pointer activation', () => {
  const onAction = jest.fn();
  render(
    <EditorContextMenu onAction={onAction}>
      <textarea aria-label="Markdown source" />
    </EditorContextMenu>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'));
  const bold = screen.getByRole('menuitem', { name: 'Bold' });
  fireEvent.pointerDown(bold);
  fireEvent.click(bold);

  expect(onAction).toHaveBeenCalledWith('bold');
});

it('T047 renders platform-resolved accelerator metadata for context actions', () => {
  render(
    <EditorContextMenu>
      <textarea aria-label="Markdown source" />
    </EditorContextMenu>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'));
  expect(screen.getByRole('menuitem', { name: 'Bold' })).toHaveAttribute(
    'aria-keyshortcuts',
    formatShortcut(getAction('bold').shortcut ?? '', currentPlatform()),
  );
  expect(
    screen.getByRole('menuitem', { name: 'Format document' }),
  ).toHaveAttribute(
    'aria-keyshortcuts',
    formatShortcut(getAction('format').shortcut ?? '', currentPlatform()),
  );
});

it('T044 passes acknowledged marker preferences into context formatting', () => {
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
          <EditorContextMenu>
            <textarea aria-label="Markdown source" />
          </EditorContextMenu>
        </DocumentCommandContext.Provider>
      </EditorSessionContext.Provider>
    </Provider>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Italic' }));

  expect(replaceRange).toHaveBeenCalledWith(
    expect.anything(),
    '_word_',
    expect.anything(),
  );
});

function clipboardCommands() {
  return {
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
    replaceRange: jest.fn(() => ({
      status: 'available' as const,
      value: undefined,
    })),
    replaceAll: jest.fn(),
  };
}

function installExecCommand(result: boolean): jest.Mock<boolean, [string]> {
  const execCommand = jest.fn<boolean, [string]>(() => result);
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: execCommand,
  });
  return execCommand;
}

it('T059 reports a rejected native clipboard command as unavailable', async () => {
  const execCommand = installExecCommand(false);
  const onActionResult = jest.fn();
  const commands = clipboardCommands();

  render(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <DocumentCommandContext.Provider value={commands}>
        <EditorContextMenu onActionResult={onActionResult}>
          <textarea aria-label="Markdown source" />
        </EditorContextMenu>
      </DocumentCommandContext.Provider>
    </EditorSessionContext.Provider>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));

  await waitFor(() => {
    expect(onActionResult).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'copy', status: 'unavailable' }),
    );
  });
  expect(execCommand).toHaveBeenCalledWith('copy');
  expect(commands.replaceRange).not.toHaveBeenCalled();
});

it('T059 preserves native clipboard ownership and reports successful copy', async () => {
  const execCommand = installExecCommand(true);
  const onActionResult = jest.fn();
  const commands = clipboardCommands();

  render(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <DocumentCommandContext.Provider value={commands}>
        <EditorContextMenu onActionResult={onActionResult}>
          <textarea aria-label="Markdown source" />
        </EditorContextMenu>
      </DocumentCommandContext.Provider>
    </EditorSessionContext.Provider>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));

  await waitFor(() => {
    expect(onActionResult).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'copy', status: 'mutated' }),
    );
  });
  expect(execCommand).toHaveBeenCalledWith('copy');
  expect(commands.replaceRange).not.toHaveBeenCalled();
});

it('T059 uses navigator clipboard text for genuine paste-as-plain-text', async () => {
  const clipboard = { readText: jest.fn(async () => 'plain text') };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });
  const onActionResult = jest.fn();
  const commands = clipboardCommands();

  render(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <DocumentCommandContext.Provider value={commands}>
        <EditorContextMenu onActionResult={onActionResult}>
          <textarea aria-label="Markdown source" />
        </EditorContextMenu>
      </DocumentCommandContext.Provider>
    </EditorSessionContext.Provider>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'));
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Paste as plain text' }),
  );

  await waitFor(() => {
    expect(onActionResult).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'paste-plain', status: 'mutated' }),
    );
  });
  expect(clipboard.readText).toHaveBeenCalledTimes(1);
  expect(commands.replaceRange).toHaveBeenCalledWith(
    {
      start: { lineNumber: 1, column: 1 },
      end: { lineNumber: 1, column: 5 },
    },
    'plain text',
  );
});

it('T059 keeps failed plain-text reads from mutating the document', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: jest.fn(async () => Promise.reject(new Error('denied'))),
    },
  });
  const onActionResult = jest.fn();
  const commands = clipboardCommands();

  render(
    <EditorSessionContext.Provider
      value={{ documentId: 'doc-1', content: 'word' }}
    >
      <DocumentCommandContext.Provider value={commands}>
        <EditorContextMenu onActionResult={onActionResult}>
          <textarea aria-label="Markdown source" />
        </EditorContextMenu>
      </DocumentCommandContext.Provider>
    </EditorSessionContext.Provider>,
  );

  fireEvent.contextMenu(screen.getByLabelText('Markdown source'));
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Paste as plain text' }),
  );

  await waitFor(() => {
    expect(onActionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'paste-plain',
        reason: 'unsupported',
        status: 'unavailable',
      }),
    );
  });
  expect(commands.replaceRange).not.toHaveBeenCalled();
});
