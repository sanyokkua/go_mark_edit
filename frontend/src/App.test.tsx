import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('./ui/widgets/AppShell', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { EditorSessionContext } = jest.requireActual<
    typeof import('./ui/widgets/editorSession')
  >('./ui/widgets/editorSession');

  const AppShell = (): React.JSX.Element => {
    const activeBuffer = React.useContext(EditorSessionContext);

    return React.createElement(
      React.Fragment,
      undefined,
      React.createElement('aside', { 'aria-label': 'Workspace' }),
      React.createElement('main', { 'aria-label': 'Document area' }),
      React.createElement(
        'output',
        { 'aria-label': 'Active editor buffer' },
        activeBuffer?.content ?? '',
      ),
    );
  };

  return { __esModule: true, default: AppShell };
});

jest.mock('./ui/widgets/EditorView', () => ({
  __esModule: true,
  default: (): React.JSX.Element => (
    <section aria-label="Existing document surface">
      Existing document surface
    </section>
  ),
}));

jest.mock('./logic/adapter', () => ({
  applicationAdapter: { retryStartup: jest.fn(async () => undefined) },
  windowAdapter: { windowReady: jest.fn(async () => undefined) },
  settingsAdapter: {
    getSettings: jest.fn(async () => ({
      appearance: {
        defaultOpenMode: 'editor',
        mode: 'auto',
        theme: 'material',
      },
      contentPrivacy: { remotePolicy: 'ask' },
      markdown: {
        bulletMarker: '-',
        emphasisMarker: '*',
        formatOnSave: false,
        headingStyle: 'atx',
        lintOnSave: false,
        standard: 'gfm',
      },
    })),
    updateAppearance: jest.fn(async () => undefined),
  },
  appModelAdapter: {
    getState: jest.fn(async () => ({
      snapshot: {
        revision: 12,
        applicationVersion: 'dev',
        documents: {
          'document-1': {
            documentId: 'document-1',
            title: 'One',
            path: '/documents/one.md',
            dirty: false,
            encoding: 'utf-8',
            lineEnding: 'lf',
            wordCount: 1,
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
          },
        },
        activeDocumentId: 'document-1',
        ui: { sidebarVisible: true },
      },
      activeBuffer: { documentId: 'document-1', content: 'ephemeral buffer' },
    })),
    updateBuffer: jest.fn(),
    setDocView: jest.fn(),
    setUILayout: jest.fn(),
    subscribeStatePatches: jest.fn(() => jest.fn()),
  },
}));

jest.mock('./ui/widgets/StartupFailure', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ActualStartupFailure = jest.requireActual<
    typeof import('./ui/widgets/StartupFailure')
  >('./ui/widgets/StartupFailure').default;

  const StartupFailure = (props: {
    isRetrying: boolean;
    onRetry: () => void;
  }): React.JSX.Element => {
    const harness = globalThis as typeof globalThis & {
      story027DoubleRetryHarness?: boolean;
    };
    if (harness.story027DoubleRetryHarness) {
      return React.createElement(
        'button',
        {
          type: 'button',
          onClick: (): void => {
            props.onRetry();
            props.onRetry();
          },
        },
        'Retry twice',
      );
    }
    return React.createElement(ActualStartupFailure, props);
  };

  return { __esModule: true, default: StartupFailure };
});

import App from './App';
import {
  bootstrapAppModelProjection,
  disposeAppModelProjection,
} from './logic/store/appModelProjection';
import {
  hydrateProjection,
  resetProjection,
} from './logic/store/appModelProjectionActions';
import { store } from './logic/store';
import { dismissNotification } from './logic/store/notificationsSlice';
import type { WireError } from './logic/utils/parseError';
import {
  createAppModelAdapter,
  type AppModelBindings,
  type AppModelAdapter,
  type AppModelRuntime,
} from './logic/adapter/appModelAdapter';
import { createShellActionCatalogue } from './logic/actions/shellActions';
import { appModelAdapter, applicationAdapter } from './logic/adapter';
import type { AppModelState } from './logic/store/appModelTypes';
import AppShell from './ui/widgets/AppShell';
import ShellMenuRow from './ui/widgets/ShellMenuRow';
import type { SettingsMenuProps } from './ui/widgets/SettingsMenu';

