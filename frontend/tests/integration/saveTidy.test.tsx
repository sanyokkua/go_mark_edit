import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: {
        flushActiveSession: jest.fn(),
        getState: jest.fn(),
        reconcileCommittedWrite: jest.fn(),
    },
    documentWriteAdapter: {
        save: jest.fn(),
        saveAs: jest.fn(),
        cancelNormalization: jest.fn(),
    },
    documentConflictAdapter: { checkExternalChanges: jest.fn() },
}));

import { appModelAdapter, documentWriteAdapter } from '../../src/logic/adapter';
import { useDocumentWrites } from '../../src/app/useDocumentWrites';
import type { ConflictCommands } from '../../src/app/useConflictCommands';
import { useDocumentSession } from '../../src/app/useDocumentSession';
import { store, useAppSelector } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';
import { hydrateSettings, resetSettingsProjection } from '../../src/logic/store/settingsSlice';
import type { ActiveBuffer, WriteResult } from '../../src/logic/store/appModelTypes';
import {
    TidyCommandsContext,
    type TidyCommandOutcome,
    type TidyCommands,
} from '../../src/ui/widgets/tidyCommandsContext';
import { conflictFixture, documentFixture } from '../support/appFixtures';
import { loadedMarkdownSettings } from '../support/loadedMarkdownSettings';
import {
    clear as clearProblems,
    getSnapshot as problemsSnapshot,
    replace as replaceProblems,
} from '../../src/logic/operations/problemsSummary';

const committed: WriteResult = {
    status: 'committed',
    data: {
        documentId: 'one',
        writtenContentRevision: 2,
        committedProjectionRevision: 3,
        targetPathAdopted: false,
        lineEndingOutcome: 'preserved-lf',
        bomOutcome: 'absent',
        resyncRequired: false,
    },
};

const activeBuffer: ActiveBuffer = { documentId: 'one', content: 'A title\n', documentRevision: 1 };
const nonEditOutcomes = {
    busy: { kind: 'busy' },
    refused: { kind: 'refused', reason: 'render-differs' },
    cancelled: { kind: 'cancelled' },
    failed: { kind: 'failed' },
    stale: { kind: 'stale' },
} as const satisfies Record<'busy' | 'refused' | 'cancelled' | 'failed' | 'stale', TidyCommandOutcome>;

function setup(tidy: TidyCommands, executeConflict = jest.fn()) {
    const document = { ...documentFixture('one', 1), dirty: true };
    const conflicts = { execute: executeConflict } as unknown as ConflictCommands;
    const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => (
        <Provider store={store}>
            <TidyCommandsContext.Provider value={tidy}>{children}</TidyCommandsContext.Provider>
        </Provider>
    );
    return renderHook(
        () => {
            const session = useDocumentSession();
            const documentsById = useAppSelector((state) => state.documents.byId);
            return useDocumentWrites(
                {
                    ...session,
                    activeBuffer,
                    activeDocument: document,
                    documentsById,
                    orderedDocumentIds: ['one', 'two'],
                },
                conflicts,
            );
        },
        { wrapper },
    );
}

beforeEach(() => {
    store.dispatch(resetProjection());
    store.dispatch(resetSettingsProjection());
    store.dispatch(resetNotifications());
    store.dispatch(
        hydrateSettings({
            ...loadedMarkdownSettings,
            markdown: {
                ...loadedMarkdownSettings.markdown,
                formatOnSave: true,
                lintOnSave: true,
            },
        }),
    );
    store.dispatch(
        hydrateProjection({
            revision: 1,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one'],
            documents: { one: documentFixture('one', 1), two: documentFixture('two', 1) },
            ui: {},
        }),
    );
    jest.clearAllMocks();
    clearProblems();
});

afterEach(() => {
    store.dispatch(resetProjection());
    store.dispatch(resetSettingsProjection());
    store.dispatch(resetNotifications());
    clearProblems();
});

function stableState(documentId = 'one') {
    return {
        activeBuffer,
        snapshot: {
            revision: 1,
            activeDocumentId: 'one',
            orderedDocumentIds: ['one', 'two'],
            documents: { one: documentFixture('one', 1), two: documentFixture('two', 1) },
            ui: {},
        },
        documentId,
    };
}

