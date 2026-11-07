import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AppShellProps } from '../../src/ui/widgets/AppShell';

const mockShellProps: AppShellProps[] = [];

jest.mock('../../src/ui/widgets/AppShell', () => {
    const React = jest.requireActual<typeof import('react')>('react');
    const actual = jest.requireActual<typeof import('../../src/ui/widgets/AppShell')>('../../src/ui/widgets/AppShell');
    return {
        __esModule: true,
        default: (props: AppShellProps) => {
            mockShellProps.push(props);
            return React.createElement(actual.default, props);
        },
    };
});

jest.mock('../../src/logic/adapter/events', () => ({ subscribeFileDrops: jest.fn(() => jest.fn()) }));

// JSDOM cannot load Vite's ?worker module; App only needs the browser factory when a tidy action runs.
jest.mock('../../src/logic/tidy/workerFactory', () => ({ createTidyWorker: jest.fn() }));

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
        subscribeBufferSyncErrors: jest.fn(() => jest.fn()),
        subscribeSupersededBuffers: jest.fn(() => jest.fn()),
        newDocument: jest.fn(),
        chooseWorkspaceFolder: jest.fn(),
        openWorkspace: jest.fn(),
        openPreviewLink: jest.fn(),
        setUILayout: jest.fn(),
    },
    settingsAdapter: {
        getSettings: jest.fn(async () => ({
            appearance: {
                defaultOpenMode: 'editor',
                readingWidth: 'page',
                mode: 'auto',
                theme: 'material',
            },
        })),
        updateAppearance: jest.fn(async () => undefined),
    },
    nativeLifecycleAdapter: { requestQuit: jest.fn() },
    windowAdapter: { toggleFullscreen: jest.fn(), takeLaunchTarget: jest.fn(async () => undefined) },
}));

import { useBootstrap } from '../../src/app/useBootstrap';
import App from '../../src/app/App';
import { appModelAdapter, windowAdapter } from '../../src/logic/adapter';
import { store } from '../../src/logic/store';
import type { WireError } from '../../src/logic/utils/parseError';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { applyStatePatch, hydrateProjection } from '../../src/logic/store/appModelProjectionActions';
import { createTidyWorker } from '../../src/logic/tidy/workerFactory';
import { createCommandRecorder } from '../support/commandRecorder';
import { t } from '../../src/i18n';

const mockedUseBootstrap = useBootstrap as jest.MockedFunction<typeof useBootstrap>;

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
            recentItems: [],
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
    mockShellProps.length = 0;
    document.documentElement.removeAttribute('data-mode');
    document.documentElement.removeAttribute('data-theme');
});

it('connects the link command to the real application shell', async () => {
    mockedUseBootstrap.mockReturnValue(readyBootstrap());
    hydrateEmptyProjection();

    render(<App />);
    await waitFor(() => expect(mockShellProps.length).toBeGreaterThan(0));

    expect(mockShellProps.at(-1)?.onOpenLink).toEqual(expect.any(Function));
    await act(async () => {
        await (
            mockShellProps.at(-1)?.onOpenLink as (
                target: { kind: 'localDocument'; href: string },
                sourceId: string,
            ) => Promise<void>
        )({ kind: 'localDocument', href: './target.md' }, 'source');
    });
    expect(appModelAdapter.openPreviewLink).toHaveBeenCalledWith('source', './target.md');
});

async function waitForAppearanceHydration(): Promise<void> {
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'material'));
}

it('routes a failed startup through the recovery surface with Quit available', async () => {
    render(<App />);
    await waitForAppearanceHydration();

    expect(createTidyWorker).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: /could not initialize/i })).toHaveTextContent('Settings: database');
    expect(screen.getByRole('button', { name: 'Quit' })).toBeEnabled();
});

it('composes the four application menus at the app boundary', async () => {
    mockedUseBootstrap.mockReturnValue(readyBootstrap());
    hydrateEmptyProjection();

    render(<App />);
    await waitForAppearanceHydration();

    expect(createTidyWorker).not.toHaveBeenCalled();
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
    (appModelAdapter.newDocument as jest.Mock).mockImplementation((expectedTabSetRevision: number) =>
        newDocumentBinding({ id: 'app-test-new-document' }, expectedTabSetRevision),
    );

    render(<App />);
    await waitForAppearanceHydration();
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    const newItem = within(screen.getByRole('menu', { name: 'File' })).getByRole('menuitem', { name: 'New File' });
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

    expect(await screen.findByText('The window already contains 40 documents.')).toBeVisible();
});

it('routes the Launcher Open Folder action to the native folder picker', async () => {
    mockedUseBootstrap.mockReturnValue(readyBootstrap());
    hydrateEmptyProjection();
    (appModelAdapter.chooseWorkspaceFolder as jest.Mock).mockResolvedValue({ status: 'cancelled' });

    render(<App />);
    await waitForAppearanceHydration();
    fireEvent.click(within(screen.getByTestId('document-launcher')).getByRole('button', { name: 'Open Folder' }));

    await waitFor(() => expect(appModelAdapter.chooseWorkspaceFolder).toHaveBeenCalledTimes(1));
    expect(appModelAdapter.openWorkspace).not.toHaveBeenCalled();
});