const mockedAppModelAdapter = appModelAdapter as jest.Mocked<AppModelAdapter>;
const mockedApplicationAdapter = applicationAdapter as jest.Mocked<
  typeof applicationAdapter
>;

function bootstrapState(
  content: string,
  revision: number,
  applicationVersion = 'test-build',
): AppModelState {
  return {
    snapshot: {
      revision,
      applicationVersion,
      documents: {
        'document-1': {
          documentId: 'document-1',
          title: 'One',
          path: '/documents/one.md',
          dirty: false,
          encoding: 'utf-8',
          lineEnding: 'lf',
          wordCount: 1,
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
        },
      },
      activeDocumentId: 'document-1',
      ui: { sidebarVisible: true },
    },
    activeBuffer: { documentId: 'document-1', content },
  };
}

it('STORY-001-AC-2 renders the blank application root', async () => {
  render(<App />);

  expect(await screen.findByRole('main')).toBeEmptyDOMElement();
  expect(
    await screen.findByRole('button', { name: 'Settings' }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole('button', { name: 'About' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/greet|hello|markdown|document|file/i),
  ).not.toBeInTheDocument();
  act((): void => disposeAppModelProjection());
});

// Proves: STORY-007-AC-1
it('STORY-007-AC-1 preserves the collapsed three-region shell', async () => {
  const { unmount } = render(<App />);

  expect(
    await screen.findByRole('complementary', { name: 'Workspace' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Document area' }),
  ).toBeEmptyDOMElement();
  expect(screen.queryByLabelText('Assistant')).not.toBeInTheDocument();

  unmount();

  render(<AppShell />);
  expect(screen.queryByLabelText('Assistant')).not.toBeInTheDocument();
  expect(
    screen.getByRole('complementary', { name: 'Workspace' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Document area' }),
  ).toBeInTheDocument();
});

// Proves: STORY-007-AC-3
it('STORY-007-AC-3 keeps the reserved region free of an Assistant surface', () => {
  render(<AppShell />);

  expect(screen.queryByLabelText('Assistant')).not.toBeInTheDocument();

  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/AppShell.tsx'),
    'utf8',
  );

  expect(shellSource).not.toMatch(
    /from\s+['"][^'"]*(?:logic\/adapter|wailsjs)[^'"]*['"]/,
  );
  expect(shellSource).not.toMatch(/\b(?:fetch|XMLHttpRequest)\b/);
});

it('FR-WS-020 keeps the real shell limited to Settings, View, About, and its document surface at desktop and 375px widths', () => {
  const RealAppShell = jest.requireActual<
    typeof import('./ui/widgets/AppShell')
  >('./ui/widgets/AppShell').default;
  const settingsMenuProps: SettingsMenuProps = {
    mode: 'auto',
    onModeChange: jest.fn(),
    onOpenAppearance: jest.fn(),
    onThemeChange: jest.fn(),
    theme: 'material',
  };
  const viewMenuProps = {
    editorVisible: true,
    onEditorVisibilityChange: jest.fn(),
    onPreviewVisibilityChange: jest.fn(),
    previewVisible: true,
  };
  const assertFutureSurfacesAbsent = (): void => {
    for (const name of [
      'File',
      'New',
      'Open',
      'Launcher',
      'Recent',
      'Recents',
      'Assistant',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name })).not.toBeInTheDocument();
    }
    expect(
      screen.queryByText(/no documents? (?:open|yet)/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: /assistant/i }),
    ).not.toBeInTheDocument();
  };
  const renderRealShell = (): ReturnType<typeof render> =>
    render(
      <Provider store={store}>
        <ShellMenuRow
          modalOpen={false}
          onAbout={jest.fn()}
          settingsMenuProps={settingsMenuProps}
          viewMenuProps={viewMenuProps}
        />
        <RealAppShell />
      </Provider>,
    );

  store.dispatch(
    hydrateProjection({
      revision: 31,
      documents: {},
      activeDocumentId: '',
      ui: { sidebarVisible: true },
    }),
  );

  const desktop = renderRealShell();
  expect(screen.getByRole('main', { name: 'Document area' })).toContainElement(
    screen.getByRole('region', { name: 'Existing document surface' }),
  );
  expect(
    within(screen.getByRole('navigation', { name: 'Application actions' }))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Settings', 'View', 'About']);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual(['Appearance']);
  assertFutureSurfacesAbsent();

  fireEvent.keyDown(screen.getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });
  const viewMenu = screen.getByRole('menu', { name: 'View' });
  expect(
    within(viewMenu)
      .getAllByRole('menuitemcheckbox')
      .map((item) => item.textContent),
  ).toEqual(['Show Editor', 'Show Preview']);
  for (const name of [
    'File',
    'New',
    'Open',
    'Launcher',
    'Recent',
    'Recents',
    'Assistant',
  ]) {
    expect(
      within(viewMenu).queryByRole('menuitemcheckbox', { name }),
    ).not.toBeInTheDocument();
    expect(
      within(viewMenu).queryByRole('menuitem', { name }),
    ).not.toBeInTheDocument();
  }
  fireEvent.keyDown(viewMenu, { key: 'Escape' });

  desktop.unmount();
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 375,
  });
  renderRealShell();
  fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), {
    key: 'ArrowDown',
  });
  expect(
    screen.getAllByRole('menuitem').map((item) => item.textContent),
  ).toEqual(['Settings', 'View', 'About']);
  assertFutureSurfacesAbsent();

  store.dispatch(resetProjection());
  store.dispatch(
    hydrateProjection(bootstrapState('ephemeral buffer', 12).snapshot),
  );
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1024,
  });
});