it.each([
    ['busy', 'another operation was in progress'],
    ['refused', 'formatting would change how the document renders'],
    ['cancelled', 'formatting was cancelled'],
    ['failed', 'formatting failed'],
    ['stale', 'the document changed during formatting'],
] as const)('saves unchanged text with one reasoned notice when Format is %s', async (kind, reason) => {
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> =>
            op === 'format' ? nonEditOutcomes[kind] : { kind: 'findings', findings: [], total: 0 },
        ),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock).mockImplementation(async (_id: string, revision: number) => {
        expect(revision).toBe(1);
        return committed;
    });
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({ snapshot: stableState().snapshot });
    const owner = setup(tidy);
    await act(async () => {
        await owner.result.current.onSave();
    });
    const notices = store.getState().notifications.items;
    expect(notices.filter((notice) => notice.code === 'format-on-save-skipped')).toHaveLength(1);
    expect(notices.find((notice) => notice.code === 'format-on-save-skipped')?.message).toContain(reason);
    expect(notices.some((notice) => notice.code.startsWith('tidy-'))).toBe(false);
    expect(documentWriteAdapter.save).toHaveBeenCalledWith('one', 1, '');
});

it('saves an inactive target unchanged without running Format or Lint', async () => {
    const tidy: TidyCommands = { run: jest.fn(), cancel: jest.fn(), documentChanged: jest.fn() };
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock).mockResolvedValue(committed);
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({ snapshot: stableState().snapshot });
    const owner = setup(tidy);
    await act(async () => {
        await owner.result.current.beginWrite('save', 'two');
    });
    expect(tidy.run).not.toHaveBeenCalled();
    expect(documentWriteAdapter.save).toHaveBeenCalledWith('two', 1, '');
    expect(
        store.getState().notifications.items.filter((notice) => notice.code === 'format-on-save-skipped'),
    ).toHaveLength(1);
});

it('keeps existing Lint findings and shows no notice when post-save Lint finds the slot busy', async () => {
    const finding = {
        rule: 'trailing-space' as const,
        severity: 'error' as const,
        startLine: 1,
        startColumn: 5,
        endLine: 1,
        endColumn: 6,
        message: { key: 'lint.rule.trailing-space.message' },
        hint: 'lint.rule.trailing-space.hint',
    };
    replaceProblems('one', [finding], 1, 'A title\n');
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> =>
            op === 'format' ? { kind: 'edits', edits: [] } : { kind: 'busy' },
        ),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock).mockResolvedValue(committed);
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({ snapshot: stableState().snapshot });
    const owner = setup(tidy);
    await act(async () => {
        await owner.result.current.onSave();
    });
    expect(problemsSnapshot()?.total).toBe(1);
    expect(store.getState().notifications.items.map((notice) => notice.code)).toEqual(['save-success']);
});

