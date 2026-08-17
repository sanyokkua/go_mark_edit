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

/*
 * T176. This used to be a hand-written `copy` map of about a dozen keys with a
 * silent `?? key` fallback — a *second* catalogue that had to be kept in step
 * with `en.json` by hand, and nothing checked that it was. T124 hit it directly:
 * two `recovery.quit.documents*` keys were added to `en.json` and the prompt
 * still rendered the bare key as its accessible name until the map was edited
 * too.
 *
 * `src/test/i18nShim.ts` builds a real translator from `en.json` and already
 * served every suite importing `../../i18n`; only this file, importing `./i18n`
 * at depth zero, fell outside the `moduleNameMapper` pattern and grew its own.
 * Pointing at the shim leaves exactly one catalogue.
 */
jest.mock('./i18n', () => jest.requireActual('./test/i18nShim'));

import englishCatalog from './i18n/locales/en.json';
import { t } from './i18n';

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
      editor: { lineNumbers: true, wordWrap: false, fontSize: 14 },
    })),
    updateAppearance: jest.fn(async () => undefined),
    updateMarkdown: jest.fn(async () => undefined),
    updateEditor: jest.fn(async () => undefined),
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
    flushActiveSession: jest.fn(async () => undefined),
    setDocView: jest.fn(),
    setUILayout: jest.fn(),
    reconcileCommittedWrite: jest.fn(),
    subscribeStatePatches: jest.fn(() => jest.fn()),
  },
  closePlanAdapter: {
    prepareClose: jest.fn(async () => ({
      data: {
        id: 'close-plan-1',
        kind: 'quit',
        tabSetRevision: 0,
        targets: [],
        status: 'ready',
      },
    })),
    resolveClosePlan: jest.fn(async () => ({
      data: {
        id: 'close-plan-1',
        kind: 'quit',
        tabSetRevision: 0,
        targets: [],
        status: 'ready',
      },
    })),
    executeClosePlan: jest.fn(async () => ({
      status: 'closed',
      orderedDocumentIds: [],
    })),
  },
  nativeLifecycleAdapter: {
    onCloseRequested: jest.fn(() => jest.fn()),
    requestQuit: jest.fn(),
    authorizeQuit: jest.fn(async () => undefined),
    cancelQuit: jest.fn(async () => undefined),
  },
  documentWriteAdapter: {
    save: jest.fn(async () => ({ status: 'cancelled' })),
    saveAs: jest.fn(async () => ({ status: 'cancelled' })),
    cancelNormalization: jest.fn(async () => ({})),
  },
  documentConflictAdapter: {
    checkExternalChanges: jest.fn(async () => ({ status: 'unchanged' })),
    reloadFromDisk: jest.fn(async () => ({ status: 'cancelled' })),
    authorizeKeepMine: jest.fn(async () => ({ status: 'cancelled' })),
    skipConflict: jest.fn(async () => ({ status: 'cancelled' })),
    cancelConflict: jest.fn(async () => ({ status: 'cancelled' })),
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
import {
  dismissNotification,
  notifyToast,
  resetNotifications,
} from './logic/store/notificationsSlice';
import { reportClassifiedError } from './logic/store/classifiedNotification';
import type { WireError } from './logic/utils/parseError';
import type { ClassifiedError } from './logic/store/appModelTypes';
import {
  createAppModelAdapter,
  type AppModelBindings,
  type AppModelAdapter,
  type AppModelRuntime,
} from './logic/adapter/appModelAdapter';
import { createShellActionCatalogue } from './logic/actions/shellActions';
import {
  appModelAdapter,
  closePlanAdapter,
  documentConflictAdapter,
  applicationAdapter,
  documentWriteAdapter,
  nativeLifecycleAdapter,
} from './logic/adapter';
import type {
  AppModelState,
  AppStatePatch,
  DocumentMetadata,
  PathCommandResult,
} from './logic/store/appModelTypes';
import AppShell from './ui/widgets/AppShell';
import ShellMenuRow from './ui/widgets/ShellMenuRow';
import type { SettingsMenuProps } from './ui/widgets/SettingsMenu';

const mockedAppModelAdapter = appModelAdapter as jest.Mocked<AppModelAdapter>;
const mockedApplicationAdapter = applicationAdapter as jest.Mocked<
  typeof applicationAdapter
>;
const mockedDocumentWriteAdapter = documentWriteAdapter as jest.Mocked<
  typeof documentWriteAdapter
>;
const mockedDocumentConflictAdapter = documentConflictAdapter as jest.Mocked<
  typeof documentConflictAdapter
>;
const mockedClosePlanAdapter = closePlanAdapter as jest.Mocked<
  typeof closePlanAdapter
>;
const mockedNativeLifecycleAdapter = nativeLifecycleAdapter as jest.Mocked<
  typeof nativeLifecycleAdapter
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
  // The menu-row identity is intentionally outside the mocked document area;
  // the blank-root assertion concerns the application content surface.
  act((): void => disposeAppModelProjection());
});

// The View menu used to be removed entirely whenever no document was open, so
// the shell showed three menus instead of four and the user could not see what
// View contained. It is now always offered, with only the rows whose values
// come from the active document drawn unavailable.
it('FR-ED-004 offers all four menus with no document open', async () => {
  render(<App />);

  const actions = await screen.findByRole('navigation', {
    name: 'Application actions',
  });
  act((): void => {
    store.dispatch(resetProjection());
    store.dispatch(
      hydrateProjection({
        revision: 41,
        documents: {},
        activeDocumentId: '',
        ui: { sidebarVisible: true },
      }),
    );
  });
  expect(store.getState().documents.activeDocumentId).toBeNull();

  expect(
    within(actions)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent),
  ).toEqual(expect.arrayContaining(['File', 'Settings', 'View', 'About']));

  fireEvent.keyDown(within(actions).getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });
  const viewMenu = await screen.findByRole('menu', { name: 'View options' });
  for (const label of ['Editor', 'Split', 'Preview']) {
    expect(
      within(viewMenu).getByRole('menuitemradio', { name: label }),
    ).toHaveAttribute('data-availability', 'unavailable');
  }
  fireEvent.keyDown(viewMenu, { key: 'Escape' });
  act((): void => disposeAppModelProjection());
});

it('T058 includes the Shortcuts dialog in the shared modal suppression state', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  expect(source).toContain('ModalStateProvider');
  expect(source).toContain('settingsOpen ||');
  expect(source).toContain('closePlan !== null');
  expect(source).toContain('modalOpen={menuState.modalOpen}');
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

it('T018 keeps the feature shell ordered and future behavior explicitly bounded at desktop and 375px widths', async () => {
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
    arrangement: 'split' as const,
    editorVisible: true,
    lineNumbers: true,
    onArrangementChange: jest.fn(),
    onEditorVisibilityChange: jest.fn(),
    onFullscreen: jest.fn(),
    onLineNumbersChange: jest.fn(),
    onPreviewVisibilityChange: jest.fn(),
    onWordWrapChange: jest.fn(),
    onWorkspaceVisibilityChange: jest.fn(),
    previewVisible: true,
    wordWrap: false,
    workspaceVisible: true,
  };
  const assertFutureSurfacesBounded = (): void => {
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
      .map((button) => button.getAttribute('aria-label') ?? button.textContent),
  ).toEqual([
    'File',
    'Settings',
    'View',
    'About',
    'Toggle Sidebar',
    'Toggle Assistant',
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(
    screen.getByRole('menuitem', { name: /All settings/u }),
  ).toBeInTheDocument();
  assertFutureSurfacesBounded();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  fireEvent.keyDown(screen.getByRole('button', { name: 'View' }), {
    key: 'ArrowDown',
  });
  const viewMenu = await screen.findByRole('menu', { name: 'View options' });
  expect(
    within(viewMenu).getByRole('menuitem', { name: 'Toggle Assistant' }),
  ).toHaveAttribute('aria-disabled', 'true');
  expect(
    within(viewMenu).getByRole('menuitemcheckbox', { name: 'Toggle Sidebar' }),
  ).toBeInTheDocument();
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
  ).toEqual(['File', 'Settings', 'View', 'About']);
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  assertFutureSurfacesBounded();

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
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValueOnce(
    bootstrapState('ephemeral buffer', 12),
  );
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());

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
  act((): void => disposeAppModelProjection());
});

it('T027 native close requests complete a clean plan before authorizing one quit', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  mockedAppModelAdapter.getState.mockReset();
  const readyState = bootstrapState('draft', 12);
  const zeroDocumentState: AppModelState = {
    ...readyState,
    snapshot: {
      ...readyState.snapshot,
      revision: 13,
      documents: {},
      orderedDocumentIds: [],
      activeDocumentId: null,
      activeDocument: null,
    },
    activeBuffer: null,
  };
  mockedAppModelAdapter.getState
    .mockResolvedValueOnce(readyState)
    .mockResolvedValueOnce(readyState)
    .mockResolvedValueOnce(zeroDocumentState);
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedClosePlanAdapter.prepareClose.mockResolvedValue({
    data: {
      id: 'native-close-plan',
      kind: 'quit',
      tabSetRevision: 12,
      targets: [],
      status: 'ready',
    },
  });
  mockedClosePlanAdapter.resolveClosePlan.mockResolvedValue({
    data: {
      id: 'native-close-plan',
      kind: 'quit',
      tabSetRevision: 12,
      targets: [],
      status: 'ready',
    },
  });
  mockedClosePlanAdapter.executeClosePlan.mockResolvedValue({
    status: 'closed',
    orderedDocumentIds: [],
  });
  mockedNativeLifecycleAdapter.onCloseRequested.mockReset();
  mockedNativeLifecycleAdapter.authorizeQuit
    .mockReset()
    .mockResolvedValue(undefined);
  mockedNativeLifecycleAdapter.cancelQuit.mockReset().mockResolvedValue();
  let requestListener: (() => void) | undefined;
  mockedNativeLifecycleAdapter.onCloseRequested.mockImplementation(
    (listener) => {
      requestListener = listener;
      return jest.fn();
    },
  );

  render(<App />);
  await waitFor(() => expect(requestListener).toBeDefined());
  act(() => {
    requestListener?.();
  });

  await waitFor(() => {
    expect(mockedClosePlanAdapter.prepareClose).toHaveBeenCalledWith(
      'quit',
      ['document-1'],
      0,
    );
    expect(mockedNativeLifecycleAdapter.authorizeQuit).toHaveBeenCalledTimes(1);
  });
  expect(mockedAppModelAdapter.getState).toHaveBeenCalledTimes(3);
  expect(store.getState().documents).toMatchObject({
    orderedIds: [],
    byId: {},
    activeDocumentId: null,
  });
  expect(mockedClosePlanAdapter.resolveClosePlan).toHaveBeenCalledWith(
    'native-close-plan',
    [],
  );
  act((): void => disposeAppModelProjection());
});