it('FR-WS-020 exposes exactly the current shell action catalogue', () => {
  const actions = createShellActionCatalogue({
    modalOpen: false,
    viewAvailable: true,
    openSettings: jest.fn(),
    openView: jest.fn(),
    openAbout: jest.fn(),
    toggleFullscreen: jest.fn(async (): Promise<boolean> => true),
  });

  expect(actions.map((action) => action.id)).toEqual([
    'settings',
    'view',
    'about',
    'fullscreen',
  ]);
});

it('STORY-012-AC-7 hands the active buffer to ephemeral editor session state', async () => {
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  await waitFor((): void => {
    expect(
      screen.getByRole('status', { name: 'Active editor buffer' }),
    ).toHaveTextContent('ephemeral buffer');
  });

  expect(store.getState().documents).toMatchObject({
    revision: 12,
    byId: {
      'document-1': expect.not.objectContaining({ content: expect.anything() }),
    },
  });
  expect(store.getState().ui).toMatchObject({
    revision: 12,
    layout: { sidebarVisible: true },
  });
  expect(JSON.stringify(store.getState())).not.toContain('ephemeral buffer');
  expect(localStorage).toHaveLength(1);
  expect(localStorage.getItem('gme.theme')).toBe(
    JSON.stringify({ version: 1, theme: 'material', mode: 'auto' }),
  );
});

it('FR-WS-019 opens About through the catalogue with the backend-projected build identity', async () => {
  act((): void => disposeAppModelProjection());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValueOnce(
    bootstrapState('', 19, '9.8.7-test+injected'),
  );
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'About' }));
  expect(
    screen.getByRole('dialog', { name: 'About GoMarkEdit' }),
  ).toHaveTextContent('Version 9.8.7-test+injected');
});