it.each(['failed', 'cancelled', 'refused'] as const)(
    'keeps the committed save when post-save Lint is %s',
    async (kind) => {
        const tidy: TidyCommands = {
            run: jest.fn(async (op): Promise<TidyCommandOutcome> =>
                op === 'format' ? { kind: 'edits', edits: [] } : nonEditOutcomes[kind],
            ),
            cancel: jest.fn(),
            documentChanged: jest.fn(),
        };
        (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
        (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
        (documentWriteAdapter.save as jest.Mock).mockResolvedValue(committed);
        (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({ snapshot: stableState().snapshot });
        const owner = setup(tidy);
        await act(async () => {
            await owner.result.current.onSave();
        });
        expect(documentWriteAdapter.save).toHaveBeenCalledTimes(1);
        expect(store.getState().notifications.items.some((notice) => notice.code === 'save-success')).toBe(true);
    },
);

it('formats the active working copy before Save and lints only after its commit', async () => {
    const order: string[] = [];
    let text = 'A title\n';
    let revision = 1;
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> => {
            order.push(op);
            if (op === 'format') {
                text = '# title\n';
                revision = 2;
                return { kind: 'edits', edits: [{ from: 0, to: 1, text: '#' }] };
            }
            return { kind: 'findings', findings: [], total: 0 };
        }),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockImplementation(async () => {
        order.push('flush');
    });
    (appModelAdapter.getState as jest.Mock).mockImplementation(async () => {
        order.push('state');
        return {
            activeBuffer: { documentId: 'one', content: text, documentRevision: revision },
            snapshot: { revision, activeDocumentId: 'one', documents: { one: documentFixture('one', revision) } },
        };
    });
    (documentWriteAdapter.save as jest.Mock).mockImplementation(async (_id: string, savedRevision: number) => {
        order.push('save');
        expect(text).toBe('# title\n');
        expect(savedRevision).toBe(2);
        return committed;
    });
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockImplementation(async () => {
        order.push('reconcile');
        return {
            snapshot: { revision: 3, activeDocumentId: 'one', documents: { one: documentFixture('one', 2) }, ui: {} },
        };
    });
    const owner = setup(tidy);
    await act(async () => {
        await owner.result.current.onSave();
    });
    await waitFor(() => expect(order).toEqual(['format', 'flush', 'state', 'save', 'reconcile', 'lint']));
});

it('formats before Save As and lints the active document after Save As commits', async () => {
    const order: string[] = [];
    let revision = 1;
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> => {
            order.push(op);
            if (op === 'format') {
                revision = 2;
                return { kind: 'edits', edits: [{ from: 0, to: 1, text: '#' }] };
            }
            return { kind: 'findings', findings: [], total: 0 };
        }),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockImplementation(async () => {
        order.push('flush');
    });
    (appModelAdapter.getState as jest.Mock).mockImplementation(async () => {
        order.push('state');
        return { ...stableState(), activeBuffer: { ...activeBuffer, documentRevision: revision } };
    });
    (documentWriteAdapter.saveAs as jest.Mock).mockImplementation(async (_id: string, savedRevision: number) => {
        order.push('save-as');
        expect(savedRevision).toBe(2);
        return committed;
    });
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockImplementation(async () => {
        order.push('reconcile');
        return { snapshot: stableState().snapshot };
    });
    const owner = setup(tidy);
    await act(async () => {
        await owner.result.current.onSaveAs();
    });
    expect(order).toEqual(['format', 'flush', 'state', 'save-as', 'reconcile', 'lint']);
    expect(documentWriteAdapter.save).not.toHaveBeenCalled();
});

it('does not claim a completed save when skipped Format precedes a cancelled Save As', async () => {
    const tidy: TidyCommands = {
        run: jest.fn(async (): Promise<TidyCommandOutcome> => ({ kind: 'busy' })),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.saveAs as jest.Mock).mockResolvedValue({ status: 'cancelled' });
    const owner = setup(tidy);
    await act(async () => {
        await owner.result.current.onSaveAs();
    });
    const notices = store.getState().notifications.items;
    expect(notices.find((notice) => notice.code === 'format-on-save-skipped')?.message).toContain('another operation');
    expect(notices.find((notice) => notice.code === 'format-on-save-skipped')?.message).not.toContain('saved');
    expect(notices.some((notice) => notice.code === 'save-success')).toBe(false);
});

it('settles a close-owned Save when normalization is cancelled without running Format twice', async () => {
    const tidy: TidyCommands = {
        run: jest.fn(async (): Promise<TidyCommandOutcome> => ({ kind: 'edits', edits: [] })),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock).mockResolvedValue({
        status: 'needs-normalization',
        documentRevision: 1,
        decisionToken: 'normal-1',
        proposedEnding: 'lf',
    });
    (documentWriteAdapter.cancelNormalization as jest.Mock).mockResolvedValue(undefined);
    const owner = setup(tidy);
    let outcome: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            outcome = value;
        });
    });
    await waitFor(() => expect(owner.result.current.prompt.phase).toBe('normalization'));
    await act(async () => {
        await owner.result.current.decideNormalization(false);
    });
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(tidy.run).toHaveBeenCalledTimes(1);
});

it('settles a close-owned Save when the conflict choice is Cancel', async () => {
    const tidy: TidyCommands = {
        run: jest.fn(async (): Promise<TidyCommandOutcome> => ({ kind: 'edits', edits: [] })),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    const preview = conflictFixture('one', 1);
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock).mockResolvedValue({ status: 'conflict', conflict: preview });
    const execute = jest.fn().mockResolvedValue({ status: 'cancelled' });
    const owner = setup(tidy, execute);
    let outcome: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            outcome = value;
        });
    });
    await waitFor(() => expect(owner.result.current.prompt.phase).toBe('conflict'));
    await act(async () => {
        await owner.result.current.conflict?.onDecision('cancel');
    });
    expect(outcome).toEqual({ status: 'refused' });
    expect(tidy.run).toHaveBeenCalledTimes(1);
});

