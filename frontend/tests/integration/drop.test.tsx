import type { PropsWithChildren } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: { classifyDroppedPaths: jest.fn() },
    windowAdapter: { openNewWindow: jest.fn(async () => undefined) },
}));
jest.mock('../../src/logic/adapter/events', () => ({ subscribeFileDrops: jest.fn(() => jest.fn()) }));

import { useDropHandler } from '../../src/app/useDropHandler';
import type { EntryCommandOutcome } from '../../src/app/useCommands';
import { appModelAdapter, windowAdapter } from '../../src/logic/adapter';
import { subscribeFileDrops } from '../../src/logic/adapter/events';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { applyStatePatch } from '../../src/logic/store/appModelProjectionActions';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { documentFixture } from '../support/appFixtures';
import WindowDropTarget from '../../src/ui/widgets/WindowDropTarget';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;
const classify = appModelAdapter.classifyDroppedPaths as jest.Mock;

function setup(
    files: string[] = [],
    folders: string[] = [],
    unsupported: string[] = [],
    currentFolder: string | null = null,
) {
    const onOpenRecentFile = jest.fn<Promise<EntryCommandOutcome | undefined>, [string, number, boolean?]>(
        async () => ({}),
    );
    const onOpenWorkspacePath = jest.fn(async () => undefined);
    store.dispatch(resetProjection());
    store.dispatch(resetNotifications());
    store.dispatch(
        hydrateProjection({
            revision: 1,
            tabSetRevision: 1,
            activeDocumentId: null,
            orderedDocumentIds: [],
            documents: {},
            workspace:
                currentFolder === null
                    ? undefined
                    : {
                          rootPath: currentFolder,
                          rootName: 'current',
                          root: { path: currentFolder, name: 'current', isDir: true },
                          totalEntries: 1,
                          truncated: false,
                          unavailable: false,
                          filterSuffixes: ['.md'],
                          showHiddenFolders: false,
                      },
            ui: {},
        }),
    );
    classify.mockResolvedValue({ files, folders, unsupported });
    const owner = renderHook(
        () => useDropHandler({ onOpenRecentFile, onOpenWorkspacePath, replaceFolderPath: null }, true),
        { wrapper },
    );
    return { owner, onOpenRecentFile, onOpenWorkspacePath };
}

beforeEach(() => jest.clearAllMocks());

it('clears the hover cue on native drop completion without a DOM drop event', async () => {
    let nativeDrop: ((paths: string[]) => void) | undefined;
    (subscribeFileDrops as jest.Mock).mockImplementation((listener: (paths: string[]) => void) => {
        nativeDrop = listener;
        return jest.fn();
    });
    classify.mockResolvedValue({ files: [], folders: [], unsupported: [] });
    const onOpenRecentFile = jest.fn(async () => ({}));
    const onOpenWorkspacePath = jest.fn(async () => undefined);
    const Harness = (): React.JSX.Element => {
        const drops = useDropHandler({ onOpenRecentFile, onOpenWorkspacePath, replaceFolderPath: null }, true);
        return <WindowDropTarget dropEpoch={drops.dropEpoch} />;
    };
    render(<Harness />, { wrapper });
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } });
    expect(screen.getByTestId('window-drop-hint')).toBeInTheDocument();
    await act(async () => nativeDrop?.(['/folder']));
    expect(screen.queryByTestId('window-drop-hint')).toBeNull();
    expect(classify).toHaveBeenCalledTimes(1);
});

it('opens one folder with the shared folder command and files in order', async () => {
    const { owner, onOpenRecentFile, onOpenWorkspacePath } = setup(['/a.md', '/b.md'], ['/folder']);
    await act(async () => owner.result.current.handlePaths(['/a.md', '/b.md', '/folder']));
    expect(classify).toHaveBeenCalledTimes(1);
    expect(onOpenWorkspacePath).toHaveBeenCalledWith('/folder');
    expect(onOpenRecentFile.mock.calls.map((call) => call[0])).toEqual(['/a.md', '/b.md']);
});

it('asks once for multiple folders, then routes first-only through the shared command', async () => {
    const { owner, onOpenWorkspacePath } = setup([], ['/first', '/second'], [], '/current');
    await act(async () => owner.result.current.handlePaths(['/first', '/second']));
    expect(owner.result.current.folderPaths).toEqual(['/first', '/second']);
    expect(onOpenWorkspacePath).not.toHaveBeenCalled();
    await act(async () => owner.result.current.onFolderChoice('first-only'));
    expect(onOpenWorkspacePath).toHaveBeenCalledWith('/first');
    expect(owner.result.current.folderPaths).toEqual([]);
});