it('T111 surfaces the close plan refusal with the backend message intact', async () => {
  /*
   * The refusal was reported, but through `notifyError`, whose
   * `localizedErrorCopy` swaps title and message for generic copy keyed by
   * code. `conflict` has no catalog entry so it collapsed onto `io`, and both
   * of Go's close-plan refusals — pinned by TestPrepareCloseRefuses* in
   * `internal/appmodel/close_plan_test.go` — reached the user as "The file
   * operation could not be completed." T107's treatment, third arrow.
   */
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedClosePlanAdapter.prepareClose.mockReset().mockResolvedValue({
    error: {
      category: 'conflict',
      message: 'The tab set changed; close must be retried.',
      remediations: ['Retry'],
      documentId: 'close plan',
      dedupKey: 'close plan:conflict',
      safeSubject: 'close plan',
    },
  });
  mockedNativeLifecycleAdapter.onCloseRequested.mockReset();
  mockedNativeLifecycleAdapter.cancelQuit.mockReset().mockResolvedValue();
  let requestListener: (() => void) | undefined;
  mockedNativeLifecycleAdapter.onCloseRequested.mockImplementation(
    (listener) => {
      requestListener = listener;
      return jest.fn();
    },
  );

  render(<App />);
  await waitFor(() => expect(requestListener).toBeDefined());
  act(() => {
    requestListener?.();
  });

  await waitFor(() => {
    expect(store.getState().notifications.items).toHaveLength(1);
  });
  expect(store.getState().notifications.items[0]).toMatchObject({
    message: 'The tab set changed; close must be retried.',
    severity: 'error',
  });
  act((): void => disposeAppModelProjection());
});

// Proves: FR-FT-027 (partial — "A cancellation or drain failure MUST create no
// permit, keep the window open, and provide a classified io-failure error with
// Retry", from the surface the user actually sees. That no permit is created is
// proved in Go by TestDrainFailureCreatesNoPermit.)
it('T134 surfaces a drain refusal as one classified io-failure offering Retry', async () => {
  /*
   * Before T134 AuthorizeQuit answered with a bare VoidResult, so a failed
   * drain crossed as an untyped WireError. `unwrapPromise` turned it into a
   * `notifyError`, whose `localizedErrorCopy` replaces the backend's message
   * with generic catalog copy, and `reportNativeCloseError` then dispatched a
   * second one: two toasts, neither carrying the Retry control the requirement
   * names, for a window the user now cannot close.
   */
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  const readyState = bootstrapState('draft', 12);
  mockedAppModelAdapter.getState.mockResolvedValue({
    ...readyState,
    snapshot: {
      ...readyState.snapshot,
      revision: 13,
      documents: {},
      orderedDocumentIds: [],
      activeDocumentId: null,
      activeDocument: null,
    },
    activeBuffer: null,
  });
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  const readyPlan = {
    data: {
      id: 'drain-refusal-plan',
      kind: 'quit' as const,
      tabSetRevision: 12,
      targets: [],
      status: 'ready' as const,
    },
  };
  mockedClosePlanAdapter.prepareClose.mockReset().mockResolvedValue(readyPlan);
  mockedClosePlanAdapter.resolveClosePlan
    .mockReset()
    .mockResolvedValue(readyPlan);
  mockedClosePlanAdapter.executeClosePlan.mockReset().mockResolvedValue({
    status: 'closed',
    orderedDocumentIds: [],
  });
  mockedNativeLifecycleAdapter.onCloseRequested.mockReset();
  mockedNativeLifecycleAdapter.requestQuit.mockReset();
  mockedNativeLifecycleAdapter.cancelQuit.mockReset().mockResolvedValue();
  mockedNativeLifecycleAdapter.authorizeQuit.mockReset().mockResolvedValue({
    category: 'io-failure',
    message:
      'The application could not finish saving pending work before closing.',
    remediations: ['Retry'],
    documentId: '',
    dedupKey: 'native close:io-failure',
    safeSubject: 'native close',
  });
  let requestListener: (() => void) | undefined;
  mockedNativeLifecycleAdapter.onCloseRequested.mockImplementation(
    (listener) => {
      requestListener = listener;
      return jest.fn();
    },
  );

  render(<App />);
  await waitFor(() => expect(requestListener).toBeDefined());
  act(() => {
    requestListener?.();
  });

  await waitFor(() => {
    expect(mockedNativeLifecycleAdapter.authorizeQuit).toHaveBeenCalledTimes(1);
  });
  // Exactly one toast, not two. The old path dispatched `notifyError` from
  // `unwrapPromise` and then `reportNativeCloseError` again from the catch, so
  // the count is the assertion — hence the reset above rather than a filter.
  await waitFor(() => {
    expect(store.getState().notifications.items).toHaveLength(1);
  });
  expect(store.getState().notifications.items[0]).toMatchObject({
    code: 'io',
    message:
      'The application could not finish saving pending work before closing.',
    severity: 'error',
    subject: 'native close:io-failure',
  });
  expect(store.getState().notifications.items[0]?.remediations).toMatchObject([
    { action: 'retry', intent: 'quit' },
  ]);
  // The window stays open: the pending request is cancelled so the coordinator
  // holds no half-finished close.
  await waitFor(() => {
    expect(mockedNativeLifecycleAdapter.cancelQuit).toHaveBeenCalledTimes(1);
  });

  // The offered control is a real command, not a label: pressing Retry asks the
  // native frame to close again, which is the only thing that can succeed.
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => {
    expect(mockedNativeLifecycleAdapter.requestQuit).toHaveBeenCalledTimes(1);
  });
  act((): void => disposeAppModelProjection());
});

it('T009 operates File New through the real menu and installs its acknowledged buffer', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  /*
   * The double publishes the state patch as well as answering the call, because
   * that is what `NewDocument` does: `publishLocked` emits the patch before the
   * outcome is built (`internal/appmodel/file_lifecycle.go`). Until T128 nothing
   * read the projection on this path so a double that answered and published
   * nothing was indistinguishable from the real backend; FR-FT-030's guard reads
   * it, and a double that never advances the projection would now hide the very
   * confirmation the rule is about.
   */
  let publishStatePatch: ((patch: AppStatePatch) => void) | undefined;
  const newDocument = jest.fn(async (expectedTabSetRevision: number) => {
    void expectedTabSetRevision;
    publishStatePatch?.({
      revision: 13,
      orderedDocumentIds: ['document-1', 'document-2'],
      documents: {
        upsert: {
          'document-2': {
            ...(bootstrapState('initial content', 12).snapshot.documents[
              'document-1'
            ] as DocumentMetadata),
            documentId: 'document-2',
            title: 'Two',
            path: '',
            contentRevision: 0,
          },
        },
      },
      activeDocumentId: 'document-2',
    });
    return {
      data: {
        documentId: 'document-2',
        documentRevision: 0,
        projectionRevision: 13,
        content: 'new document content',
      },
    };
  });
  mockedAppModelAdapter.newDocument = newDocument;
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValueOnce(
    bootstrapState('initial content', 12),
  );
  mockedAppModelAdapter.subscribeStatePatches.mockImplementation((listener) => {
    publishStatePatch = listener;
    return jest.fn();
  });

  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }));

  await waitFor(() => {
    expect(newDocument).toHaveBeenCalledWith(12);
    expect(
      screen.getByRole('status', { name: 'Active editor buffer' }),
    ).toHaveTextContent('new document content');
  });
  mockedAppModelAdapter.newDocument = undefined;
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  act((): void => disposeAppModelProjection());
});

it('flushes the active editor session before File Open invokes the native command', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  const calls: string[] = [];
  mockedAppModelAdapter.flushActiveSession = jest.fn(async (documentId) => {
    calls.push(`flush:${documentId}`);
  });
  const openDocument = jest.fn(async (expectedTabSetRevision: number) => {
    calls.push('open');
    expect(expectedTabSetRevision).toBe(12);
    return { status: 'cancelled' as const };
  });
  mockedAppModelAdapter.openDocument = openDocument;

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Open File' }));

  await waitFor(() => expect(openDocument).toHaveBeenCalledTimes(1));
  expect(mockedAppModelAdapter.flushActiveSession).toHaveBeenCalledWith(
    'document-1',
  );
  expect(calls).toEqual(['flush:document-1', 'open']);
  mockedAppModelAdapter.openDocument = undefined;
  act((): void => disposeAppModelProjection());
});