it('continues a close-owned conflict Keep mine with one Format and post-commit Lint', async () => {
    const operations: string[] = [];
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> => {
            operations.push(op);
            return op === 'format' ? { kind: 'edits', edits: [] } : { kind: 'findings', findings: [], total: 0 };
        }),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    const preview = conflictFixture('one', 1);
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock)
        .mockResolvedValueOnce({ status: 'conflict', conflict: preview })
        .mockResolvedValueOnce(committed);
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({ snapshot: stableState().snapshot });
    const execute = jest.fn().mockResolvedValue({ status: 'authorized', decisionToken: 'mine-1' });
    const owner = setup(tidy, execute);
    let outcome: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            outcome = value;
        });
    });
    await waitFor(() => expect(owner.result.current.prompt.phase).toBe('conflict'));
    expect(outcome).toBeUndefined();
    await act(async () => {
        await owner.result.current.conflict?.onDecision('keep-mine');
    });
    expect(outcome).toEqual({ status: 'saved', writtenContentRevision: 2 });
    expect(documentWriteAdapter.save).toHaveBeenNthCalledWith(1, 'one', 1, '');
    expect(documentWriteAdapter.save).toHaveBeenNthCalledWith(2, 'one', 1, 'mine-1');
    expect(operations).toEqual(['format', 'lint']);
});

it('prioritizes a close-owned conflict and then restores the original explicit Save intent', async () => {
    const operations: string[] = [];
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> => {
            operations.push(op);
            return op === 'format' ? { kind: 'edits', edits: [] } : { kind: 'findings', findings: [], total: 0 };
        }),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    const preview = conflictFixture('one', 1);
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock)
        .mockResolvedValueOnce({ status: 'conflict', conflict: preview })
        .mockResolvedValueOnce({ status: 'conflict', conflict: preview })
        .mockResolvedValueOnce(committed);
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({ snapshot: stableState().snapshot });
    const execute = jest.fn(async (decision: string) =>
        decision === 'keep-mine' ? { status: 'authorized', decisionToken: 'mine-1' } : { status: 'cancelled' },
    );
    const owner = setup(tidy, execute);
    await act(async () => {
        await owner.result.current.onSave();
    });
    expect(owner.result.current.prompt.phase).toBe('conflict');
    let closeOutcome: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            closeOutcome = value;
        });
    });
    await waitFor(() => expect(documentWriteAdapter.save).toHaveBeenCalledTimes(2));
    expect(owner.result.current.closeOwnedPrompt).toBe(true);
    expect(closeOutcome).toBeUndefined();
    await act(async () => {
        await owner.result.current.conflict?.onDecision('skip');
    });
    expect(closeOutcome).toEqual({ status: 'refused' });
    expect(owner.result.current.prompt.phase).toBe('conflict');
    expect(owner.result.current.closeOwnedPrompt).toBe(false);
    await act(async () => {
        await owner.result.current.conflict?.onDecision('keep-mine');
    });
    expect(documentWriteAdapter.save).toHaveBeenCalledTimes(3);
    expect(operations).toEqual(['format', 'format', 'lint']);
    expect(store.getState().notifications.items.some((notice) => notice.code === 'save-success')).toBe(true);
});

it('returns a distinct clean revision after a close-owned conflict Reload without Lint', async () => {
    const tidy: TidyCommands = {
        run: jest.fn(async (): Promise<TidyCommandOutcome> => ({ kind: 'edits', edits: [] })),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock).mockResolvedValue({
        status: 'conflict',
        conflict: conflictFixture('one', 1),
    });
    const owner = setup(tidy, jest.fn().mockResolvedValue({ status: 'reloaded', documentRevision: 3 }));
    let outcome: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            outcome = value;
        });
    });
    await waitFor(() => expect(owner.result.current.prompt.phase).toBe('conflict'));
    await act(async () => {
        await owner.result.current.conflict?.onDecision('reload');
    });
    expect(outcome).toEqual({ status: 'reloaded', contentRevision: 3 });
    expect(tidy.run).toHaveBeenCalledTimes(1);
    expect(documentWriteAdapter.save).toHaveBeenCalledTimes(1);
});

it('settles a pending close-owned Save on unmount before a native Save dialog returns', async () => {
    let finishSave!: (result: WriteResult) => void;
    const tidy: TidyCommands = {
        run: jest.fn(async (): Promise<TidyCommandOutcome> => ({ kind: 'edits', edits: [] })),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock).mockImplementation(
        () => new Promise<WriteResult>((resolve) => (finishSave = resolve)),
    );
    const owner = setup(tidy);
    let outcome: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            outcome = value;
        });
    });
    await waitFor(() => expect(documentWriteAdapter.save).toHaveBeenCalledTimes(1));
    owner.unmount();
    await waitFor(() => expect(outcome).toEqual({ status: 'unmounted' }));
    await act(async () => finishSave(committed));
    expect(appModelAdapter.reconcileCommittedWrite).not.toHaveBeenCalled();
});

