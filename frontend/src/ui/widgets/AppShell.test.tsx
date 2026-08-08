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

const setUILayout = jest.fn(async (): Promise<void> => undefined);

jest.mock('../../logic/adapter', () => ({
  appModelAdapter: { setUILayout },
}));

jest.mock('./EditorView', () => ({
  __esModule: true,
  default: (): React.JSX.Element => <p>Existing document consumer</p>,
}));

import {
  hydrateProjection,
  resetProjection,
} from '../../logic/store/appModelProjectionActions';
import type { UILayout } from '../../logic/store/appModelTypes';
import { store } from '../../logic/store';
import { notifyError } from '../../logic/store/notificationsSlice';
import AppShell from './AppShell';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

function pointerEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  pointerId: number,
): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    pointerId: { value: pointerId },
  });
  return event;
}

function renderShell(layout: UILayout = {}): void {
  store.dispatch(
    hydrateProjection({
      revision: 1,
      documents: {},
      activeDocumentId: '',
      ui: layout,
    }),
  );
  render(
    <Provider store={store}>
      <AppShell />
    </Provider>,
  );
}

beforeEach((): void => {
  store.dispatch(resetProjection());
  setUILayout.mockClear();
});

afterEach((): void => {
  store.dispatch(resetProjection());
});

it('FR-WS-007 keeps workspace and document regions while the reserved Assistant track has no surface', () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  expect(
    screen.getByRole('complementary', { name: 'Workspace' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('main', { name: 'Document area' })).toHaveTextContent(
    'Existing document consumer',
  );
  expect(screen.queryByLabelText(/assistant/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/assistant/i)).not.toBeInTheDocument();
  expect(screen.getByTestId('application-shell')).toHaveAttribute(
    'data-document-state',
    'empty',
  );

  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const tokens = readSource('src/ui/styles/tokens.css');
  expect(shellStyles).toMatch(
    /grid-template-areas:\s*['"]workspace divider document assistant['"]/,
  );
  expect(tokens).toContain('--shell-assistant-collapsed-width: 0;');
  expect(tokens).not.toContain('--shell-assistant-visible-width');
});

it('FR-WS-007 preserves the zero-width Assistant track at the 375px breakpoint', () => {
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const narrowShellRule = shellStyles.match(
    /@media \(max-width:\s*376px\)\s*\{\s*\.shell\s*\{([^}]*)\}/,
  )?.[1];

  expect(narrowShellRule).toBeDefined();
  expect(narrowShellRule).toMatch(/display:\s*grid/);
  expect(narrowShellRule).toMatch(
    /grid-template-areas:\s*['"]workspace document assistant['"]/,
  );
  expect(narrowShellRule).toMatch(
    /grid-template-columns:\s*0\s+minmax\(0,\s*1fr\)\s+var\(--shell-assistant-collapsed-width\)/,
  );
});

it('FR-WS-008 renders an immediate non-durable divider width while sending the durable intent to Go', () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  const shell = screen.getByTestId('application-shell');
  expect(shell).toHaveAttribute('data-workspace-visible', 'true');
  expect(shell).toHaveStyle({ '--shell-left-width': '288px' });

  const divider = screen.getByRole('separator', {
    name: 'Resize workspace',
  });
  fireEvent(divider, pointerEvent('pointerdown', 288, 7));
  fireEvent(window, pointerEvent('pointermove', 320, 7));
  fireEvent(window, pointerEvent('pointerup', 320, 7));

  expect(setUILayout).toHaveBeenCalledWith({ sidebarWidth: 320 });
  expect(shell).toHaveStyle({ '--shell-left-width': '320px' });
});

it('FR-WS-012 restores the last acknowledged divider width after its delayed layout write fails', async () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  const shell = screen.getByTestId('application-shell');
  const divider = screen.getByRole('separator', {
    name: 'Resize workspace',
  });
  fireEvent(divider, pointerEvent('pointerdown', 288, 7));
  fireEvent(window, pointerEvent('pointermove', 320, 7));
  fireEvent(window, pointerEvent('pointerup', 320, 7));
  expect(shell).toHaveStyle({ '--shell-left-width': '320px' });

  act(() => {
    store.dispatch(
      notifyError({
        code: 'io',
        title: 'File operation failed',
        message: 'The file operation could not be completed.',
        details: { operation: 'update layout' },
        retryable: true,
      }),
    );
  });

  await waitFor(() => {
    expect(shell).toHaveStyle({ '--shell-left-width': '288px' });
  });
});

it('FR-WS-017 keeps the workspace divider keyboard reachable and requests fixed width steps', () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  const divider = screen.getByRole('separator', {
    name: 'Resize workspace',
  });
  divider.focus();
  expect(divider).toHaveFocus();

  fireEvent.keyDown(divider, { key: 'ArrowRight' });
  expect(setUILayout).toHaveBeenLastCalledWith({ sidebarWidth: 304 });

  fireEvent.keyDown(divider, { key: 'ArrowLeft' });
  expect(setUILayout).toHaveBeenLastCalledWith({ sidebarWidth: 288 });
});

it('FR-WS-008 uses exact responsive presentations without durable responsive write-back', () => {
  renderShell({ sidebarVisible: true, sidebarWidth: 288 });

  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 768,
  });
  fireEvent(window, new Event('resize'));
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  fireEvent(window, new Event('resize'));

  expect(setUILayout).not.toHaveBeenCalled();

  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const editorStyles = readSource('src/ui/widgets/EditorView.module.css');
  const baseStyles = readSource('src/ui/styles/base.css');
  expect(shellStyles).toMatch(
    /@media \(max-width:\s*768px\)[\s\S]*grid-template-columns:\s*46px/,
  );
  expect(shellStyles).toMatch(
    /@media \(max-width:\s*376px\)[\s\S]*width:\s*230px/,
  );
  expect(editorStyles).toMatch(
    /@media \(max-width:\s*376px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  expect(editorStyles).toMatch(/\.toolbar\s*\{[^}]*flex-wrap:\s*nowrap/s);
  expect(baseStyles).toMatch(/overflow-x:\s*hidden/);
});

it('FR-WS-017 and FR-WS-020 keep shell styles tokenized and production surfaces honest', () => {
  const shellSource = readSource('src/ui/widgets/AppShell.tsx');
  const shellStyles = readSource('src/ui/widgets/AppShell.module.css');
  const appSource = readSource('src/App.tsx');
  const actionSource = readSource('src/logic/actions/shellActions.ts');

  expect(shellSource).toContain("t('shell.workspace')");
  expect(shellSource).toContain("t('shell.document')");
  expect(shellStyles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
  for (const source of [shellSource, appSource, actionSource]) {
    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/,
    );
    expect(source).not.toMatch(/https?:\/\//);
  }
  expect(actionSource).not.toMatch(/['"](?:file|new|open|recent|assistant)/i);
  expect(shellSource).not.toMatch(/aria-label=['"]Assistant['"]/i);
  expect(shellSource).not.toMatch(/(?:tablist|tabpanel|role=['"]tab['"])/i);
});