it('STORY-012-AC-8 keeps bootstrap safe when GetState fails', async () => {
  disposeAppModelProjection();
  const wireError = {
    code: 'internal',
    title: 'Backend unavailable',
    message: 'The application state could not be read.',
    retryable: true,
  } satisfies WireError;
  const disposePatchListener = jest.fn();
  const runtime: AppModelRuntime = {
    eventsOn: jest.fn(() => disposePatchListener),
  };
  const errorEnvelopeBindings: AppModelBindings = {
    getState: async () => ({ error: wireError }),
    updateBuffer: async () => ({}),
    setDocView: async () => ({}),
    setUILayout: async () => ({}),
  };
  const rawRejectionBindings: AppModelBindings = {
    ...errorEnvelopeBindings,
    getState: async (): Promise<never> => Promise.reject(wireError),
  };
  const errorEnvelopeAdapter = createAppModelAdapter(
    errorEnvelopeBindings,
    runtime,
  );

  await expect(
    bootstrapAppModelProjection(errorEnvelopeAdapter),
  ).resolves.toEqual({
    status: 'failed',
  });

  expect(runtime.eventsOn).toHaveBeenCalledTimes(2);
  expect(disposePatchListener).toHaveBeenCalledTimes(2);
  expect(store.getState().documents).toMatchObject({ revision: -1, byId: {} });
  expect(store.getState().ui).toEqual({ revision: -1, layout: {} });
  expect(store.getState().notifications.items).toEqual([
    expect.objectContaining({ error: wireError }),
  ]);

  for (const notification of store.getState().notifications.items) {
    store.dispatch(dismissNotification(notification.id));
  }

  disposeAppModelProjection();
  await expect(
    bootstrapAppModelProjection(
      createAppModelAdapter(rawRejectionBindings, runtime),
    ),
  ).resolves.toEqual({ status: 'failed' });
  expect(store.getState().notifications.items).toEqual([
    expect.objectContaining({ error: wireError }),
  ]);

  for (const notification of store.getState().notifications.items) {
    store.dispatch(dismissNotification(notification.id));
  }
});

it('STORY-027-AC-1 retries the production failure UI and hands off the active buffer', async () => {
  disposeAppModelProjection();
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  const firstDisposer = jest.fn();
  const retryDisposer = jest.fn();
  mockedAppModelAdapter.getState
    .mockRejectedValueOnce(new Error('startup unavailable'))
    .mockResolvedValueOnce(bootstrapState('retry buffer', 27));
  mockedAppModelAdapter.subscribeStatePatches
    .mockReturnValueOnce(firstDisposer)
    .mockReturnValueOnce(retryDisposer);
  mockedApplicationAdapter.retryStartup.mockResolvedValueOnce();

  render(<App />);

  expect(
    await screen.findByRole('status', {
      name: 'GoMarkEdit could not initialize its local settings. Please try again.',
    }),
  ).toBeInTheDocument();
  const retry = screen.getByRole('button', { name: 'Retry' });
  fireEvent.click(retry);

  expect(
    await screen.findByRole('status', { name: 'Active editor buffer' }),
  ).toHaveTextContent('retry buffer');
  expect(
    screen.queryByRole('button', { name: 'Retry' }),
  ).not.toBeInTheDocument();
  expect(mockedAppModelAdapter.getState).toHaveBeenCalledTimes(2);
  expect(mockedApplicationAdapter.retryStartup).toHaveBeenCalledTimes(1);
  expect(mockedAppModelAdapter.subscribeStatePatches).toHaveBeenCalledTimes(2);
  expect(firstDisposer).toHaveBeenCalledTimes(1);
  expect(retryDisposer).not.toHaveBeenCalled();
});

// Proves: FR-WS-013
it('keeps the normal shell unmounted while startup is unresolved', async () => {
  disposeAppModelProjection();
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  let resolveStartup: ((state: AppModelState) => void) | undefined;
  mockedAppModelAdapter.getState.mockImplementationOnce(
    () =>
      new Promise<AppModelState>((resolve): void => {
        resolveStartup = resolve;
      }),
  );
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());

  render(<App />);
  await act(async (): Promise<void> => Promise.resolve());

  expect(screen.queryByLabelText('Workspace')).toBeNull();
  expect(screen.queryByLabelText('Document area')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();

  await act(async (): Promise<void> => {
    resolveStartup?.(bootstrapState('ready after wait', 31));
  });
  expect(await screen.findByLabelText('Document area')).toBeInTheDocument();
});