it('settles a close-owned Save when its target disappears while Format is pending', async () => {
    let finishFormat!: (outcome: { kind: 'edits'; edits: [] }) => void;
    const tidy: TidyCommands = {
        run: jest.fn(
            () =>
                new Promise((resolve) => {
                    finishFormat = resolve;
                }),
        ),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    const owner = setup(tidy);
    let outcome: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            outcome = value;
        });
    });
    await waitFor(() => expect(tidy.run).toHaveBeenCalledTimes(1));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                activeDocumentId: 'two',
                orderedDocumentIds: ['two'],
                documents: { two: documentFixture('two', 1) },
                ui: {},
            }),
        );
    });
    await waitFor(() => expect(outcome).toEqual({ status: 'disappeared' }));
    await act(async () => {
        finishFormat({ kind: 'edits', edits: [] });
    });
    expect(documentWriteAdapter.save).not.toHaveBeenCalled();
});

it('restores an unrelated ordinary Save prompt when the close-owned target disappears', async () => {
    let finishBackgroundSave!: (result: WriteResult) => void;
    const tidy: TidyCommands = {
        run: jest.fn(async (): Promise<TidyCommandOutcome> => ({ kind: 'edits', edits: [] })),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock)
        .mockResolvedValueOnce({ status: 'conflict', conflict: conflictFixture('one', 1) })
        .mockImplementationOnce(() => new Promise<WriteResult>((resolve) => (finishBackgroundSave = resolve)))
        .mockResolvedValueOnce(committed);
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({ snapshot: stableState().snapshot });
    const owner = setup(tidy, jest.fn().mockResolvedValue({ status: 'authorized', decisionToken: 'mine-1' }));
    await act(async () => {
        await owner.result.current.onSave();
    });
    expect(owner.result.current.prompt.phase).toBe('conflict');
    let closeOutcome: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('two').then((value) => {
            closeOutcome = value;
        });
    });
    await waitFor(() => expect(documentWriteAdapter.save).toHaveBeenCalledTimes(2));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one'],
                documents: { one: documentFixture('one', 1) },
                ui: {},
            }),
        );
    });
    await waitFor(() => expect(closeOutcome).toEqual({ status: 'disappeared' }));
    expect(owner.result.current.prompt.phase).toBe('conflict');
    await act(async () => {
        await owner.result.current.conflict?.onDecision('keep-mine');
    });
    expect(documentWriteAdapter.save).toHaveBeenNthCalledWith(3, 'one', 1, 'mine-1');
    expect(store.getState().notifications.items.some((notice) => notice.code === 'save-success')).toBe(true);
    await act(async () => finishBackgroundSave({ status: 'cancelled' }));
});

it('does not let a late old Lint settle a newer close-owned Save of the same document', async () => {
    const finishLints: Array<() => void> = [];
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> => {
            if (op === 'format') return { kind: 'edits', edits: [] };
            return new Promise<TidyCommandOutcome>((resolve) => {
                finishLints.push(() => resolve({ kind: 'findings', findings: [], total: 0 }));
            });
        }),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock).mockResolvedValue(committed);
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({ snapshot: stableState().snapshot });
    const owner = setup(tidy);
    let first: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            first = value;
        });
    });
    await waitFor(() => expect(finishLints).toHaveLength(1));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                activeDocumentId: 'two',
                orderedDocumentIds: ['two'],
                documents: { two: documentFixture('two', 1) },
                ui: {},
            }),
        );
    });
    await waitFor(() => expect(first).toEqual({ status: 'disappeared' }));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 3,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one'],
                documents: { one: documentFixture('one', 1) },
                ui: {},
            }),
        );
    });
    let second: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            second = value;
        });
    });
    await waitFor(() => expect(finishLints).toHaveLength(2));
    await act(async () => finishLints[0]());
    expect(second).toBeUndefined();
    expect(store.getState().notifications.items.some((notice) => notice.code === 'save-success')).toBe(false);
    await act(async () => finishLints[1]());
    expect(second).toEqual({ status: 'saved', writtenContentRevision: 2 });
    expect(store.getState().notifications.items.filter((notice) => notice.code === 'save-success')).toHaveLength(1);
});

