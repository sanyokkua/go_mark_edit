import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

import { useDocumentSession } from '../../src/app/useDocumentSession';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { documentFixture } from '../support/appFixtures';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;

function project(activeDocumentId: string | null, revision: number, contentRevision = 0): void {
    store.dispatch(
        hydrateProjection({
            activeDocumentId,
            revision,
            tabSetRevision: revision,
            orderedDocumentIds: !activeDocumentId ? [] : ['one', 'two'],
            documents: !activeDocumentId
                ? {}
                : { one: documentFixture('one', contentRevision), two: documentFixture('two') },
            ui: {},
        }),
    );
}

afterEach(() => {
    store.dispatch(resetProjection());
});

it('waits for the projection before installing a reload and advances the epoch exactly once', () => {
    project('one', 1);
    const { result } = renderHook(() => useDocumentSession(), { wrapper });
    act(() =>
        result.current.onBootstrapReady({
            status: 'ready',
            activeBuffer: { documentId: 'one', content: 'original' },
            applicationVersion: 'dev',
        }),
    );
    const generation = result.current.activation.begin();
    const reload = { documentId: 'one', content: 'disk', documentRevision: 1, projectionRevision: 2 };
    act(() => result.current.activation.acknowledge(generation, reload, 'one', 'reload'));
    expect(result.current.activeBuffer?.content).toBe('original');
    expect(result.current.externalEpoch).toBe(0);
    act(() => project('one', 2, 1));
    expect(result.current.activeBuffer?.content).toBe('disk');
    expect(result.current.externalEpoch).toBe(1);
    act(() => result.current.activation.acknowledge(generation, reload, 'one', 'reload'));
    act(() => project('one', 3, 1));
    expect(result.current.externalEpoch).toBe(1);
});

it('drops a reload overtaken by a tab switch without resetting the new editor', () => {
    project('one', 1);
    const { result } = renderHook(() => useDocumentSession(), { wrapper });
    const reloadGeneration = result.current.activation.begin();
    const switchGeneration = result.current.activation.begin();
    act(() => {
        project('two', 3, 1);
        result.current.activation.acknowledge(
            switchGeneration,
            { documentId: 'two', content: 'second', documentRevision: 0, projectionRevision: 3 },
            'two',
        );
    });
    act(() =>
        result.current.activation.acknowledge(
            reloadGeneration,
            { documentId: 'one', content: 'late disk', documentRevision: 1, projectionRevision: 2 },
            'one',
            'reload',
        ),
    );
    expect(result.current.activeBuffer?.content).toBe('second');
    expect(result.current.externalEpoch).toBe(0);
});

it.each([null, ''])(
    'clears the last editor session when the authoritative projection closes the final tab (%s)',
    (emptyId) => {
        project('one', 1);
        const { result } = renderHook(() => useDocumentSession(), { wrapper });
        act(() =>
            result.current.onBootstrapReady({
                status: 'ready',
                activeBuffer: { documentId: 'one', content: 'original' },
                applicationVersion: 'dev',
            }),
        );
        act(() => project(emptyId, 2));
        expect(result.current.activeBuffer).toBeNull();
        expect(result.current.externalEpoch).toBe(0);
    },
);

it('retains a pending activation across committed-write metadata reconciliation', () => {
    project('one', 1);
    const { result } = renderHook(() => useDocumentSession(), { wrapper });
    const generation = result.current.activation.begin();
    act(() =>
        result.current.activation.acknowledge(
            generation,
            { documentId: 'two', content: 'second', documentRevision: 0, projectionRevision: 3 },
            'two',
        ),
    );
    act(() => project('one', 2));
    act(() => project('two', 3));
    expect(result.current.activeBuffer?.content).toBe('second');
    expect(result.current.externalEpoch).toBe(0);
});

it('ignores an older reconciliation snapshot after another document became active', () => {
    project('one', 1);
    const { result } = renderHook(() => useDocumentSession(), { wrapper });
    const generation = result.current.activation.begin();
    act(() => {
        project('two', 3);
        result.current.activation.acknowledge(generation, {
            documentId: 'two',
            content: 'second',
            documentRevision: 0,
            projectionRevision: 3,
        });
    });
    act(() => project('one', 2));
    expect(result.current.activeBuffer?.content).toBe('second');
    expect(result.current.activeDocument?.documentId).toBe('two');
    expect(result.current.externalEpoch).toBe(0);
});
