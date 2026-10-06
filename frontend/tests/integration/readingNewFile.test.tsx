import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: { newDocument: jest.fn(), flushActiveSession: jest.fn() },
    windowAdapter: {},
}));

import { useCommands } from '../../src/app/useCommands';
import { appModelAdapter } from '../../src/logic/adapter';
import { store } from '../../src/logic/store';
import { enterReading, resetReading } from '../../src/logic/store/readingSlice';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;
const newDocument = appModelAdapter.newDocument as jest.Mock;

function renderCommands() {
    const activation = { begin: jest.fn(() => 1), acknowledge: jest.fn() };
    return renderHook(
        () =>
            useCommands(
                { activeBuffer: null, activation } as unknown as Parameters<typeof useCommands>[0],
                async () => 'closed',
            ),
        { wrapper },
    );
}

afterEach((): void => {
    jest.clearAllMocks();
    store.dispatch(resetReading());
    store.dispatch(resetNotifications());
});

it('leaves Reading mode when a new untitled document is created', async () => {
    newDocument.mockResolvedValue({ status: 'opened', documentId: 'doc-new' });
    const { result } = renderCommands();
    act((): void => {
        store.dispatch(enterReading());
    });

    await act(async (): Promise<void> => {
        await result.current.onNewDocument(1);
    });

    expect(store.getState().reading.active).toBe(false);
});

it('stays in Reading mode when creating a new document is refused', async () => {
    newDocument.mockResolvedValue({
        error: {
            category: 'capacity-limit',
            dedupKey: 'k',
            message: 'full',
            remediations: [],
            safeSubject: 'Untitled',
        },
    });
    const { result } = renderCommands();
    act((): void => {
        store.dispatch(enterReading());
    });

    await act(async (): Promise<void> => {
        await result.current.onNewDocument(1);
    });

    expect(store.getState().reading.active).toBe(true);
});