// Proves: FR-FT-015
it('T117 surfaces the Save refusal with the backend message and its own code', async () => {
  /*
   * `reportWriteError` dispatched `notifyError`, whose `prepare` runs
   * `localizedErrorCopy` and swaps title and message for generic catalogue copy
   * keyed by code — so the message Go built was discarded on every write. This is
   * exactly the defect T111 fixed for the close plan and explicitly scoped away
   * from `reportWriteError`, which still backed Save and Save As.
   *
   * The category ternary compounded it: it ended `conflict ? 'io' : 'io'`, so
   * `conflict`, `capacity-limit` and `system-command-failure` were
   * indistinguishable, while `classifiedErrorCode` preserves all eight.
   */
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'refused',
    error: {
      category: 'conflict',
      safeSubject: 'one.md',
      message: 'The document changed on disk while Save was preparing.',
      remediations: ['Retry'],
      documentId: 'document-1',
      dedupKey: 'save-conflict:document-1',
    },
  });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));

  await waitFor(() => {
    expect(store.getState().notifications.items).toHaveLength(1);
  });
  expect(store.getState().notifications.items[0]).toMatchObject({
    // Before: 'The file operation could not be completed.' and code 'io'.
    code: 'conflict',
    message: 'The document changed on disk while Save was preparing.',
    severity: 'error',
    title: 'one.md',
  });
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

// Proves: FR-FT-015
it('T117 reports one refused Save once, not twice with a count', async () => {
  /*
   * `onSave` returns the `WriteResult`, so a refused write matched both the
   * write path's own reporter and the File menu's `onActionResult` arm and was
   * reported twice. The contract's dedup count means a failure that *repeated*;
   * a single failure showing `×2` misreports what happened.
   *
   * It was invisible until T117 because both reports rendered identical generic
   * copy. It surfaced as a lost Retry control: `refreshDuplicate` copies the
   * incoming remediation wholesale, and the second report carried no intent.
   */
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'refused',
    error: {
      category: 'io-failure',
      safeSubject: 'one.md',
      message: 'The file could not be written.',
      remediations: ['Retry'],
      documentId: 'document-1',
      dedupKey: 'write:document-1',
    },
  });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));

  await waitFor(() => {
    expect(store.getState().notifications.items).toHaveLength(1);
  });
  expect(store.getState().notifications.items[0]).toMatchObject({
    count: 1,
    remediations: [
      {
        action: 'retry',
        documentId: 'document-1',
        intent: 'save',
        labelKey: 'action.retry.label',
      },
    ],
  });
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

// Proves: FR-FT-015
it('T117 keeps each classified category on its own notification code', async () => {
  /*
   * The category ternary ended `category === 'conflict' ? 'io' : 'io'`, so three
   * of the eight categories collapsed onto one code and became indistinguishable
   * to dedup, styling and any assertion. `classifiedErrorCode` already preserved
   * all eight; nothing routed the write path through it.
   *
   * A capacity-limit refusal is the sharpest case: FR-FT-005 requires the message
   * to name the limit, and generic copy cannot.
   */
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'refused',
    error: {
      category: 'capacity-limit',
      safeSubject: 'one.md',
      message: 'The document is larger than the 50 MiB limit.',
      // capacity-limit is message-only; Go strips a Cancel here, so the double must too.
      remediations: [],
      documentId: 'document-1',
      dedupKey: 'capacity:document-1',
    },
  });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));

  await waitFor(() => {
    expect(store.getState().notifications.items).toHaveLength(1);
  });
  expect(store.getState().notifications.items[0]).toMatchObject({
    // Before: 'io', identical to an unrelated write failure.
    code: 'capacity-limit',
    message: 'The document is larger than the 50 MiB limit.',
  });
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

// Proves: FR-FT-037
it('T116 renders the classified remediation and runs the command it names', async () => {
  /*
   * The whole fixed remediation vocabulary was unreachable. `Toast.tsx:65` renders
   * the button only when `onRemediate !== undefined`, and the sole production
   * render site passed `notification` and `onDismiss` only — so every remediation
   * `reportClassifiedError` built was constructed and discarded.
   *
   * Nothing caught it because every covering test supplied the missing half
   * itself: `Toast.test.tsx` hand-constructs `onRemediate`, and
   * `DocumentTabs.test.tsx:684-720` asserts the *dispatched* object and never
   * renders a toast. This drives the seam between them — the store already holds
   * exactly the object a Reveal failure puts there, and the assertion is that the
   * application renders it and honours it.
   */
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.copyPath = jest.fn(
    async (): Promise<PathCommandResult> => ({ status: 'copied' }),
  );

  render(<App />);
  await screen.findByRole('button', { name: 'File' });
  act((): void => {
    store.dispatch(
      notifyToast({
        code: 'system-command-failure',
        message: 'The file manager could not reveal the document.',
        remediations: [
          {
            action: 'copy-path',
            documentId: 'document-1',
            intent: 'copy-path',
            labelKey: 'action.copy-path.label',
          },
        ],
        severity: 'error',
        subject: 'reveal:document-1',
        title: 'one.md',
      }),
    );
  });

  const remediate = await screen.findByRole('button', { name: 'Copy path' });
  fireEvent.click(remediate);

  await waitFor(() => {
    expect(mockedAppModelAdapter.copyPath).toHaveBeenCalledWith('document-1');
  });
  // A resolved failure must not keep sitting on screen: an error toast has an
  // infinite duration, so nothing else would ever remove it.
  await waitFor(() => {
    expect(store.getState().notifications.items).toHaveLength(0);
  });
  mockedAppModelAdapter.copyPath = undefined;
  act((): void => disposeAppModelProjection());
});

/*
 * T142 gap (b), the half T116 could not reach. FR-FT-037 pairs a Reveal failure
 * with `Retry` *and* `Copy path`, and while a toast could carry one control the
 * Retry had nowhere honourable to point: the only intent the reveal caller could
 * name was `copy-path`, so the mapping dropped Retry rather than render a button
 * whose label said one thing and whose command did another. This drives both
 * controls of the real pair through the application and asserts the command each
 * one actually runs.
 */
// Proves: FR-FT-037 (the Reveal `system-command-failure` pair reaching the toast
// and each control running its own command). It does not prove the detached
// `not-found` pair, whose `Save to recreate` has no command — that is T160.
it('T142 offers both Reveal remediations and re-runs Reveal from the Retry', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.copyPath = jest.fn(
    async (): Promise<PathCommandResult> => ({ status: 'copied' }),
  );
  mockedAppModelAdapter.revealInFileManager = jest.fn(
    async (): Promise<PathCommandResult> => ({ status: 'revealed' }),
  );

  render(<App />);
  await screen.findByRole('button', { name: 'File' });
  act((): void => {
    reportClassifiedError(
      store.dispatch,
      {
        category: 'system-command-failure',
        safeSubject: 'one.md',
        message: 'The file manager could not reveal the document.',
        remediations: ['Retry', 'Copy path'],
        documentId: 'document-1',
        dedupKey: 'reveal:document-1',
      },
      'File operation failed',
      { intent: 'reveal' },
    );
  });

  const retry = await screen.findByRole('button', { name: 'Retry' });
  expect(screen.getByRole('button', { name: 'Copy path' })).toBeVisible();

  fireEvent.click(retry);
  await waitFor(() => {
    expect(mockedAppModelAdapter.revealInFileManager).toHaveBeenCalledWith(
      'document-1',
    );
  });
  // A Reveal the host accepted resolves the failure, so the toast goes.
  await waitFor(() => {
    expect(store.getState().notifications.items).toHaveLength(0);
  });
  // The Retry must not have run the *other* control's command.
  expect(mockedAppModelAdapter.copyPath).not.toHaveBeenCalled();

  mockedAppModelAdapter.copyPath = undefined;
  mockedAppModelAdapter.revealInFileManager = undefined;
  act((): void => disposeAppModelProjection());
});

// Proves: FR-FT-015 (partial — the explicit confirmation; "automatic success
// remains silent" is proved by the sibling below)
it('Save reports exactly one confirmation', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.reconcileCommittedWrite.mockResolvedValue(
    bootstrapState('draft', 13),
  );
  mockedDocumentWriteAdapter.save.mockResolvedValue({
    status: 'committed',
    data: {
      documentId: 'document-1',
      writtenContentRevision: 2,
      committedProjectionRevision: 13,
      targetPath: '/documents/one.md',
      targetPathAdopted: false,
      lineEndingOutcome: 'preserved-lf',
      bomOutcome: 'absent',
      resyncRequired: false,
    },
  });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));

  await waitFor(() => {
    expect(screen.getByText('Saved one.md · UTF-8 · LF')).toBeVisible();
  });
  expect(screen.getAllByText('Saved one.md · UTF-8 · LF')).toHaveLength(1);
  expect(mockedDocumentWriteAdapter.save).toHaveBeenCalledWith(
    'document-1',
    0,
    '',
  );
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

/*
 * T160 — FR-FT-023's recreate arm, which `beginWrite` vetoed outright.
 *
 * The guard treated `detached === true` as a read-only capability and answered
 * every explicit Save with a `permission-denied` refusal. FR-FT-023 says the
 * opposite in as many words: a missing backing file MUST keep the buffer, mark
 * the document detached and modified, and "allow explicit Save to recreate the
 * same path" (spec.md:1067, acceptance scenario 6 at spec.md:546). Go has always
 * been able to do it — `internal/appmodel/save.go:355` clears `detached` on a
 * successful write — so this was a frontend guard vetoing a backend capability,
 * and it fired for every Save on a detached document, not only for the
 * `Save to recreate` remediation T160 also owns.
 */
// Proves: FR-FT-023
it('T160 lets an explicit Save recreate a detached document at the same path', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  const detached = bootstrapState('draft', 12);
  detached.snapshot.documents['document-1'] = {
    ...detached.snapshot.documents['document-1'],
    detached: true,
    dirty: true,
  };
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(detached);
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.reconcileCommittedWrite.mockResolvedValue(
    bootstrapState('draft', 13),
  );
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'committed',
    data: {
      documentId: 'document-1',
      writtenContentRevision: 2,
      committedProjectionRevision: 13,
      targetPath: '/documents/one.md',
      targetPathAdopted: false,
      lineEndingOutcome: 'preserved-lf',
      bomOutcome: 'absent',
      resyncRequired: false,
    },
  });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));

  // The write must actually be issued, at the document's own path — the point
  // of the requirement is that the file comes back, not that the toast changes.
  await waitFor(() => {
    expect(mockedDocumentWriteAdapter.save).toHaveBeenCalledWith(
      'document-1',
      0,
      '',
    );
  });
  await waitFor(() => {
    expect(screen.getByText('Saved one.md · UTF-8 · LF')).toBeVisible();
  });
  // And the refusal it used to answer with must be gone, not merely outvoted by
  // a success toast rendered beside it.
  expect(
    screen.queryByText('This document is read-only and cannot be saved.'),
  ).not.toBeInTheDocument();
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

