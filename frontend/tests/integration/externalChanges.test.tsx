import type { PropsWithChildren } from 'react';
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    documentConflictAdapter: {
        checkExternalChanges: jest.fn(),
        authorizeKeepMine: jest.fn(),
        reloadFromDisk: jest.fn(),
        skipConflict: jest.fn(),
        cancelConflict: jest.fn(),
    },
}));

import { documentConflictAdapter } from '../../src/logic/adapter';
import { useDocumentSession } from '../../src/app/useDocumentSession';
import { useExternalChanges } from '../../src/app/useExternalChanges';
import { useConflictCommands } from '../../src/app/useConflictCommands';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { conflictFixture, documentFixture } from '../support/appFixtures';
import { createCommandRecorder } from '../support/commandRecorder';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;

function renderOwner(blocked = false) {
    return renderHook(
        ({ suspended }) => {
            const session = useDocumentSession();
            return useExternalChanges({
                session,
                conflicts: useConflictCommands(session.activation),
                bootstrapStatus: 'ready',
                blocked: suspended,
            });
        },
        { initialProps: { suspended: blocked }, wrapper },
    );
}

beforeEach(() => {
    store.dispatch(
        hydrateProjection({
            revision: 1,
            tabSetRevision: 1,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: { one: documentFixture(), two: documentFixture('two') },
            ui: {},
        }),
    );
});
afterEach(() => {
    store.dispatch(resetProjection());
    jest.clearAllMocks();
});

it('coalesces foreground events while a real owner check is in flight and disposes its listener', async () => {
    const recorder = createCommandRecorder();
    const check = recorder.binding('CheckExternalChanges', 1);
    (documentConflictAdapter.checkExternalChanges as jest.Mock).mockImplementation((id: string) =>
        check({ id: 'foreground-1' }, id),
    );
    const owner = renderOwner();
    fireEvent.focus(window);
    fireEvent.focus(window);
    fireEvent.focus(window);
    await waitFor(() =>
        expect(recorder.calls).toEqual([{ name: 'CheckExternalChanges', requestId: 'foreground-1', args: ['one'] }]),
    );
    owner.unmount();
    fireEvent.focus(window);
    expect(recorder.calls).toHaveLength(1);
});

it('keeps a deferred comparison hidden until the production owner rechecks it', async () => {
    const recorder = createCommandRecorder();
    const check = recorder.binding('CheckExternalChanges', 1);
    (documentConflictAdapter.checkExternalChanges as jest.Mock).mockImplementation((id: string) =>
        check({ id: 'deferred-1' }, id),
    );
    const owner = renderOwner();
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    expect(owner.result.current.conflict?.preview.documentId).toBe('one');
    owner.rerender({ suspended: true });
    expect(owner.result.current.conflict).toBeNull();
    owner.rerender({ suspended: false });
    await waitFor(() =>
        expect(recorder.calls).toEqual([{ name: 'CheckExternalChanges', requestId: 'deferred-1', args: ['one'] }]),
    );
    expect(owner.result.current.conflict).toBeNull();
});

it('removes a pending comparison when its document closes', () => {
    const owner = renderOwner();
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    act(() => {
        store.dispatch(
            hydrateProjection({ revision: 2, activeDocumentId: null, orderedDocumentIds: [], documents: {}, ui: {} }),
        );
    });
    expect(owner.result.current.conflict).toBeNull();
});

it('routes foreground Keep mine to authorization without issuing a write', async () => {
    const recorder = createCommandRecorder();
    const authorize = recorder.binding('AuthorizeKeepMine', 4);
    (documentConflictAdapter.authorizeKeepMine as jest.Mock).mockImplementation((...args: unknown[]) =>
        authorize({ id: 'authorize-1' }, ...args),
    );
    const owner = renderOwner();
    act(() => owner.result.current.receiveConflict(conflictFixture()));
    act(() => {
        void owner.result.current.conflict?.onDecision('keep-mine');
    });
    await waitFor(() =>
        expect(recorder.calls).toEqual([
            {
                name: 'AuthorizeKeepMine',
                requestId: 'authorize-1',
                args: ['one', 0, '/documents/one.md', { exists: true, size: 5, mode: 420, modifiedUnixNano: '200' }],
            },
        ]),
    );
});

it('does not inspect files on a timer and checks path-backed documents on resume', () => {
    jest.useFakeTimers();
    const recorder = createCommandRecorder();
    const check = recorder.binding('CheckExternalChanges', 1);
    (documentConflictAdapter.checkExternalChanges as jest.Mock).mockImplementation((id: string) =>
        check({ id: 'resume' }, id),
    );
    const owner = renderOwner();
    try {
        act(() => jest.advanceTimersByTime(120_000));
        expect(recorder.calls).toHaveLength(0);
        fireEvent(globalThis.document, new Event('visibilitychange'));
        expect(recorder.calls).toEqual([{ name: 'CheckExternalChanges', requestId: 'resume', args: ['one'] }]);
        act(() => jest.advanceTimersByTime(120_000));
        expect(recorder.calls).toHaveLength(1);
    } finally {
        owner.unmount();
        jest.useRealTimers();
    }
});
