import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({ commandAdapter: { retry: jest.fn(), cancel: jest.fn() } }));

import { commandAdapter } from '../../src/logic/adapter';
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
        onOpenRecentFile: jest.fn(pending),
        onReopenLastFile: jest.fn(pending),
        onCloseDocument: jest.fn(pending),
        requestQuit: jest.fn(),
    };
}
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