/*
 * T160 blocker 2 — the recreate must run against the document the toast names.
 *
 * A detached `not-found` is raised by Copy path or Reveal from the *tab context
 * menu*, which can target any tab, so the document the message is about need not
 * be the active one. `beginWrite` resolved its target from `activeDocument` and
 * ignored any id it was handed, so a `Save to recreate` control wired to it would
 * have recreated a different file than the one the user was told had gone —
 * silently, and at the path of a document they never mentioned.
 */
// Proves: FR-FT-023 (the remediation arm: the recreate runs against the named
// document) and the classified error contract's detached `not-found` row.
it('T160 recreates the document the toast names, not the active one', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  const twoDocuments = bootstrapState('draft', 12);
  twoDocuments.snapshot.documents['document-2'] = {
    ...twoDocuments.snapshot.documents['document-1'],
    documentId: 'document-2',
    title: 'Two',
    path: '/documents/two.md',
    detached: true,
    dirty: true,
  };
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(twoDocuments);
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.reconcileCommittedWrite.mockResolvedValue(
    bootstrapState('draft', 13),
  );
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'committed',
    data: {
      documentId: 'document-2',
      writtenContentRevision: 2,
      committedProjectionRevision: 13,
      targetPath: '/documents/two.md',
      targetPathAdopted: false,
      lineEndingOutcome: 'preserved-lf',
      bomOutcome: 'absent',
      resyncRequired: false,
    },
  });

  render(<App />);
  await screen.findByRole('button', { name: 'File' });
  act((): void => {
    reportClassifiedError(
      store.dispatch,
      {
        category: 'not-found',
        safeSubject: 'two.md',
        message: 'The file for two.md no longer exists.',
        remediations: ['Save to recreate', 'Copy path'],
        documentId: 'document-2',
        dedupKey: 'not-found:document-2',
      },
      'File operation failed',
      { intent: 'reveal' },
    );
  });

  const recreate = await screen.findByRole('button', {
    name: 'Save to recreate',
  });
  expect(screen.getByRole('button', { name: 'Copy path' })).toBeVisible();

  fireEvent.click(recreate);

  // `document-2`, not the active `document-1`. Asserting the id alone would pass
  // if the call were made twice, so the call count is pinned too.
  await waitFor(() => {
    expect(mockedDocumentWriteAdapter.save).toHaveBeenCalledWith(
      'document-2',
      0,
      '',
    );
  });
  expect(mockedDocumentWriteAdapter.save).toHaveBeenCalledTimes(1);
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

/*
 * T084 gap 7 — routing (ShellMenuRow.test.tsx:331), bridge shape
 * (logic/adapter/services.test.ts:57) and mock-model adoption
 * (dev/bridge-mock/appModel.test.ts:402) were each asserted, but nothing asserted the
 * UI *after* a committed Save As. The confirmation must name the adopted target rather
 * than the pre-Save-As filename, and the identity heading must follow the adopted path.
 * The tab half of the same outcome is asserted in DocumentTabs.test.tsx.
 */
it('T084 adopts the Save As target path in the confirmation and the identity heading', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  let emitPatch: ((patch: AppStatePatch) => void) | undefined;
  mockedAppModelAdapter.subscribeStatePatches.mockImplementation((listener) => {
    emitPatch = listener;
    return jest.fn();
  });
  mockedAppModelAdapter.reconcileCommittedWrite.mockResolvedValue(
    bootstrapState('draft', 13),
  );
  mockedDocumentWriteAdapter.save.mockReset();
  mockedDocumentWriteAdapter.saveAs.mockReset().mockResolvedValue({
    status: 'committed',
    data: {
      documentId: 'document-1',
      writtenContentRevision: 2,
      committedProjectionRevision: 13,
      targetPath: '/notes/renamed.md',
      targetPathAdopted: true,
      lineEndingOutcome: 'preserved-lf',
      bomOutcome: 'absent',
      resyncRequired: false,
    },
  });

  render(<App />);
  expect(
    await screen.findByRole('heading', { name: 'documents / one.md' }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save As' }));

  await waitFor(() =>
    expect(mockedDocumentWriteAdapter.saveAs).toHaveBeenCalledWith(
      'document-1',
      0,
      '',
    ),
  );
  expect(mockedDocumentWriteAdapter.save).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByText('Saved renamed.md · UTF-8 · LF')).toBeVisible(),
  );
  expect(screen.getAllByText('Saved renamed.md · UTF-8 · LF')).toHaveLength(1);
  expect(
    screen.queryByText('Saved one.md · UTF-8 · LF'),
  ).not.toBeInTheDocument();

  /*
   * The store is a projection: Go owns the adopted identity and publishes it as a
   * `state:patch`, so the heading has to follow the patch rather than any local write.
   */
  const adopted: DocumentMetadata = {
    ...bootstrapState('draft', 13).snapshot.documents['document-1'],
    path: '/notes/renamed.md',
    title: 'renamed.md',
    status: 'saved',
  };
  act((): void => {
    emitPatch?.({
      revision: 13,
      documents: { upsert: { 'document-1': adopted } },
    });
  });

  expect(
    screen.getByRole('heading', { name: 'notes / renamed.md' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'documents / one.md' }),
  ).not.toBeInTheDocument();
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

/*
 * T084 gap 8 — the `resync-recovery` parity state only proves a close dialog is
 * visible. The recovery prompt is a distinct surface with its own copy and its own
 * outcome: it discards newer unsaved changes wholesale instead of collecting a
 * per-document close choice.
 */
it('T084 confirms a resync recovery quit with its own copy and discards newer changes', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.reconcileCommittedWrite.mockReset().mockResolvedValue({
    persistent: true,
    savedOnDisk: true,
    commandsBlocked: true,
    closeBlocked: true,
    message: 'The file was saved on disk, but editor-state recovery failed.',
  });
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'committed',
    data: {
      documentId: 'document-1',
      writtenContentRevision: 2,
      committedProjectionRevision: 14,
      targetPath: '/documents/one.md',
      targetPathAdopted: false,
      lineEndingOutcome: 'preserved-lf',
      bomOutcome: 'absent',
      resyncRequired: true,
    },
  });
  mockedClosePlanAdapter.prepareClose.mockReset().mockResolvedValue({
    data: {
      id: 'recovery-close-plan',
      kind: 'quit',
      tabSetRevision: 0,
      status: 'collecting',
      targets: [
        {
          documentId: 'document-1',
          title: 'One',
          displayName: 'one.md',
          contentRevision: 1,
          dirty: true,
        },
      ],
    },
  });
  mockedClosePlanAdapter.resolveClosePlan.mockReset().mockResolvedValue({
    data: {
      id: 'recovery-close-plan',
      kind: 'quit',
      tabSetRevision: 0,
      status: 'ready',
      targets: [],
    },
  });
  mockedClosePlanAdapter.executeClosePlan.mockReset().mockResolvedValue({
    status: 'closed',
    orderedDocumentIds: [],
  });
  mockedNativeLifecycleAdapter.onCloseRequested.mockReset();
  mockedNativeLifecycleAdapter.requestQuit.mockReset();
  mockedNativeLifecycleAdapter.authorizeQuit
    .mockReset()
    .mockResolvedValue(undefined);
  mockedNativeLifecycleAdapter.cancelQuit.mockReset().mockResolvedValue();
  let requestListener: (() => void) | undefined;
  mockedNativeLifecycleAdapter.onCloseRequested.mockImplementation(
    (listener) => {
      requestListener = listener;
      return jest.fn();
    },
  );

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));

  const recovery = await screen.findByRole('alert', {
    name: 'Editor recovery needed',
  });
  expect(recovery).toHaveTextContent(
    'The file was saved on disk, but editor-state recovery failed.',
  );
  fireEvent.click(
    within(recovery).getByRole('button', {
      name: 'Quit and discard newer unsaved changes',
    }),
  );
  expect(mockedNativeLifecycleAdapter.requestQuit).toHaveBeenCalledTimes(1);

  await waitFor(() => expect(requestListener).toBeDefined());
  act((): void => {
    requestListener?.();
  });

  const confirm = await screen.findByRole('dialog', {
    name: 'Confirm quit and discard',
  });
  expect(
    within(confirm).getByText(
      'The file was saved on disk, but editor-state recovery failed. Quit and discard newer unsaved changes for the affected documents?',
    ),
  ).toBeVisible();
  expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(
    within(confirm).getByRole('button', { name: 'Quit and discard' }),
  ).toBeVisible();
  // The recovery route replaces the per-document close question, it does not precede it.
  expect(
    screen.queryByRole('dialog', { name: 'Save changes before closing?' }),
  ).not.toBeInTheDocument();

  fireEvent.click(
    within(confirm).getByRole('button', { name: 'Quit and discard' }),
  );

  await waitFor(() =>
    expect(mockedNativeLifecycleAdapter.authorizeQuit).toHaveBeenCalledTimes(1),
  );
  expect(mockedClosePlanAdapter.resolveClosePlan).toHaveBeenCalledTimes(1);
  expect(mockedClosePlanAdapter.resolveClosePlan).toHaveBeenCalledWith(
    'recovery-close-plan',
    [{ choice: 'discard-all' }],
  );
  expect(mockedClosePlanAdapter.executeClosePlan).toHaveBeenCalledWith(
    'recovery-close-plan',
  );
  expect(mockedNativeLifecycleAdapter.cancelQuit).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('dialog', { name: 'Confirm quit and discard' }),
  ).not.toBeInTheDocument();
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

