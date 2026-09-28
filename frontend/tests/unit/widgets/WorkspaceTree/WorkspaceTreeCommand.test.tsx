import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../../../src/logic/adapter', () => ({
    appModelAdapter: { openRecentFile: jest.fn(), refreshWorkspace: jest.fn() },
    windowAdapter: { openNewWindow: jest.fn() },
}));

import { useCommands } from '../../../../src/app/useCommands';
import type { DocumentSession } from '../../../../src/app/useDocumentSession';
import { appModelAdapter } from '../../../../src/logic/adapter';
import { store } from '../../../../src/logic/store';
import { resetNotifications } from '../../../../src/logic/store/notificationsSlice';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;
const activation = { begin: () => 1, acknowledge: jest.fn() } as unknown as DocumentSession['activation'];
const session = { activeBuffer: null, activation } as Pick<DocumentSession, 'activeBuffer' | 'activation'>;

beforeEach(() => {
    jest.clearAllMocks();
    store.dispatch(resetNotifications());
});

it('reports a vanished tree file and refreshes the workspace after the refused open', async () => {
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: { category: 'not-found', message: 'The file no longer exists.', remediations: [], dedupKey: 'file' },
    });
    (appModelAdapter.refreshWorkspace as jest.Mock).mockResolvedValue({ status: 'opened' });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onOpenTreeFile('/notes/gone.md', 4));
    expect(appModelAdapter.openRecentFile).toHaveBeenCalledWith('/notes/gone.md', 4);
    expect(appModelAdapter.refreshWorkspace).toHaveBeenCalledTimes(1);
    expect(store.getState().notifications.items[0]?.message).toContain('no longer exists');
});

it('reports the 40 document limit with a close tabs remedy and leaves the tree unchanged', async () => {
    (appModelAdapter.openRecentFile as jest.Mock).mockResolvedValue({
        status: 'refused',
        error: {
            category: 'capacity-limit',
            message: 'The window already contains 40 documents.',
            remediations: [],
            dedupKey: 'limit',
        },
    });
    const owner = renderHook(() => useCommands(session, jest.fn()), { wrapper });
    await act(async () => owner.result.current.onOpenTreeFile('/notes/full.md', 4));
    expect(appModelAdapter.refreshWorkspace).not.toHaveBeenCalled();
    expect(store.getState().notifications.items[0]?.message).toContain('Close one or more tabs first.');
});