it('FR-WS-020 exposes no downstream File, launcher, recent, tab, or Assistant surface', async () => {
  render(<App />);

  await screen.findByRole('main', { name: 'Document area' });
  expect(screen.queryByText(/\bfile\b/i)).not.toBeInTheDocument();
  expect(
    screen.queryByText(/launcher|recent|assistant/i),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/assistant/i)).not.toBeInTheDocument();
});

it('FR-WS-020 keeps the existing document consumer while every future shell facsimile stays absent', async () => {
  render(<App />);

  await screen.findByRole('main', { name: 'Document area' });
  const actions = screen.getByRole('navigation', {
    name: 'Application actions',
  });
  expect(
    Array.from(actions.querySelectorAll('button')).map(
      (button) => button.textContent,
    ),
  ).toEqual(['Settings', 'View', 'About']);
  expect(
    screen.getByRole('status', { name: 'Active editor buffer' }),
  ).not.toBeEmptyDOMElement();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Appearance' }));
  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(dialog.querySelectorAll('h2')).toHaveLength(1);
  expect(dialog).toHaveTextContent('Appearance');

  for (const unavailableFutureSurface of [
    /\bfile\b/i,
    /launcher/i,
    /recent/i,
    /zero[ -]?document/i,
    /assistant/i,
    /new document/i,
    /open(?: folder)?/i,
  ]) {
    expect(
      screen.queryByText(unavailableFutureSurface),
    ).not.toBeInTheDocument();
  }
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /assistant/i }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /(?:new|open)/i }),
  ).not.toBeInTheDocument();
});

it('STORY-027-AC-3 keeps StrictMode retries single-flight repeatable and active-buffer exact', async () => {
  disposeAppModelProjection();
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  let rejectRepeatedRetry: ((reason?: unknown) => void) | undefined;
  mockedAppModelAdapter.getState
    .mockRejectedValueOnce(new Error('initial failure'))
    .mockImplementationOnce(
      () =>
        new Promise<AppModelState>((_resolve, reject): void => {
          rejectRepeatedRetry = reject;
        }),
    )
    .mockResolvedValueOnce(bootstrapState('one successful handoff', 28));
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  const harness = globalThis as typeof globalThis & {
    story027DoubleRetryHarness?: boolean;
  };
  harness.story027DoubleRetryHarness = true;

  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Retry twice' }));
  await waitFor((): void => {
    expect(mockedAppModelAdapter.getState).toHaveBeenCalledTimes(2);
    expect(mockedAppModelAdapter.subscribeStatePatches).toHaveBeenCalledTimes(
      2,
    );
  });

  harness.story027DoubleRetryHarness = false;
  rejectRepeatedRetry?.(new Error('retry failure'));
  const secondRetry = await screen.findByRole('button', { name: 'Retry' });
  fireEvent.click(secondRetry);

  expect(
    await screen.findByRole('status', { name: 'Active editor buffer' }),
  ).toHaveTextContent('one successful handoff');
  expect(mockedAppModelAdapter.getState).toHaveBeenCalledTimes(3);
  expect(mockedAppModelAdapter.subscribeStatePatches).toHaveBeenCalledTimes(3);
  expect(
    screen.getAllByRole('status', { name: 'Active editor buffer' }),
  ).toHaveLength(1);
});

it('STORY-027-AC-4 renders an accessible localized token-only startup failure surface', async () => {
  disposeAppModelProjection();
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockRejectedValueOnce(
    new Error('unavailable'),
  );
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());

  render(<App />);

  expect(
    await screen.findByRole('status', {
      name: 'GoMarkEdit could not initialize its local settings. Please try again.',
    }),
  ).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();

  const failureSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/StartupFailure.tsx'),
    'utf8',
  );
  const failureStyles = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/StartupFailure.module.css'),
    'utf8',
  );
  expect(failureSource).toContain("t('startup.failure.message')");
  expect(failureSource).toContain("t('startup.retry')");
  expect(failureStyles).toMatch(/var\(--startup-failure-/);
  expect(failureStyles).not.toMatch(/#[0-9a-f]{3,8}\b|\brgb\(|\bhsl\(/i);
});