// Proves: FR-FT-016 — "Quit and discard newer unsaved changes MUST require a
// second confirmation naming the affected documents". The two-step half of that
// clause is proved by the case above; this proves the naming half, which is the
// part that was missing: the confirmation asked the user to discard "the
// affected documents" without ever saying which.
it('T124 names every document whose newer changes the recovery quit discards', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  /*
   * Two documents, one modified. The set the confirmation must name is the set
   * whose newer edits the discard throws away — the documents FR-FT-016 keeps
   * "modified against the committed baseline" — so a clean tab must not appear
   * in it. Reading the projection is right here even though it is only a
   * projection: rehydration is what failed, so the last delivered snapshot is
   * the only record of what is about to be lost.
   */
  const twoDocumentState = ((): AppModelState => {
    const base = bootstrapState('draft', 12);
    const one = base.snapshot.documents['document-1'] as DocumentMetadata;
    return {
      ...base,
      snapshot: {
        ...base.snapshot,
        documents: {
          'document-1': { ...one, dirty: true },
          'document-2': {
            ...one,
            documentId: 'document-2',
            title: 'Two',
            path: '/documents/two.md',
            dirty: false,
          },
        },
        orderedDocumentIds: ['document-1', 'document-2'],
      },
    };
  })();
  mockedAppModelAdapter.getState.mockResolvedValue(twoDocumentState);
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.reconcileCommittedWrite.mockReset().mockResolvedValue({
    persistent: true,
    savedOnDisk: true,
    commandsBlocked: true,
    closeBlocked: true,
    message: 'The file was saved on disk, but editor-state recovery failed.',
  });
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'committed',
    data: {
      documentId: 'document-1',
      writtenContentRevision: 2,
      committedProjectionRevision: 14,
      targetPath: '/documents/one.md',
      targetPathAdopted: false,
      lineEndingOutcome: 'preserved-lf',
      bomOutcome: 'absent',
      resyncRequired: true,
    },
  });
  mockedNativeLifecycleAdapter.onCloseRequested.mockReset();
  mockedNativeLifecycleAdapter.requestQuit.mockReset();
  mockedNativeLifecycleAdapter.cancelQuit.mockReset().mockResolvedValue();
  let requestListener: (() => void) | undefined;
  mockedNativeLifecycleAdapter.onCloseRequested.mockImplementation(
    (listener) => {
      requestListener = listener;
      return jest.fn();
    },
  );

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));

  const recovery = await screen.findByRole('alert', {
    name: 'Editor recovery needed',
  });
  fireEvent.click(
    within(recovery).getByRole('button', {
      name: 'Quit and discard newer unsaved changes',
    }),
  );
  await waitFor(() => expect(requestListener).toBeDefined());
  act((): void => {
    requestListener?.();
  });

  const confirm = await screen.findByRole('dialog', {
    name: 'Confirm quit and discard',
  });
  const affected = within(confirm).getByRole('list', {
    name: 'Documents with newer unsaved changes',
  });
  // The names carry the tab strip's bidi isolates, because they are the tab
  // labels: a right-to-left filename must not reorder the sentence around it.
  const affectedNames = within(affected)
    .getAllByRole('listitem')
    .map((item) => (item.textContent ?? '').replaceAll(/[\u2068\u2069]/gu, ''));
  expect(affectedNames).toEqual(['one.md']);

  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

/*
 * T084 gap 8 — Cancel on the recovery confirmation must abandon the quit and leave the
 * recovery surface standing, not fall through to the ordinary close plan.
 */
it('T084 cancels a resync recovery quit without preparing a close plan', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.reconcileCommittedWrite.mockReset().mockResolvedValue({
    persistent: true,
    savedOnDisk: true,
    commandsBlocked: true,
    closeBlocked: true,
    message: 'The file was saved on disk, but editor-state recovery failed.',
  });
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'committed',
    data: {
      documentId: 'document-1',
      writtenContentRevision: 2,
      committedProjectionRevision: 14,
      targetPath: '/documents/one.md',
      targetPathAdopted: false,
      lineEndingOutcome: 'preserved-lf',
      bomOutcome: 'absent',
      resyncRequired: true,
    },
  });
  mockedClosePlanAdapter.prepareClose.mockReset();
  mockedNativeLifecycleAdapter.onCloseRequested.mockReset();
  mockedNativeLifecycleAdapter.cancelQuit.mockReset().mockResolvedValue();
  let requestListener: (() => void) | undefined;
  mockedNativeLifecycleAdapter.onCloseRequested.mockImplementation(
    (listener) => {
      requestListener = listener;
      return jest.fn();
    },
  );

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));
  await screen.findByRole('alert', { name: 'Editor recovery needed' });

  await waitFor(() => expect(requestListener).toBeDefined());
  act((): void => {
    requestListener?.();
  });

  const confirm = await screen.findByRole('dialog', {
    name: 'Confirm quit and discard',
  });
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));

  await waitFor(() =>
    expect(mockedNativeLifecycleAdapter.cancelQuit).toHaveBeenCalledTimes(1),
  );
  expect(mockedClosePlanAdapter.prepareClose).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('dialog', { name: 'Confirm quit and discard' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('alert', { name: 'Editor recovery needed' }),
  ).toBeVisible();
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

it('Reload replaces the active same-document buffer from authoritative state', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState
    .mockResolvedValueOnce(bootstrapState('mine\n', 12))
    .mockResolvedValueOnce(bootstrapState('mine\n', 12))
    .mockResolvedValueOnce(bootstrapState('disk\n', 13));
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'conflict',
    conflict: {
      documentId: 'document-1',
      displayName: 'one.md',
      contentRevision: 0,
      detectedDiskVersion: {
        exists: true,
        size: 5,
        modifiedUnixNano: '1',
        mode: 0o644,
      },
      onDisk: {
        text: 'disk\n',
        lineCount: 1,
        byteCount: 5,
        truncated: false,
      },
      yours: {
        text: 'mine\n',
        lineCount: 1,
        byteCount: 5,
        truncated: false,
      },
      readOnly: false,
    },
  });
  mockedDocumentConflictAdapter.reloadFromDisk.mockReset().mockResolvedValue({
    status: 'reloaded',
    documentId: 'document-1',
  });
  mockedAppModelAdapter.flushActiveSession = jest.fn(async () => undefined);

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));
  await screen.findByRole('dialog', { name: 'File changed on disk' });
  fireEvent.click(screen.getByRole('button', { name: 'Reload from disk' }));

  await waitFor(() => {
    expect(
      screen.getByRole('status', { name: 'Active editor buffer' }),
    ).toHaveTextContent('disk');
  });
  expect(mockedAppModelAdapter.getState).toHaveBeenCalledTimes(3);
  expect(mockedAppModelAdapter.flushActiveSession).toHaveBeenCalledWith(
    'document-1',
  );
  expect(
    screen.queryByRole('dialog', { name: 'File changed on disk' }),
  ).not.toBeInTheDocument();
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

it('Normalize line endings prompt focus and resumption', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.reconcileCommittedWrite.mockResolvedValue(
    bootstrapState('draft', 13),
  );
  mockedDocumentWriteAdapter.save
    .mockReset()
    .mockResolvedValueOnce({
      status: 'needs-normalization',
      decisionToken: 'decision-1',
      documentRevision: 7,
      proposedEnding: 'crlf',
    })
    .mockResolvedValueOnce({
      status: 'committed',
      data: {
        documentId: 'document-1',
        writtenContentRevision: 7,
        committedProjectionRevision: 13,
        targetPath: '/documents/one.md',
        targetPathAdopted: false,
        lineEndingOutcome: 'normalized-crlf',
        bomOutcome: 'absent',
        resyncRequired: false,
      },
    });

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  await within(screen.getByRole('menu', { name: 'File' }))
    .getByRole('menuitem', { name: /^Save$/u })
    .click();

  const prompt = await screen.findByRole('dialog', {
    name: 'Normalize line endings?',
  });
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await screen.getByRole('button', { name: 'Normalize and save' }).click();

  await waitFor(() =>
    expect(mockedDocumentWriteAdapter.save).toHaveBeenCalledTimes(2),
  );
  expect(mockedDocumentWriteAdapter.save).toHaveBeenNthCalledWith(
    2,
    'document-1',
    7,
    'decision-1',
  );
  expect(prompt).not.toBeInTheDocument();
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
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

  fireEvent.keyDown(await screen.findByRole('button', { name: 'About' }), {
    key: 'ArrowDown',
  });
  fireEvent.click(screen.getByRole('menuitem', { name: 'About GoMarkEdit' }));
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

it('T037 exposes File and visual tab surfaces while T009 enables New/Open lifecycle state', async () => {
  render(<App />);

  await screen.findByRole('main', { name: 'Document area' });
  expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('button', { name: 'File' }), {
    key: 'ArrowDown',
  });
  expect(screen.getByRole('menu', { name: 'File' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'New File' })).toBeEnabled();
  expect(screen.getByRole('menuitem', { name: 'Open File' })).toBeEnabled();
  expect(
    screen.queryByRole('complementary', { name: /assistant/i }),
  ).not.toBeInTheDocument();
});