it('does not let a late refused backend write settle a newer close-owned Save', async () => {
    const finishWrites: Array<(result: WriteResult) => void> = [];
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> =>
            op === 'format' ? { kind: 'edits', edits: [] } : { kind: 'findings', findings: [], total: 0 },
        ),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue(stableState());
    (documentWriteAdapter.save as jest.Mock).mockImplementation(
        () => new Promise<WriteResult>((resolve) => finishWrites.push(resolve)),
    );
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({ snapshot: stableState().snapshot });
    const owner = setup(tidy);
    let first: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            first = value;
        });
    });
    await waitFor(() => expect(finishWrites).toHaveLength(1));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 2,
                activeDocumentId: 'two',
                orderedDocumentIds: ['two'],
                documents: { two: documentFixture('two', 1) },
                ui: {},
            }),
        );
    });
    await waitFor(() => expect(first).toEqual({ status: 'disappeared' }));
    act(() => {
        store.dispatch(
            hydrateProjection({
                revision: 3,
                activeDocumentId: 'one',
                orderedDocumentIds: ['one'],
                documents: { one: documentFixture('one', 1) },
                ui: {},
            }),
        );
    });
    let second: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            second = value;
        });
    });
    await waitFor(() => expect(finishWrites).toHaveLength(2));
    await act(async () => finishWrites[0]({ status: 'refused' }));
    expect(second).toBeUndefined();
    await act(async () => finishWrites[1](committed));
    expect(second).toEqual({ status: 'saved', writtenContentRevision: 2 });
});

it('keeps a close-owned Save pending through normalization and finishes after one Format and Lint', async () => {
    const operations: string[] = [];
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> => {
            operations.push(op);
            return op === 'format' ? { kind: 'edits', edits: [] } : { kind: 'findings', findings: [], total: 0 };
        }),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({
        activeBuffer,
        snapshot: { revision: 1, activeDocumentId: 'one', documents: { one: documentFixture('one', 1) } },
    });
    (documentWriteAdapter.save as jest.Mock)
        .mockResolvedValueOnce({
            status: 'needs-normalization',
            documentRevision: 1,
            decisionToken: 'normal-1',
            proposedEnding: 'lf',
        })
        .mockResolvedValueOnce(committed);
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({
        snapshot: { revision: 3, activeDocumentId: 'one', documents: { one: documentFixture('one', 2) }, ui: {} },
    });
    const owner = setup(tidy);
    let outcome: { status: string } | undefined;
    act(() => {
        void owner.result.current.saveForClose('one').then((value) => {
            outcome = value;
        });
    });
    await waitFor(() => expect(owner.result.current.prompt.phase).toBe('normalization'));
    expect(outcome).toBeUndefined();
    await act(async () => {
        await owner.result.current.decideNormalization(true);
    });
    await waitFor(() => expect(outcome).toEqual({ status: 'saved', writtenContentRevision: 2 }));
    expect(documentWriteAdapter.save).toHaveBeenNthCalledWith(1, 'one', 1, '');
    expect(documentWriteAdapter.save).toHaveBeenNthCalledWith(2, 'one', 1, 'normal-1');
    expect(operations).toEqual(['format', 'lint']);
});

it('does not resume close after a committed write needs recovery', async () => {
    const tidy: TidyCommands = {
        run: jest.fn(async (op): Promise<TidyCommandOutcome> =>
            op === 'format' ? { kind: 'edits', edits: [] } : { kind: 'findings', findings: [], total: 0 },
        ),
        cancel: jest.fn(),
        documentChanged: jest.fn(),
    };
    (appModelAdapter.flushActiveSession as jest.Mock).mockResolvedValue(undefined);
    (appModelAdapter.getState as jest.Mock).mockResolvedValue({
        activeBuffer,
        snapshot: { revision: 1, activeDocumentId: 'one', documents: { one: documentFixture('one', 1) } },
    });
    (documentWriteAdapter.save as jest.Mock).mockResolvedValue(committed);
    (appModelAdapter.reconcileCommittedWrite as jest.Mock).mockResolvedValue({
        savedOnDisk: true,
        message: 'Recovery needed',
        documentId: 'one',
    });
    const owner = setup(tidy);
    let outcome: { status: string } | undefined;
    await act(async () => {
        outcome = await owner.result.current.saveForClose('one');
    });
    expect(outcome).toEqual({ status: 'recovery' });
    expect(tidy.run).toHaveBeenCalledTimes(1);
});
