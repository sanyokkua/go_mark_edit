import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    commandAdapter: { retry: jest.fn(), cancel: jest.fn() },
    appModelAdapter: { getState: jest.fn() },
}));

import { appModelAdapter, commandAdapter } from '../../src/logic/adapter';
import { useNotifications } from '../../src/app/useNotifications';
import { store } from '../../src/logic/store';
import {
    notifyToast,
    resetNotifications,
    type NotificationRemediation,
} from '../../src/logic/store/notificationsSlice';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;
const pending = (): Promise<never> => new Promise<never>(() => undefined);
function commands() {
    return {
        retryWrite: jest.fn(pending),
        dismissWriteFailure: jest.fn(pending),
        onActivateDocument: jest.fn(pending),
        onNewDocument: jest.fn(pending),
        onOpenDocument: jest.fn(pending),
        onOpenFolder: jest.fn(async () => ({})),
        onRefreshWorkspace: jest.fn(async () => ({})),
        onOpenWorkspacePath: jest.fn(async () => ({})),
        onOpenRecentFile: jest.fn(pending),
        onOpenRecentItem: jest.fn(pending),
        onReopenLastFile: jest.fn(pending),
        onCloseDocument: jest.fn(pending),
        requestQuit: jest.fn(),
    };
}

it('retries an Open Folder failure using the canonical path without reopening the picker', async () => {
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({ snapshot: { tabSetRevision: 1 } });
    notice([{ action: 'retry', intent: 'open-folder', path: '/notes', labelKey: 'action.retry.label' }]);
    const capabilities = commands();
    const owner = renderHook(() => useNotifications(capabilities), { wrapper });

    await act(async () => owner.result.current.notices[0].actions?.[0].onActivate());

    expect(capabilities.onOpenWorkspacePath).toHaveBeenCalledWith('/notes');
    expect(capabilities.onOpenFolder).not.toHaveBeenCalled();
});

it('routes a workspace refresh remediation to the folder refresh command', async () => {
    notice([{ action: 'retry', intent: 'refresh-workspace', labelKey: 'action.retry.label' }]);
    const capabilities = commands();
    const owner = renderHook(() => useNotifications(capabilities), { wrapper });

    await act(async () => owner.result.current.notices[0].actions?.[0].onActivate());

    expect(capabilities.onRefreshWorkspace).toHaveBeenCalledTimes(1);
    expect(store.getState().notifications.items).toHaveLength(0);
});

it('retains the recent entry kind when retrying a classified refusal', async () => {
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({ snapshot: { tabSetRevision: 7 } });
    notice([
        { action: 'retry', intent: 'open-recent', path: '/notes', kind: 'folder', labelKey: 'action.retry.label' },
    ]);
    const capabilities = commands();
    const owner = renderHook(() => useNotifications(capabilities), { wrapper });
    await act(async () => owner.result.current.notices[0].actions?.[0].onActivate());
    expect(capabilities.onOpenRecentItem).toHaveBeenCalledWith({ path: '/notes', kind: 'folder' }, 7);
    expect(capabilities.onOpenRecentFile).not.toHaveBeenCalled();
});
function notice(remediations: NotificationRemediation[]): void {
    store.dispatch(
        notifyToast({
            code: 'io',
            message: 'Try again.',
            severity: 'error',
            title: 'one.md',
            subject: 'one',
            remediations,
        }),
    );
}
afterEach(() => {
    store.dispatch(resetNotifications());
    jest.clearAllMocks();
});

it('passes stuck-command Retry and Cancel the existing request identity', () => {
    notice([
        { action: 'retry-command', intent: 'command', requestId: 'original-request', labelKey: 'action.retry.label' },
        { action: 'cancel-command', intent: 'command', requestId: 'original-request', labelKey: 'action.cancel.label' },
    ]);
    const owner = renderHook(() => useNotifications(commands()), { wrapper });
    act(() => owner.result.current.notices[0].actions?.[0].onActivate());
    act(() => owner.result.current.notices[0].actions?.[1].onActivate());
    expect(commandAdapter.retry).toHaveBeenCalledWith('original-request');
    expect(commandAdapter.cancel).toHaveBeenCalledWith('original-request');
    expect(store.getState().notifications.items).toHaveLength(1);
});

it('routes a write remediation to its owning retry capability with the original intent and target', () => {
    notice([{ action: 'retry', intent: 'save-as', documentId: 'background', labelKey: 'action.retry.label' }]);
    const capabilities = commands();
    const owner = renderHook(() => useNotifications(capabilities), { wrapper });
    act(() => owner.result.current.notices[0].actions?.[0].onActivate());
    expect(capabilities.retryWrite).toHaveBeenCalledWith('save-as', 'background');
    expect(store.getState().notifications.items).toHaveLength(1);
    act(() => owner.result.current.onDismiss(owner.result.current.notices[0].id));
    expect(store.getState().notifications.items).toHaveLength(0);
    expect(capabilities.dismissWriteFailure).toHaveBeenCalledWith('save-as', 'background');
});