it('FR-WS-020 keeps the existing document consumer while every future shell facsimile stays absent', async () => {
  render(<App />);

  await screen.findByRole('main', { name: 'Document area' });
  const actions = screen.getByRole('navigation', {
    name: 'Application actions',
  });
  expect(
    Array.from(actions.querySelectorAll('button')).map(
      (button) => button.getAttribute('aria-label') ?? button.textContent,
    ),
  ).toEqual([
    'File',
    'Settings',
    'View',
    'About',
    'Toggle Sidebar',
    'Toggle Assistant',
  ]);
  expect(
    screen.getByRole('status', { name: 'Active editor buffer' }),
  ).not.toBeEmptyDOMElement();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('menuitem', { name: /All settings/u }));
  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(dialog.querySelectorAll('h2')).toHaveLength(1);
  expect(dialog).toHaveTextContent('Appearance');

  expect(screen.getByRole('button', { name: 'File' })).toBeInTheDocument();
  expect(
    screen.queryByRole('complementary', { name: /assistant/i }),
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

/*
 * FR-FT-005 requires the >50 MiB refusal to carry "a message naming the 50 MiB
 * limit", and the classified-error table remediates `capacity-limit`
 * message-only, naming the limit. The backend already names it
 * (`internal/file/document_reader.go:211` — "The document exceeds the 50 MiB
 * limit."); until now `onOpenDocument` read only `result.activeBuffer`, so a
 * refusal reached the user as silence.
 */
it('FR-FT-005 reports the 50 MiB open refusal with the limit named', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.flushActiveSession = jest.fn(async () => undefined);
  const openDocument = jest.fn(async () => ({
    status: 'refused' as const,
    error: {
      category: 'capacity-limit' as const,
      safeSubject: 'boundary-50mib-plus-one.md',
      message: 'The document exceeds the 50 MiB limit.',
      // capacity-limit is message-only; Go strips a Cancel here, so the double must too.
      remediations: [],
      dedupKey: 'capacity-limit:boundary-50mib-plus-one.md',
    },
  }));
  mockedAppModelAdapter.openDocument = openDocument;

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Open File' }));

  await waitFor(() => expect(openDocument).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(store.getState().notifications.items).toHaveLength(1),
  );
  expect(store.getState().notifications.items[0]).toEqual(
    expect.objectContaining({
      code: 'capacity-limit',
      message: 'The document exceeds the 50 MiB limit.',
      severity: 'error',
      subject: 'capacity-limit:boundary-50mib-plus-one.md',
    }),
  );

  mockedAppModelAdapter.openDocument = undefined;
  act((): void => disposeAppModelProjection());
});

/*
 * T156. Go classifies a stale tab-set refusal as `conflict` and sends `Retry`
 * with it — "The tab set changed; Open must be retried."
 * (`internal/appmodel/file_lifecycle.go:136,167`) — and the contract's
 * `conflict` row covers exactly that pairing since T159. The four entry callers
 * declared no intent, so `remediationsFor` dropped the `Retry` Go had sent and
 * the user was told to retry a command with nothing to retry it with.
 *
 * The retry has to re-read `tabSetRevision`: the revision that failed is by
 * definition the stale one, so re-sending it would refuse identically. That is
 * the assertion below, and it is the one a "call the same thing again" fix
 * would fail.
 */
function staleTabSetRefusal(message: string): ClassifiedError {
  return {
    category: 'conflict',
    message,
    remediations: ['Retry'],
    dedupKey: 'stale-tab-set',
    safeSubject: 'one.md',
  };
}

// Proves: FR-FT-015 and the classified error and remediation contract's
// `conflict` row (partial — the entry paths' `Retry` only: that the control is
// offered, and that it re-issues against a revision read fresh from the
// backend. The close-plan path is T164 and the tab reorder arm is T165.)
it('T156 offers Retry on a refused New and re-issues it against the fresh revision', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue({
    ...bootstrapState('draft', 12),
    snapshot: { ...bootstrapState('draft', 12).snapshot, tabSetRevision: 41 },
  });
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  const newDocument = jest
    .fn()
    .mockResolvedValueOnce({
      error: staleTabSetRefusal('The tab set changed; New must be retried.'),
    })
    .mockResolvedValueOnce({
      data: { documentId: 'document-2', content: '' },
    });
  mockedAppModelAdapter.newDocument = newDocument;

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'New File' }));

  const retry = await screen.findByRole('button', { name: 'Retry' });
  const firstRevision = newDocument.mock.calls[0]?.[0] as number;
  expect(firstRevision).toBe(41);
  /*
   * The tab set moves on while the toast is up — which is what the refusal was
   * telling the user. A retry that re-sent the revision it already had would
   * send 41 again and refuse identically.
   */
  mockedAppModelAdapter.getState.mockResolvedValue({
    ...bootstrapState('draft', 13),
    snapshot: { ...bootstrapState('draft', 13).snapshot, tabSetRevision: 99 },
  });

  fireEvent.click(retry);
  await waitFor(() => expect(newDocument).toHaveBeenCalledTimes(2));
  expect(newDocument.mock.calls[1]?.[0]).toBe(99);
  expect(newDocument.mock.calls[1]?.[0]).not.toBe(firstRevision);
  // The refusal is resolved, so the toast that carried the control goes.
  await waitFor(() =>
    expect(store.getState().notifications.items).toHaveLength(0),
  );

  mockedAppModelAdapter.newDocument = undefined;
  act((): void => disposeAppModelProjection());
});

// Proves: the classified error and remediation contract's `conflict` row
// (partial — that `open-recent` carries the path its retry needs, and that a
// retry with no path is not offered at all rather than rendered inert.)
it('T156 re-issues Open Recent against the same path and a fresh revision', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue({
    ...bootstrapState('draft', 12),
    snapshot: {
      ...bootstrapState('draft', 12).snapshot,
      tabSetRevision: 77,
      recentFiles: ['/documents/recent.md'],
    },
  });
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  const openRecentFile = jest
    .fn()
    .mockResolvedValueOnce({
      error: staleTabSetRefusal('The tab set changed; Open must be retried.'),
    })
    .mockResolvedValueOnce({
      activeBuffer: { documentId: 'document-3', content: '' },
    });
  mockedAppModelAdapter.openRecentFile = openRecentFile;

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'recent.md' }));

  const recentRetry = await screen.findByRole('button', { name: 'Retry' });
  expect(openRecentFile.mock.calls[0]).toEqual(['/documents/recent.md', 77]);
  mockedAppModelAdapter.getState.mockResolvedValue({
    ...bootstrapState('draft', 13),
    snapshot: {
      ...bootstrapState('draft', 13).snapshot,
      tabSetRevision: 78,
      recentFiles: ['/documents/recent.md'],
    },
  });

  fireEvent.click(recentRetry);
  await waitFor(() => expect(openRecentFile).toHaveBeenCalledTimes(2));
  expect(openRecentFile.mock.calls[1]).toEqual(['/documents/recent.md', 78]);

  mockedAppModelAdapter.openRecentFile = undefined;
  act((): void => disposeAppModelProjection());
});

/*
 * The construction-side guarantee, asserted directly rather than through the
 * interface: an intent whose arguments are missing must produce no control at
 * all. Without this the "do not add an intent without the command behind it"
 * rule holds only for the call sites that exist today.
 */
// Proves: the classified error and remediation contract (partial — the rule
// that a remediation is offered only when its command can run).
it('T156 offers no Retry for an intent whose command has no arguments to run with', () => {
  store.dispatch(resetNotifications());
  act((): void => {
    reportClassifiedError(
      store.dispatch,
      staleTabSetRefusal('The tab set changed; Open must be retried.'),
      'File operation failed',
      { intent: 'open-recent' },
    );
  });
  expect(store.getState().notifications.items[0]?.remediations).toEqual([]);

  store.dispatch(resetNotifications());
  act((): void => {
    reportClassifiedError(
      store.dispatch,
      staleTabSetRefusal('The tab set changed; the switch must be retried.'),
      'File operation failed',
      { intent: 'activate-document' },
    );
  });
  expect(store.getState().notifications.items[0]?.remediations).toEqual([]);
});

/*
 * The tab strip declares this intent (`DocumentTabs.tsx`) but the command runs
 * here, so the two halves are proved in the two places. `DocumentTabs.test.tsx`
 * owns the declaration; this owns the execution.
 */
// Proves: the classified error and remediation contract's `conflict` row
// (partial — the tab-activation `Retry` re-issuing against a fresh revision.)
it('T156 re-activates the named tab against a fresh revision from the Retry', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue({
    ...bootstrapState('draft', 12),
    snapshot: { ...bootstrapState('draft', 12).snapshot, tabSetRevision: 63 },
  });
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  const activateDocument = jest.fn().mockResolvedValue({});
  mockedAppModelAdapter.activateDocument = activateDocument;

  render(<App />);
  await screen.findByRole('button', { name: 'File' });
  act((): void => {
    reportClassifiedError(
      store.dispatch,
      staleTabSetRefusal('The tab set changed; the switch must be retried.'),
      'File operation failed',
      { intent: 'activate-document', retry: { documentId: 'document-1' } },
    );
  });

  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(activateDocument).toHaveBeenCalledTimes(1));
  expect(activateDocument).toHaveBeenCalledWith('document-1', 63);

  mockedAppModelAdapter.activateDocument = undefined;
  act((): void => disposeAppModelProjection());
});

function tabSetSnapshot(): AppModelState['snapshot'] {
  const view = {
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
    revision: 12,
    tabSetRevision: 63,
    applicationVersion: 'test-build',
    documents: {
      'document-1': {
        documentId: 'document-1',
        title: 'One',
        path: '/documents/one.md',
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 1,
        contentRevision: 5,
        view,
      },
      'document-2': {
        documentId: 'document-2',
        title: 'Two',
        path: '/documents/two.md',
        dirty: false,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 1,
        contentRevision: 1,
        view,
      },
    },
    orderedDocumentIds: ['document-1', 'document-2'],
    activeDocumentId: 'document-1',
    ui: { sidebarVisible: true },
  };
}

function activationRefusal(dedupKey: string): ClassifiedError {
  return {
    category: 'conflict',
    message: 'The tab set changed; the switch must be retried.',
    remediations: ['Retry'],
    dedupKey,
    safeSubject: 'one.md',
  };
}

