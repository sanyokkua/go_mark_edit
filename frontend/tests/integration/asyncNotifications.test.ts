import { createAppModelAdapter } from '../../src/logic/adapter/appModelAdapter';
import { EVENTS } from '../../src/logic/adapter/events';
import { bootstrapAppModelProjection, disposeAppModelProjection } from '../../src/logic/store/appModelProjection';
import { store } from '../../src/logic/store';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';

async function subscribeErrors(): Promise<(payload: unknown) => void> {
    const listeners = new Map<string, (payload: unknown) => void>();
    const adapter = createAppModelAdapter(
        {
            getState: () =>
                Promise.resolve({
                    data: {
                        snapshot: {
                            revision: 1,
                            applicationVersion: 'test-build',
                            documents: {},
                            orderedDocumentIds: [],
                            activeDocumentId: null,
                            ui: {},
                        },
                        activeBuffer: null,
                    },
                }),
            updateBuffer: () => Promise.resolve({}),
            setDocView: () => Promise.resolve({}),
            setUILayout: () => Promise.resolve({}),
        },
        {
            eventsOn(event, listener) {
                listeners.set(event, listener);
                return () => listeners.delete(event);
            },
        },
    );
    await bootstrapAppModelProjection(adapter);
    return (payload) => listeners.get(EVENTS.stateError)?.(payload);
}

afterEach(() => {
    disposeAppModelProjection();
    store.dispatch(resetNotifications());
});

it('keeps a detached-file async failure specific and offers the backend document remediations', async () => {
    const emitError = await subscribeErrors();
    const failure = {
        code: 'not_found',
        title: 'notes.md',
        message: 'The file no longer exists. Save to recreate notes.md.',
        retryable: false,
        category: 'not-found',
        safeSubject: 'notes.md',
        documentId: 'detached-document',
        dedupKey: 'detached-document:not-found',
        remediations: ['Save to recreate', 'Copy path'],
    };
    const before = store.getState().documents;
    emitError(failure);
    emitError({ ...failure, message: 'notes.md is still missing. Save to recreate it.' });
    expect(store.getState().notifications.items).toEqual([
        expect.objectContaining({
            code: 'not_found',
            count: 2,
            title: 'notes.md',
            subject: 'detached-document:not-found',
            message: 'notes.md is still missing. Save to recreate it.',
            remediations: [
                {
                    action: 'save-to-recreate',
                    documentId: 'detached-document',
                    intent: 'save',
                    labelKey: 'action.save-to-recreate.label',
                },
                {
                    action: 'copy-path',
                    documentId: 'detached-document',
                    intent: 'copy-path',
                    labelKey: 'action.copy-path.label',
                },
            ],
        }),
    ]);
    expect(store.getState().documents).toBe(before);
});

it('retains async classified category and safe copy without inventing a retry command', async () => {
    const emitError = await subscribeErrors();
    emitError({
        code: 'internal',
        title: 'notes.md',
        message: 'The system could not reveal notes.md.',
        retryable: true,
        category: 'system-command-failure',
        safeSubject: 'notes.md',
        documentId: 'document-1',
        dedupKey: 'document-1:system-command-failure',
        remediations: ['Retry', 'Copy path'],
    });
    expect(store.getState().notifications.items).toEqual([
        expect.objectContaining({
            code: 'system-command-failure',
            title: 'notes.md',
            message: 'The system could not reveal notes.md.',
            remediations: [expect.objectContaining({ action: 'copy-path', documentId: 'document-1' })],
        }),
    ]);
});

it('retains the generic catalogue route for legacy async errors', async () => {
    const emitError = await subscribeErrors();
    emitError({
        code: 'io',
        title: 'legacy backend title',
        message: 'legacy backend details',
        details: { operation: 'update layout' },
        retryable: true,
    });
    expect(store.getState().notifications.items).toEqual([
        expect.objectContaining({
            code: 'io',
            title: 'File operation failed',
            message: 'The file operation could not be completed.',
            subject: 'update layout',
            remediations: [],
        }),
    ]);
});

it('keeps message-only async classified failures when Go omits empty remediations', async () => {
    const emitError = await subscribeErrors();
    emitError({
        code: 'io',
        title: 'notes.md',
        message: 'The document opened with default view settings.',
        retryable: false,
        category: 'persistence-warning',
        safeSubject: 'notes.md',
        dedupKey: 'notes.md:persistence-warning',
    });
    expect(store.getState().notifications.items).toEqual([
        expect.objectContaining({
            code: 'io',
            title: 'notes.md',
            message: 'The document opened with default view settings.',
            remediations: [],
        }),
    ]);
});
