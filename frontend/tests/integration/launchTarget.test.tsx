import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: {
        openRecentFile: jest.fn(),
        openWorkspace: jest.fn(),
        refreshRecentItems: jest.fn(),
        flushActiveSession: jest.fn(),
    },
    windowAdapter: { takeLaunchTarget: jest.fn() },
}));

import { useCommands } from '../../src/app/useCommands';
import { useLaunchTarget } from '../../src/app/useLaunchTarget';
import { appModelAdapter, windowAdapter } from '../../src/logic/adapter';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { documentFixture } from '../support/appFixtures';
import { resetReading } from '../../src/logic/store/readingSlice';

const model = appModelAdapter as unknown as Record<string, jest.Mock>;
const takeLaunchTarget = windowAdapter.takeLaunchTarget as jest.Mock;

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;
const strictWrapper = ({ children }: PropsWithChildren): React.JSX.Element => (
    <StrictMode>
        <Provider store={store}>{children}</Provider>
    </StrictMode>
);

function renderLaunchTarget(ready: boolean, options: { wrapper?: typeof wrapper } = {}) {
    const activation = { begin: jest.fn(() => 1), acknowledge: jest.fn(), isCurrent: jest.fn(() => true) };
    return renderHook(
        ({ isReady }: { isReady: boolean }) => {
            const commands = useCommands(
                { activeBuffer: null, activation } as unknown as Parameters<typeof useCommands>[0],
                async () => 'closed',
            );
            useLaunchTarget(commands, isReady);
        },
        { initialProps: { isReady: ready }, wrapper: options.wrapper ?? wrapper },
    );
}

beforeEach((): void => {
    store.dispatch(
        hydrateProjection({
            revision: 1,
            tabSetRevision: 4,
            activeDocumentId: null,
            orderedDocumentIds: [],
            documents: {},
            ui: {},
        }),
    );
    model.openRecentFile.mockResolvedValue({ status: 'opened', documentId: 'doc-1' });
    model.openWorkspace.mockResolvedValue({ status: 'opened' });
    model.flushActiveSession.mockResolvedValue(undefined);
});

afterEach((): void => {
    store.dispatch(resetProjection());
    store.dispatch(resetReading());
    store.dispatch(resetNotifications());
    jest.resetAllMocks();
});

it('opens a folder target as the workspace', async () => {
    takeLaunchTarget.mockResolvedValue({ path: '/notes', kind: 'folder' });
    renderLaunchTarget(true);

    await waitFor(() => expect(model.openWorkspace).toHaveBeenCalledWith('/notes'));
    expect(model.openRecentFile).not.toHaveBeenCalled();
});

it('opens a file target with the current tab-set revision', async () => {
    takeLaunchTarget.mockResolvedValue({ path: '/notes/a.md', kind: 'file' });
    renderLaunchTarget(true);

    await waitFor(() => expect(model.openRecentFile).toHaveBeenCalledWith('/notes/a.md', 4));
    expect(model.openWorkspace).not.toHaveBeenCalled();
});

it('opens nothing when no target was accepted', async () => {
    takeLaunchTarget.mockResolvedValue(undefined);
    renderLaunchTarget(true);

    await waitFor(() => expect(takeLaunchTarget).toHaveBeenCalledTimes(1));
    expect(model.openRecentFile).not.toHaveBeenCalled();
    expect(model.openWorkspace).not.toHaveBeenCalled();
});

it('does not take the target before bootstrap is ready, then takes it once', async () => {
    takeLaunchTarget.mockResolvedValue({ path: '/notes/a.md', kind: 'file' });
    const view = renderLaunchTarget(false);

    expect(takeLaunchTarget).not.toHaveBeenCalled();
    view.rerender({ isReady: true });
    await waitFor(() => expect(model.openRecentFile).toHaveBeenCalledTimes(1));
    view.rerender({ isReady: true });
    expect(takeLaunchTarget).toHaveBeenCalledTimes(1);
});

it('enters Reading mode when the opened file reports readingMode', async () => {
    takeLaunchTarget.mockResolvedValue({ path: '/notes/a.md', kind: 'file' });
    model.openRecentFile.mockImplementation(async () => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                tabSetRevision: 5,
                activeDocumentId: 'doc-1',
                orderedDocumentIds: ['doc-1'],
                documents: { 'doc-1': documentFixture('doc-1') },
                ui: {},
            }),
        );
        return { status: 'opened', documentId: 'doc-1', readingMode: true };
    });
    renderLaunchTarget(true);

    await waitFor(() => expect(store.getState().reading.active).toBe(true));
});

it('shows the refusal notice when the file cannot be opened', async () => {
    takeLaunchTarget.mockResolvedValue({ path: '/notes/gone.md', kind: 'file' });
    model.openRecentFile.mockResolvedValue({
        status: 'refused',
        error: { category: 'not-found', message: 'The file no longer exists.', remediations: [] },
    });
    renderLaunchTarget(true);

    await waitFor(() => expect(store.getState().notifications.items).toHaveLength(1));
    expect(store.getState().notifications.items[0]?.message).toContain('The file no longer exists.');
    expect(model.refreshRecentItems).toHaveBeenCalled();
});

it('opens the target exactly once under StrictMode', async () => {
    takeLaunchTarget.mockResolvedValueOnce({ path: '/notes/a.md', kind: 'file' }).mockResolvedValue(undefined);
    renderLaunchTarget(true, { wrapper: strictWrapper });

    await waitFor(() => expect(model.openRecentFile).toHaveBeenCalledTimes(1));
    await act(async (): Promise<void> => undefined);
    expect(model.openRecentFile).toHaveBeenCalledTimes(1);
});