/*
 * SC-FT-003 requires a stale or failed switch to produce zero cross-document
 * text installations, and FR-FT-030 says the acknowledgement "may be applied
 * only while both values still match the confirmed active projection". Two
 * switches are issued; the losing one resolves last and must be dropped on
 * arrival rather than overwriting the winner's source.
 */
// Proves: FR-FT-030 (the identity-and-revision guard on tab activation). The
// clause "inactive reloads update backend state only until later activation"
// is not exercised here — no reload is issued.
// Proves: SC-FT-003 (partial — the "stale … switches produce zero cross-
// document text installations" clause, for one supersession between two
// documents). It does NOT prove the failed-switch arm (see T140 below), the
// criterion's "repeated switches among 40 distinct documents" scale, or its
// caret/selection/scroll restoration half. Scope map:
// specs/003-real-files-and-tabs/evidence/sc-ft-003/switch-integrity.md
it('T128 never installs the acknowledgement of a superseded tab switch', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue({
    snapshot: tabSetSnapshot(),
    activeBuffer: { documentId: 'document-1', content: 'initial content' },
  });
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());

  let resolveSuperseded:
    | ((result: { data: { documentId: string; content: string } }) => void)
    | undefined;
  const activateDocument = jest.fn(
    async (documentId: string): Promise<unknown> => {
      if (documentId === 'document-2') {
        return new Promise((resolve): void => {
          resolveSuperseded = resolve as typeof resolveSuperseded;
        });
      }
      return {
        data: {
          documentId: 'document-1',
          documentRevision: 5,
          projectionRevision: 12,
          content: 'winning source',
        },
      };
    },
  );
  mockedAppModelAdapter.activateDocument =
    activateDocument as unknown as AppModelAdapter['activateDocument'];

  render(<App />);
  await screen.findByRole('button', { name: 'File' });

  act((): void => {
    reportClassifiedError(
      store.dispatch,
      activationRefusal('switch-to-two'),
      'File operation failed',
      { intent: 'activate-document', retry: { documentId: 'document-2' } },
    );
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await waitFor((): void =>
    expect(activateDocument).toHaveBeenCalledWith('document-2', 63),
  );

  act((): void => {
    reportClassifiedError(
      store.dispatch,
      activationRefusal('switch-back-to-one'),
      'File operation failed',
      { intent: 'activate-document', retry: { documentId: 'document-1' } },
    );
  });
  const retries = await screen.findAllByRole('button', { name: 'Retry' });
  fireEvent.click(retries[retries.length - 1] as HTMLElement);
  await waitFor((): void =>
    expect(activateDocument).toHaveBeenCalledWith('document-1', 63),
  );
  await waitFor((): void =>
    expect(
      screen.getByRole('status', { name: 'Active editor buffer' }),
    ).toHaveTextContent('winning source'),
  );

  await act(async (): Promise<void> => {
    resolveSuperseded?.({
      data: {
        documentId: 'document-2',
        documentRevision: 1,
        projectionRevision: 13,
        content: 'superseded cross-document source',
      } as { documentId: string; content: string },
    });
    await Promise.resolve();
  });

  const buffer = screen.getByRole('status', { name: 'Active editor buffer' });
  expect(buffer).not.toHaveTextContent('superseded cross-document source');
  expect(buffer).toHaveTextContent('winning source');

  mockedAppModelAdapter.activateDocument = undefined;
  act((): void => disposeAppModelProjection());
});

/*
 * FR-FT-031's failure clause reaches the shell as well as the tab strip. The
 * outgoing flush lives in `onActivateDocument`, which the `Retry` remediation
 * calls directly, so a rejection there used to escape as an unhandled promise
 * rejection with nothing shown and the switch silently abandoned.
 */
// Proves: FR-FT-031 (the failure clause, on the shell's activation handler:
// the failure is reported, the outgoing tab stays active, and no incoming
// content is installed). The flush-and-await *ordering* is proved separately.
// Proves: SC-FT-003 (partial — the "failed switches produce zero cross-document
// text installations" clause only, for an outgoing-flush rejection). The stale
// arm is T128 above; neither the 40-document scale nor the restoration half is
// exercised here. Scope map:
// specs/003-real-files-and-tabs/evidence/sc-ft-003/switch-integrity.md
it('T140 refuses a switch whose outgoing flush fails and installs no incoming content', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue({
    snapshot: tabSetSnapshot(),
    activeBuffer: { documentId: 'document-1', content: 'outgoing content' },
  });
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.flushActiveSession = jest.fn(async () => {
    throw new Error(
      'The active editor activation changed while its lifecycle state was being flushed.',
    );
  });
  const activateDocument = jest.fn().mockResolvedValue({
    data: {
      documentId: 'document-2',
      documentRevision: 1,
      projectionRevision: 12,
      content: 'incoming content that must not install',
    },
  });
  mockedAppModelAdapter.activateDocument = activateDocument;

  render(<App />);
  await screen.findByRole('button', { name: 'File' });
  act((): void => {
    reportClassifiedError(
      store.dispatch,
      activationRefusal('switch-to-two'),
      'File operation failed',
      { intent: 'activate-document', retry: { documentId: 'document-2' } },
    );
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

  await waitFor(() =>
    expect(mockedAppModelAdapter.flushActiveSession).toHaveBeenCalledWith(
      'document-1',
    ),
  );
  await waitFor(() =>
    expect(
      store
        .getState()
        .notifications.items.filter(
          (item) => item.subject === 'activate:outgoing-flush',
        ),
    ).toHaveLength(1),
  );
  expect(activateDocument).not.toHaveBeenCalled();
  expect(
    screen.getByRole('status', { name: 'Active editor buffer' }),
  ).toHaveTextContent('outgoing content');
  expect(store.getState().documents.activeDocumentId).toBe('document-1');

  mockedAppModelAdapter.activateDocument = undefined;
  mockedAppModelAdapter.flushActiveSession = jest.fn(async () => undefined);
  act((): void => disposeAppModelProjection());
});

// Proves: FR-FT-015 — "Automatic success MUST remain silent."
// Proves: FR-FT-017 — "never show a success toast."
// One assertion covers both: they are the same rule stated from the save side
// and the autosave side.
//
// Autosave never reaches the frontend as a command result. It arrives as an
// ordinary state patch that flips the document's projected status to
// `autosaved` (`internal/appmodel/save_status.go`), which is exactly why the
// clause is easy to break by accident: the silence holds only as long as
// nothing along the patch path decides an `autosaved` status deserves the same
// confirmation an explicit Save gets. The sibling above proves the explicit
// Save *does* toast, so this is the discriminating half — the pair is what says
// "one, and only for the explicit write".
it('T157 keeps an automatic save silent while an explicit one confirms', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('draft', 12));
  let publishStatePatch: ((patch: AppStatePatch) => void) | undefined;
  mockedAppModelAdapter.subscribeStatePatches.mockImplementation((listener) => {
    publishStatePatch = listener;
    return jest.fn();
  });

  render(<App />);
  await screen.findByRole('button', { name: 'File' });

  const autosaved = bootstrapState('draft', 12).snapshot.documents[
    'document-1'
  ] as DocumentMetadata;
  act((): void => {
    publishStatePatch?.({
      revision: 13,
      documents: {
        upsert: {
          'document-1': {
            ...autosaved,
            contentRevision: 2,
            dirty: false,
            status: 'autosaved',
          },
        },
      },
    });
  });

  // The projection really did accept the automatic write — otherwise the
  // silence below would prove only that nothing happened at all.
  await waitFor(() => {
    expect(store.getState().documents.byId['document-1']?.status).toBe(
      'autosaved',
    );
  });

  expect(store.getState().notifications.items).toEqual([]);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(/^Saved /)).toBeNull();

  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

// Proves: FR-FT-042 (partial — "MUST never restore prior tabs automatically".
// The launcher's own New/Open/six-recent contract and its first-run message are
// proved by Launcher.test.tsx and ShellMenuRow.test.tsx; this file stubs
// AppShell, so it can assert the restoration rule and not the launcher's
// rendering.)
//
// The rule is about startup, and startup here is one call: `getState()`, whose
// snapshot the store hydrates verbatim. A recent-files list is not a tab list,
// and the failure mode the clause forbids is treating it as one — opening the
// six remembered paths because they are remembered. So the fixture is the
// tempting case: six recent files, zero documents, no active identity. Nothing
// may be opened, activated or reopened, and the projection must stay empty.
it('T157 opens no document at startup even with six remembered recent files', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());

  const recentFiles = [
    '/documents/one.md',
    '/documents/two.md',
    '/documents/three.md',
    '/documents/four.md',
    '/documents/five.md',
    '/documents/six.md',
  ];
  mockedAppModelAdapter.getState.mockResolvedValue({
    snapshot: {
      revision: 7,
      applicationVersion: 'test-build',
      documents: {},
      orderedDocumentIds: [],
      activeDocumentId: undefined,
      recentFiles,
      canReopenLastFile: true,
      ui: { sidebarVisible: true },
    },
    activeBuffer: undefined,
  } as unknown as AppModelState);

  const openRecentFile = jest.fn();
  const reopenLastFile = jest.fn();
  const activateDocument = jest.fn();
  const openDocument = jest.fn();
  mockedAppModelAdapter.openRecentFile = openRecentFile;
  mockedAppModelAdapter.reopenLastFile = reopenLastFile;
  mockedAppModelAdapter.activateDocument = activateDocument;
  mockedAppModelAdapter.openDocument = openDocument;

  render(<App />);
  await screen.findByLabelText('Document area');
  await waitFor(() => {
    expect(store.getState().documents.revision).toBe(7);
  });

  // The remembered list is present — the fixture is the one that tempts a
  // restore, not an empty state that could not restore anything.
  expect(store.getState().documents.recentFiles).toEqual(recentFiles);
  // And nothing was opened from it.
  expect(store.getState().documents.byId).toEqual({});
  expect(store.getState().documents.orderedIds ?? []).toEqual([]);
  expect(store.getState().documents.activeDocumentId ?? null).toBeNull();
  expect(openRecentFile).not.toHaveBeenCalled();
  expect(reopenLastFile).not.toHaveBeenCalled();
  expect(activateDocument).not.toHaveBeenCalled();
  expect(openDocument).not.toHaveBeenCalled();

  mockedAppModelAdapter.openRecentFile = undefined;
  mockedAppModelAdapter.reopenLastFile = undefined;
  mockedAppModelAdapter.activateDocument = undefined;
  mockedAppModelAdapter.openDocument = undefined;
  act((): void => disposeAppModelProjection());
});