it('opens all folders in new windows without changing this window', async () => {
    const { owner, onOpenWorkspacePath } = setup([], ['/first', '/second']);
    await act(async () => owner.result.current.handlePaths(['/first', '/second']));
    await act(async () => owner.result.current.onFolderChoice('all-new-windows'));
    expect(windowAdapter.openNewWindow).toHaveBeenNthCalledWith(1, '/first');
    expect(windowAdapter.openNewWindow).toHaveBeenNthCalledWith(2, '/second');
    expect(onOpenWorkspacePath).not.toHaveBeenCalled();
});

it('cancels folders while mixed files still open', async () => {
    const { owner, onOpenRecentFile, onOpenWorkspacePath } = setup(['/a.md'], ['/first', '/second']);
    await act(async () => owner.result.current.handlePaths(['/a.md', '/first', '/second']));
    await act(async () => owner.result.current.onFolderChoice('cancel'));
    expect(onOpenRecentFile).toHaveBeenCalledTimes(1);
    expect(onOpenWorkspacePath).not.toHaveBeenCalled();
    expect(windowAdapter.openNewWindow).not.toHaveBeenCalled();
});

it('rejects unsupported items once without opening anything', async () => {
    const { owner, onOpenRecentFile, onOpenWorkspacePath } = setup([], [], ['/bad', '/bad2']);
    await act(async () => owner.result.current.handlePaths(['/bad', '/bad2']));
    expect(store.getState().notifications.items).toHaveLength(1);
    expect(onOpenRecentFile).not.toHaveBeenCalled();
    expect(onOpenWorkspacePath).not.toHaveBeenCalled();
});

it('opens until a capacity refusal and reports the remaining count once', async () => {
    const { owner, onOpenRecentFile } = setup(['/a.md', '/b.md', '/c.md']);
    store.dispatch(
        hydrateProjection({
            revision: 2,
            tabSetRevision: 2,
            activeDocumentId: 'old',
            orderedDocumentIds: ['old'],
            documents: { old: documentFixture('old') },
            ui: {},
        }),
    );
    onOpenRecentFile.mockResolvedValueOnce({}).mockResolvedValueOnce({
        error: { category: 'capacity-limit', message: 'full', remediations: [], dedupKey: 'full' },
    });
    await act(async () => owner.result.current.handlePaths(['/a.md', '/b.md', '/c.md']));
    expect(onOpenRecentFile).toHaveBeenCalledTimes(2);
    expect(store.getState().notifications.items).toHaveLength(1);
    expect(store.getState().notifications.items[0].message).toContain('2');
    expect(store.getState().documents.orderedIds).toEqual(['old']);
});

it('queues a second folder drop until the first prompt is decided', async () => {
    const { owner, onOpenWorkspacePath } = setup([], ['/first', '/second']);
    await act(async () => owner.result.current.handlePaths(['/first', '/second']));
    classify.mockResolvedValue({ files: [], folders: ['/third', '/fourth'], unsupported: [] });
    await act(async () => owner.result.current.handlePaths(['/third', '/fourth']));
    expect(classify).toHaveBeenCalledTimes(1);
    expect(owner.result.current.folderPaths).toEqual(['/first', '/second']);
    await act(async () => owner.result.current.onFolderChoice('first-only'));
    expect(onOpenWorkspacePath).toHaveBeenCalledWith('/first');
    expect(classify).toHaveBeenCalledTimes(2);
    expect(owner.result.current.folderPaths).toEqual(['/third', '/fourth']);
});

it('continues opening remaining new windows after a launcher failure and reports one notice', async () => {
    const { owner } = setup([], ['/first', '/second', '/third']);
    (windowAdapter.openNewWindow as jest.Mock).mockRejectedValueOnce(new Error('launch failed'));
    await act(async () => owner.result.current.handlePaths(['/first', '/second', '/third']));
    await act(async () => owner.result.current.onFolderChoice('all-new-windows'));
    expect(windowAdapter.openNewWindow).toHaveBeenCalledTimes(3);
    expect(store.getState().notifications.items).toHaveLength(1);
    expect(store.getState().notifications.items[0].message).toContain('/first');
});

it('reads the current revision before each sequential file open', async () => {
    const { owner, onOpenRecentFile } = setup(['/a.md', '/b.md']);
    onOpenRecentFile.mockImplementationOnce(async () => {
        store.dispatch(applyStatePatch({ revision: 2, tabSetRevision: 2 }));
        return {};
    });
    await act(async () => owner.result.current.handlePaths(['/a.md', '/b.md']));
    expect(onOpenRecentFile.mock.calls.map((call) => call[1])).toEqual([1, 2]);
});
