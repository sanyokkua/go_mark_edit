import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

jest.mock('../../src/i18n', () =>
  jest.requireActual('../../src/test/i18nShim'),
);

jest.mock('../../src/app/useBootstrap', () => ({
  useBootstrap: jest.fn(),
}));

jest.mock('../../src/app/useShutdown', () => ({
  useShutdown: jest.fn(() => ({
    authorizeQuit: jest.fn(async () => undefined),
    cancelQuit: jest.fn(async () => undefined),
    clearPendingClose: jest.fn(),
    pendingClose: null,
    requestQuit: jest.fn(),
  })),
}));

jest.mock('../../src/logic/adapter', () => ({
  appModelAdapter: {
    newDocument: jest.fn(),
  },
  settingsAdapter: {
    getSettings: jest.fn(async () => ({
      appearance: {
        defaultOpenMode: 'editor',
        mode: 'auto',
        theme: 'material',
      },
    })),
    updateAppearance: jest.fn(async () => undefined),
  },
  nativeLifecycleAdapter: { requestQuit: jest.fn() },
  windowAdapter: { toggleFullscreen: jest.fn() },
}));

import { useBootstrap } from '../../src/app/useBootstrap';
import App from '../../src/app/App';
import { appModelAdapter } from '../../src/logic/adapter';
import { store } from '../../src/logic/store';
import { hydrateProjection } from '../../src/logic/store/appModelProjectionActions';
import { createCommandRecorder } from '../support/commandRecorder';

const mockedUseBootstrap = useBootstrap as jest.MockedFunction<
  typeof useBootstrap
>;

function readyBootstrap(): ReturnType<typeof useBootstrap> {
  return {
    failure: null,
    isRetrying: false,
    result: null,
    retry: jest.fn(),
    status: 'ready',
  };
}

function hydrateEmptyProjection(): void {
  store.dispatch(
    hydrateProjection({
      activeDocumentId: null,
      documents: {},
      orderedDocumentIds: [],
      recentFiles: [],
      revision: 1,
      tabSetRevision: 1,
      ui: {},
    }),
  );
}

beforeEach(() => {
  mockedUseBootstrap.mockReturnValue({
    failure: { category: 'database', step: 'settings', timedOut: false },
    isRetrying: false,
    result: null,
    retry: jest.fn(),
    status: 'failed',
  });
});

afterEach(() => {
  jest.clearAllMocks();
  document.documentElement.removeAttribute('data-mode');
  document.documentElement.removeAttribute('data-theme');
});

async function waitForAppearanceHydration(): Promise<void> {
  await waitFor(() =>
    expect(document.documentElement).toHaveAttribute('data-theme', 'material'),
  );
}

it('routes a failed startup through the recovery surface with Quit available', async () => {
  render(<App />);
  await waitForAppearanceHydration();

  expect(
    screen.getByRole('status', { name: /could not initialize/i }),
  ).toHaveTextContent('Settings: database');
  expect(screen.getByRole('button', { name: 'Quit' })).toBeEnabled();
});

it('composes the four application menus at the app boundary', async () => {
  mockedUseBootstrap.mockReturnValue(readyBootstrap());
  hydrateEmptyProjection();

  render(<App />);
  await waitForAppearanceHydration();

  const menu = screen.getByRole('navigation', { name: 'Application actions' });
  expect(within(menu).getByRole('button', { name: 'File' })).toBeEnabled();
  expect(within(menu).getByRole('button', { name: 'Settings' })).toBeEnabled();
  expect(within(menu).getByRole('button', { name: 'View' })).toBeEnabled();
  expect(within(menu).getByRole('button', { name: 'About' })).toBeEnabled();
});

it('routes a File/New command through the app command recorder', async () => {
  mockedUseBootstrap.mockReturnValue(readyBootstrap());
  hydrateEmptyProjection();
  const recorder = createCommandRecorder();
  const newDocumentBinding = recorder.binding('newDocument', 1);
  (appModelAdapter.newDocument as jest.Mock).mockImplementation(
    (expectedTabSetRevision: number) =>
      newDocumentBinding(
        { id: 'app-test-new-document' },
        expectedTabSetRevision,
      ),
  );

  render(<App />);
  await waitForAppearanceHydration();
  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  const newItem = within(screen.getByRole('menu', { name: 'File' })).getByRole(
    'menuitem',
    { name: 'New File' },
  );
  expect(newItem).toBeEnabled();
  fireEvent.click(newItem);

  await waitFor(() =>
    expect(recorder.calls).toEqual([
      {
        args: [1],
        name: 'newDocument',
        requestId: 'app-test-new-document',
      },
    ]),
  );
});

it('delivers a refused File/New result to the application notification surface', async () => {
  mockedUseBootstrap.mockReturnValue(readyBootstrap());
  hydrateEmptyProjection();
  (appModelAdapter.newDocument as jest.Mock).mockResolvedValue({
    error: {
      category: 'capacity-limit',
      dedupKey: 'app-new:capacity',
      message: 'The window already contains 40 documents.',
      remediations: [],
      safeSubject: 'Untitled',
    },
  });

  render(<App />);
  await waitForAppearanceHydration();
  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  fireEvent.click(
    within(screen.getByRole('menu', { name: 'File' })).getByRole('menuitem', {
      name: 'New File',
    }),
  );

  expect(
    await screen.findByText('The window already contains 40 documents.'),
  ).toBeVisible();
});
