import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../../src/logic/adapter', () => ({
    appModelAdapter: { setReadingActive: jest.fn() },
    windowAdapter: {},
}));

import { useReadingActiveSync } from '../../../src/app/useReadingActiveSync';
import { appModelAdapter } from '../../../src/logic/adapter';
import { store } from '../../../src/logic/store';
import { enterReading, leaveReading, resetReading, toggleReading } from '../../../src/logic/store/readingSlice';

const setReadingActive = appModelAdapter.setReadingActive as jest.Mock<Promise<void>, [boolean]>;
const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;

function mount(status: 'loading' | 'ready' | 'failed' = 'ready') {
    return renderHook(() => useReadingActiveSync(status), { wrapper });
}

beforeEach((): void => {
    store.dispatch(resetReading());
    setReadingActive.mockReset();
    setReadingActive.mockResolvedValue(undefined);
});

it('does not report anything on mount', async () => {
    mount();
    expect(setReadingActive).not.toHaveBeenCalled();
});

it('tells the backend when Reading mode is entered and left', async () => {
    mount();

    await act(async (): Promise<void> => void store.dispatch(enterReading()));
    expect(setReadingActive).toHaveBeenLastCalledWith(true);

    await act(async (): Promise<void> => void store.dispatch(leaveReading()));
    expect(setReadingActive).toHaveBeenLastCalledWith(false);
    expect(setReadingActive).toHaveBeenCalledTimes(2);
});

it('tells the backend when Reading mode is toggled', async () => {
    mount();

    await act(async (): Promise<void> => void store.dispatch(toggleReading()));
    expect(setReadingActive).toHaveBeenLastCalledWith(true);

    await act(async (): Promise<void> => void store.dispatch(toggleReading()));
    expect(setReadingActive).toHaveBeenLastCalledWith(false);
});

it('does not report when the active flag is unchanged', async () => {
    mount();
    await act(async (): Promise<void> => void store.dispatch(enterReading()));
    setReadingActive.mockClear();

    await act(async (): Promise<void> => {
        store.dispatch(enterReading());
        store.dispatch(leaveReading());
        store.dispatch(leaveReading());
    });

    expect(setReadingActive).toHaveBeenCalledTimes(1);
    expect(setReadingActive).toHaveBeenCalledWith(false);
});

it('reports nothing until the application is ready', async () => {
    const { rerender } = renderHook(({ status }) => useReadingActiveSync(status), {
        wrapper,
        initialProps: { status: 'loading' as 'loading' | 'ready' },
    });
    await act(async (): Promise<void> => void store.dispatch(enterReading()));
    expect(setReadingActive).not.toHaveBeenCalled();

    await act(async (): Promise<void> => rerender({ status: 'ready' }));
    expect(setReadingActive).toHaveBeenCalledWith(true);
});

it('keeps Reading mode working when the backend call rejects', async () => {
    setReadingActive.mockRejectedValue(new Error('backend unavailable'));
    mount();

    await act(async (): Promise<void> => void store.dispatch(enterReading()));
    expect(store.getState().reading.active).toBe(true);

    await act(async (): Promise<void> => void store.dispatch(leaveReading()));
    expect(store.getState().reading.active).toBe(false);
});

it('keeps Reading mode working when the backend call throws synchronously', async () => {
    setReadingActive.mockImplementation(() => {
        throw new Error('bridge missing');
    });
    mount();

    await act(async (): Promise<void> => void store.dispatch(enterReading()));

    expect(store.getState().reading.active).toBe(true);
});

it('sends changes in order, one call at a time, even when the backend answers slowly', async () => {
    const releases: Array<() => void> = [];
    setReadingActive.mockImplementation(
        () =>
            new Promise<void>((resolve) => {
                releases.push(resolve);
            }),
    );
    mount();

    await act(async (): Promise<void> => void store.dispatch(enterReading()));
    await act(async (): Promise<void> => void store.dispatch(leaveReading()));
    await act(async (): Promise<void> => undefined);
    expect(setReadingActive.mock.calls).toEqual([[true]]);

    await act(async (): Promise<void> => releases[0]());
    await act(async (): Promise<void> => undefined);
    expect(setReadingActive.mock.calls).toEqual([[true], [false]]);
    await act(async (): Promise<void> => releases[1]());
});

it('resends the state on the next change after a failed report', async () => {
    setReadingActive.mockRejectedValueOnce(new Error('backend unavailable'));
    mount();

    await act(async (): Promise<void> => void store.dispatch(enterReading()));
    expect(setReadingActive.mock.calls).toEqual([[true]]);

    // The backend never learned `true`, so leaving needs no report; entering again must resend `true`.
    await act(async (): Promise<void> => void store.dispatch(leaveReading()));
    await act(async (): Promise<void> => void store.dispatch(enterReading()));
    expect(setReadingActive.mock.calls).toEqual([[true], [true]]);
});
