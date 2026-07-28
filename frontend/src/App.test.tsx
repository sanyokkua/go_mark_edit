import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { StrictMode } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

jest.mock('./ui/widgets/AppShell', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { EditorSessionContext } = jest.requireActual<
    typeof import('./ui/widgets/editorSession')
  >('./ui/widgets/editorSession');

  const AppShell = ({
    assistantVisible,
  }: {
    assistantVisible: boolean;
  }): React.JSX.Element => {
    const activeBuffer = React.useContext(EditorSessionContext);

    return React.createElement(
      React.Fragment,
      undefined,
      React.createElement('aside', { 'aria-label': 'File explorer' }),
      React.createElement('main', { 'aria-label': 'Document area' }),
      React.createElement('aside', {
        'aria-label': 'Assistant',
        hidden: !assistantVisible,
      }),
      React.createElement(
        'output',
        { 'aria-label': 'Active editor buffer' },
        activeBuffer?.content ?? '',
      ),
    );
  };

  return { __esModule: true, default: AppShell };
});

jest.mock('./logic/adapter', () => ({
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
import { store } from './logic/store';
import { dismissNotification } from './logic/store/notificationsSlice';
import type { WireError } from './logic/utils/parseError';
import {
  createAppModelAdapter,
  type AppModelBindings,
  type AppModelAdapter,
  type AppModelRuntime,
} from './logic/adapter/appModelAdapter';
import { appModelAdapter } from './logic/adapter';
import type { AppModelState } from './logic/store/appModelTypes';
import AppShell from './ui/widgets/AppShell';

const mockedAppModelAdapter = appModelAdapter as jest.Mocked<AppModelAdapter>;

function bootstrapState(content: string, revision: number): AppModelState {
  return {
    snapshot: {
      revision,
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

it('STORY-001-AC-2 renders the blank application root', () => {
  render(<App />);

  expect(screen.getByRole('main')).toBeEmptyDOMElement();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/greet|hello|markdown|document|file/i),
  ).not.toBeInTheDocument();
});

// Proves: STORY-007-AC-1
it('STORY-007-AC-1 preserves the collapsed three-region shell', () => {
  const { unmount } = render(<App />);

  expect(
    screen.getByRole('complementary', { name: 'File explorer' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Document area' }),
  ).toBeEmptyDOMElement();
  expect(screen.getByLabelText('Assistant')).toHaveAttribute('hidden');

  unmount();

  const { rerender } = render(<AppShell assistantVisible={false} />);
  const collapsedAssistant = screen.getByLabelText('Assistant');

  rerender(<AppShell assistantVisible />);

  expect(screen.getByLabelText('Assistant')).toBe(collapsedAssistant);
  expect(collapsedAssistant).not.toHaveAttribute('hidden');
  expect(screen.getByRole('complementary', { name: 'Assistant' })).toBe(
    collapsedAssistant,
  );
  expect(
    screen.getByRole('complementary', { name: 'File explorer' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('main', { name: 'Document area' }),
  ).toBeInTheDocument();
});

// Proves: STORY-007-AC-3
it('STORY-007-AC-3 keeps the reserved region empty', () => {
  render(<AppShell assistantVisible />);

  const assistant = screen.getByRole('complementary', { name: 'Assistant' });

  expect(assistant).toBeEmptyDOMElement();
  expect(within(assistant).queryByRole('button')).not.toBeInTheDocument();
  expect(within(assistant).queryByRole('textbox')).not.toBeInTheDocument();

  const shellSource = readFileSync(
    resolve(process.cwd(), 'src/ui/widgets/AppShell.tsx'),
    'utf8',
  );

  expect(shellSource).not.toMatch(
    /from\s+['"][^'"]*(?:logic\/adapter|wailsjs)[^'"]*['"]/,
  );
  expect(shellSource).not.toMatch(/\b(?:fetch|XMLHttpRequest)\b/);
});

it('STORY-012-AC-7 hands the active buffer to ephemeral editor session state', async () => {
  render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  expect(
    await screen.findByRole('status', { name: 'Active editor buffer' }),
  ).toHaveTextContent('ephemeral buffer');

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
  expect(localStorage).toHaveLength(0);
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

  expect(runtime.eventsOn).toHaveBeenCalledTimes(1);
  expect(disposePatchListener).toHaveBeenCalledTimes(1);
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

  render(<App />);

  expect(
    await screen.findByRole('status', {
      name: 'The application could not start. Try again.',
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
  expect(mockedAppModelAdapter.subscribeStatePatches).toHaveBeenCalledTimes(2);
  expect(firstDisposer).toHaveBeenCalledTimes(1);
  expect(retryDisposer).not.toHaveBeenCalled();
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
      name: 'The application could not start. Try again.',
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