/*
 * T169 — FR-FT-030's reload arm, the half T128 left behind.
 *
 * FR-FT-030 covers "activating a tab **or reloading the active document**" and
 * allows the acknowledgement to be applied "only while both values still match
 * the confirmed active projection". T128 routed all five *activation* installs
 * through `useGuardedActivation`; the reload arm still installed on an identity
 * check alone — and its `else` branch installed `result.activeBuffer` with **no
 * check whatsoever**, firing precisely when the refreshed state showed a
 * different active document. So a reload overtaken by a tab switch wrote the
 * reloaded document's text over whatever the user had switched to: the
 * cross-document text installation SC-FT-003 requires to be impossible.
 */
// Proves: FR-FT-030 (the reload arm of the identity-and-revision guard)
// Proves: SC-FT-003 (partial — "zero cross-document text installations", for a
// reload overtaken by a switch. The activation arm is T128; the failed-switch
// arm is T140; the 40-document scale is T185.)
it('T169 never installs a reload acknowledgement overtaken by a document switch', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedAppModelAdapter.getState.mockResolvedValue(
    bootstrapState('mine\n', 12),
  );
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'conflict',
    conflict: {
      documentId: 'document-1',
      displayName: 'one.md',
      contentRevision: 0,
      detectedDiskVersion: {
        exists: true,
        size: 5,
        modifiedUnixNano: '1',
        mode: 0o644,
      },
      onDisk: { text: 'disk\n', lineCount: 1, byteCount: 5, truncated: false },
      yours: { text: 'mine\n', lineCount: 1, byteCount: 5, truncated: false },
      readOnly: false,
    },
  });
  mockedAppModelAdapter.flushActiveSession = jest.fn(async () => undefined);

  // The reload is held open so the tab switch can overtake it, exactly as T128
  // holds a superseded activation open.
  type ReloadAnswer = Awaited<
    ReturnType<typeof mockedDocumentConflictAdapter.reloadFromDisk>
  >;
  let resolveReload: ((value: ReloadAnswer) => void) | undefined;
  mockedDocumentConflictAdapter.reloadFromDisk.mockReset().mockImplementation(
    async () =>
      new Promise((resolve): void => {
        resolveReload = resolve;
      }),
  );

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));
  await screen.findByRole('dialog', { name: 'File changed on disk' });
  fireEvent.click(screen.getByRole('button', { name: 'Reload from disk' }));
  await waitFor(() =>
    expect(mockedDocumentConflictAdapter.reloadFromDisk).toHaveBeenCalled(),
  );

  // The user switches away while the reload is in flight. Both the projection
  // and the state the handler re-reads now describe document-2.
  const switched = bootstrapState('second document text', 14);
  switched.snapshot.documents['document-2'] = {
    ...switched.snapshot.documents['document-1'],
    documentId: 'document-2',
    title: 'Two',
    path: '/documents/two.md',
  };
  switched.snapshot.activeDocumentId = 'document-2';
  switched.activeBuffer = {
    documentId: 'document-2',
    content: 'second document text',
  };
  mockedAppModelAdapter.getState.mockResolvedValue(switched);
  act((): void => {
    store.dispatch(hydrateProjection(switched.snapshot));
  });

  await act(async (): Promise<void> => {
    resolveReload?.({
      status: 'reloaded',
      documentId: 'document-1',
      activeBuffer: { documentId: 'document-1', content: 'stale reload text' },
    } as ReloadAnswer);
    await Promise.resolve();
  });

  const buffer = screen.getByRole('status', { name: 'Active editor buffer' });
  expect(buffer).not.toHaveTextContent('stale reload text');

  mockedAppModelAdapter.flushActiveSession = undefined;
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

/*
 * T170 — FR-FT-031's reporting clause on the `Retry` path.
 *
 * `onActivateDocument` reports the *outgoing-flush* refusal itself (T140) but
 * returns a backend refusal unreported, leaving the reporting to
 * `DocumentTabs.activateDocument`'s funnel — which every tab click goes through
 * and which the `Retry` control does not, because it calls the handler
 * directly. `onRemediate`'s arm then ends `if (result === undefined ||
 * result.error !== undefined) return;`, so a stale-tab-set refusal met *on the
 * retry* produced nothing at all: the original toast sat there with its original
 * message and no sign the second attempt had failed too.
 *
 * The other four entry intents already self-report through `reportEntryError`,
 * so this is the one handler that delegated its reporting somewhere the retry
 * cannot reach — which is why the fix is to make it self-report like its
 * siblings rather than to special-case the remediation arm.
 */
// Proves: FR-FT-031 (a refusal met on the Retry path is reported, and the
// original notification is not dismissed to hide it)
it('T170 reports an activation refusal met on the Retry path', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue({
    snapshot: tabSetSnapshot(),
    activeBuffer: { documentId: 'document-1', content: 'initial content' },
  });
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  // The re-issue is refused again, which is the case a Retry is most likely to
  // meet: the tab set moved again between the two attempts.
  mockedAppModelAdapter.activateDocument = jest.fn(async () => ({
    error: activationRefusal('activate:document-2'),
  })) as unknown as AppModelAdapter['activateDocument'];

  render(<App />);
  await screen.findByRole('button', { name: 'File' });
  act((): void => {
    reportClassifiedError(
      store.dispatch,
      activationRefusal('activate:document-2'),
      'File operation failed',
      { intent: 'activate-document', retry: { documentId: 'document-2' } },
    );
  });

  const before = store.getState().notifications.items;
  expect(before).toHaveLength(1);
  expect(before[0]?.count).toBe(1);

  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(mockedAppModelAdapter.activateDocument).toHaveBeenCalled(),
  );

  // The second refusal must leave a trace. It is the same failure, so the
  // contract dedups it onto the standing notification and raises its count —
  // which is what the toast renders as the repeat indicator.
  await waitFor(() => {
    expect(store.getState().notifications.items[0]?.count).toBe(2);
  });
  // And the original must still be there: a fix that dismissed it would hide
  // the problem rather than report it.
  expect(store.getState().notifications.items).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();

  mockedAppModelAdapter.activateDocument = undefined;
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

/*
 * T168 — FR-FT-011's cancellation arm, on the prompt a person actually drives.
 *
 * A mixed-ending Save mints a single-use authorization into
 * `service.normalizations` and returns it as `WriteResult.DecisionToken`, which
 * is how the prompt is raised. Confirming consumes it. Dismissing released
 * nothing: `onCancel` only called `setNormalization(null)`, so the authorization
 * survived for the process lifetime and the next Save minted another. T135
 * closed the identical leak on the autosave arm by routing a refused attempt
 * through `CancelNormalization`; that primitive had no other caller and was not
 * on the Wails-bound surface at all, so the frontend could not reach it.
 */
// Proves: FR-FT-011 (the cancellation arm — a dismissed prompt releases its
// authorization rather than leaking it)
it('T168 releases the normalization authorization when the prompt is dismissed', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  store.dispatch(resetNotifications());
  mockedAppModelAdapter.getState.mockReset();
  mockedAppModelAdapter.getState.mockResolvedValue(bootstrapState('mixed', 12));
  mockedAppModelAdapter.subscribeStatePatches.mockReset();
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());
  mockedDocumentWriteAdapter.save.mockReset().mockResolvedValue({
    status: 'needs-normalization',
    decisionToken: 'authorization-token',
    proposedEnding: 'lf',
    documentRevision: 3,
  });
  const cancelNormalization = jest.fn(async () => ({}));
  mockedDocumentWriteAdapter.cancelNormalization =
    cancelNormalization as unknown as typeof mockedDocumentWriteAdapter.cancelNormalization;

  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));
  await screen.findByRole('dialog', { name: 'Normalize line endings?' });

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  // The token the prompt was raised with must be handed back, for the document
  // it was minted against — releasing some other token would leak this one.
  await waitFor(() => {
    expect(cancelNormalization).toHaveBeenCalledWith(
      'document-1',
      'authorization-token',
    );
  });
  store.dispatch(resetNotifications());
  act((): void => disposeAppModelProjection());
});

/*
 * T176 — the property the swap above establishes, pinned so it cannot be undone
 * by reintroducing a hand-written map.
 *
 * The superseded double carried about a dozen keys and fell back to returning
 * the key itself for everything else, silently. Any assertion on a key outside
 * that map was therefore meaningless: the component rendered the bare key, the
 * assertion matched the bare key, and the test passed whether or not the string
 * existed in `en.json`. T124 lost time to exactly this.
 */
// Proves: the translator double is the catalogue rather than a copy of it
it('T176 translates from en.json rather than a hand-maintained copy', () => {
  // Three keys the superseded map never carried, all rendered by production
  // code this suite drives: the tab-strip label, the dedup repeat indicator and
  // the reorder announcement.
  for (const key of ['editor.tabs', 'notification.count', 'editor.tab.moved']) {
    expect(t(key)).toBe(englishCatalog[key as keyof typeof englishCatalog]);
    // The catalogue's value, not the key echoed back — which is what the old
    // double returned for every one of these.
    expect(t(key)).not.toBe(key);
  }
});