it('leaves sidebar visibility to the backend when startup hydration includes a folder', async () => {
    mockedUseBootstrap.mockReturnValue(readyBootstrap());
    store.dispatch(
        hydrateProjection({
            activeDocumentId: null,
            documents: {},
            orderedDocumentIds: [],
            revision: 2,
            tabSetRevision: 2,
            workspace: {
                rootPath: '/notes',
                rootName: 'notes',
                root: { path: '/notes', name: 'notes', isDir: true },
                totalEntries: 1,
                truncated: false,
                unavailable: false,
                filterSuffixes: ['.md'],
                showHiddenFolders: false,
            },
            ui: { sidebarVisible: false },
        }),
    );
    (appModelAdapter.setUILayout as jest.Mock).mockResolvedValue(undefined);

    render(<App />);
    await waitForAppearanceHydration();

    expect(screen.getByTestId('application-shell')).toHaveAttribute('data-workspace-visible', 'false');
    expect(appModelAdapter.setUILayout).not.toHaveBeenCalled();
});

it('leaves sidebar visibility to the backend when a folder open publishes a new root', async () => {
    mockedUseBootstrap.mockReturnValue(readyBootstrap());
    store.dispatch(
        hydrateProjection({
            activeDocumentId: null,
            documents: {},
            orderedDocumentIds: [],
            revision: 3,
            tabSetRevision: 3,
            ui: { sidebarVisible: false },
        }),
    );
    (appModelAdapter.setUILayout as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.chooseWorkspaceFolder as jest.Mock).mockResolvedValue({ status: 'chosen', path: '/notes' });
    (appModelAdapter.openWorkspace as jest.Mock).mockImplementation(async () => {
        store.dispatch(
            applyStatePatch({
                revision: 4,
                workspace: {
                    rootPath: '/notes',
                    rootName: 'notes',
                    root: { path: '/notes', name: 'notes', isDir: true },
                    totalEntries: 1,
                    truncated: false,
                    unavailable: false,
                    filterSuffixes: ['.md'],
                    showHiddenFolders: false,
                },
            }),
        );
        return { status: 'opened' };
    });

    render(<App />);
    await waitForAppearanceHydration();
    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));

    await waitFor(() => expect(appModelAdapter.chooseWorkspaceFolder).toHaveBeenCalled());
    expect(appModelAdapter.setUILayout).not.toHaveBeenCalled();
});

it('reports a buffer sync error once through application notifications and unsubscribes', async () => {
    mockedUseBootstrap.mockReturnValue(readyBootstrap());
    hydrateEmptyProjection();
    store.dispatch(resetNotifications());
    const unsubscribe = jest.fn();
    let listener: ((error: WireError) => void) | undefined;
    jest.mocked(appModelAdapter.subscribeBufferSyncErrors).mockImplementation((onError) => {
        listener = onError;
        return unsubscribe;
    });
    const view = render(<App />);
    await waitForAppearanceHydration();
    expect(listener).toBeDefined();
    act(() => listener?.({ code: 'io', title: 'Buffer delivery', message: 'Could not sync', retryable: true }));
    expect(store.getState().notifications.items.filter((item) => item.code === 'io')).toHaveLength(1);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
});

it('warns once through application notifications when an editor update was based on replaced text', async () => {
    mockedUseBootstrap.mockReturnValue(readyBootstrap());
    hydrateEmptyProjection();
    store.dispatch(resetNotifications());
    const unsubscribe = jest.fn();
    let listener: Parameters<typeof appModelAdapter.subscribeSupersededBuffers>[0] | undefined;
    jest.mocked(appModelAdapter.subscribeSupersededBuffers).mockImplementation((onSuperseded) => {
        listener = onSuperseded;
        return unsubscribe;
    });
    const view = render(<App />);
    await waitForAppearanceHydration();
    const superseded = { documentId: 'document-1', content: 'kept', baseRevision: 4, currentRevision: 9 };
    act(() => {
        listener?.(superseded);
        listener?.(superseded);
    });
    const warnings = store.getState().notifications.items.filter((item) => item.code === 'buffer-superseded');
    expect(warnings).toEqual([
        expect.objectContaining({
            severity: 'warning',
            title: t('editor.bufferSuperseded.title'),
            message: t('editor.bufferSuperseded.message'),
        }),
    ]);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
});

it('reports a rejected fullscreen toggle', async () => {
    mockedUseBootstrap.mockReturnValue(readyBootstrap());
    hydrateEmptyProjection();
    store.dispatch(resetNotifications());
    (windowAdapter.toggleFullscreen as jest.Mock).mockRejectedValueOnce(new Error('fullscreen unavailable'));
    render(<App />);
    await waitForAppearanceHydration();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /full screen/i }));
    await waitFor(() =>
        expect(store.getState().notifications.items.some((item) => item.code === 'internal')).toBe(true),
    );
});
