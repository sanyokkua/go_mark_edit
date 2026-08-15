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

jest.mock('./i18n', () => ({
  t: (key: string, values: Record<string, string> = {}): string => {
    const copy: Record<string, string> = {
      'recovery.title': 'Editor recovery needed',
      'recovery.quit.action': 'Quit and discard newer unsaved changes',
      'recovery.quit.cancel': 'Cancel',
      'recovery.quit.confirm': 'Quit and discard',
      'recovery.quit.message':
        'The file was saved on disk, but editor-state recovery failed. Quit and discard newer unsaved changes for the affected documents?',
      'recovery.quit.title': 'Confirm quit and discard',
      'save.readOnly': 'This document is read-only and cannot be saved.',
      'save.success.message': 'Saved {filename} · {encoding} · {lineEnding}',
      'save.success.title': 'Saved',
      'status.encoding.utf-8': 'UTF-8',
      'status.lineEnding.crlf': 'CRLF',
      'status.lineEnding.lf': 'LF',
    };
    return Object.entries(values).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, value),
      copy[key] ?? key,
    );
  },
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
import type { WireError } from './logic/utils/parseError';
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
  mockedNativeLifecycleAdapter.authorizeQuit.mockReset().mockResolvedValue();
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
      remediation: 'Retry',
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

it('T009 operates File New through the real menu and installs its acknowledged buffer', async () => {
  act((): void => disposeAppModelProjection());
  store.dispatch(resetProjection());
  const newDocument = jest.fn(async (expectedTabSetRevision: number) => {
    void expectedTabSetRevision;
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
  mockedAppModelAdapter.subscribeStatePatches.mockReturnValue(jest.fn());

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
      remediation: 'Retry',
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
      remediation: 'Retry',
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
    remediation: {
      action: 'retry',
      documentId: 'document-1',
      intent: 'save',
      labelKey: 'action.retry.label',
    },
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
      remediation: 'Cancel',
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
        remediation: {
          action: 'copy-path',
          documentId: 'document-1',
          intent: 'copy-path',
          labelKey: 'action.copy-path.label',
        },
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

// Proves: FR-FT-015 (partial — the explicit confirmation; "automatic success remains silent" is unproven; T157)
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
  mockedNativeLifecycleAdapter.authorizeQuit.mockReset().mockResolvedValue();
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
      remediation: 'Cancel' as const,
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
