import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../src/logic/adapter', () => ({
    appModelAdapter: {
        openDocument: jest.fn(),
        openRecentFile: jest.fn(),
        openPreviewLink: jest.fn(),
        reopenLastFile: jest.fn(),
        createWorkspaceFile: jest.fn(),
        flushActiveSession: jest.fn(),
    },
    windowAdapter: {},
}));

import { useCommands } from '../../src/app/useCommands';
import { appModelAdapter } from '../../src/logic/adapter';
import { store } from '../../src/logic/store';
import { hydrateProjection, resetProjection } from '../../src/logic/store/appModelProjectionActions';
import { enterReading, resetReading } from '../../src/logic/store/readingSlice';
import { documentFixture } from '../support/appFixtures';
import { resetNotifications } from '../../src/logic/store/notificationsSlice';

const wrapper = ({ children }: PropsWithChildren): React.JSX.Element => <Provider store={store}>{children}</Provider>;
const adapter = appModelAdapter as unknown as Record<string, jest.Mock>;
const opened = { status: 'opened', documentId: 'doc-2', readingMode: true, activeBuffer: undefined };

function renderCommands(isCurrent: () => boolean = () => true) {
    const activation = { begin: jest.fn(() => 1), acknowledge: jest.fn(), isCurrent: jest.fn(isCurrent) };
    return renderHook(
        () =>
            useCommands(
                { activeBuffer: null, activation } as unknown as Parameters<typeof useCommands>[0],
                async () => 'closed',
            ),
        { wrapper },
    );
}

const link = { kind: 'localDocument', href: 'other.md' } as never;
const entryPoints: Array<
    [string, string, (commands: ReturnType<typeof renderCommands>['result']) => Promise<unknown>]
> = [
    ['Open dialog', 'openDocument', (r) => r.current.onOpenDocument(1)],
    ['Open Recent, launcher, tree and drop', 'openRecentFile', (r) => r.current.onOpenRecentFile('/a/b.md', 1)],
    ['Reopen Last', 'reopenLastFile', (r) => r.current.onReopenLastFile(1)],
    ['preview link', 'openPreviewLink', (r) => r.current.openLink(link, 'doc-1')],
];

let revision = 0;
function projectActive(activeDocumentId: string | null): void {
    revision += 1;
    store.dispatch(
        hydrateProjection({
            revision,
            tabSetRevision: revision,
            activeDocumentId,
            orderedDocumentIds: ['doc-1', 'doc-2'],
            documents: { 'doc-1': documentFixture('doc-1'), 'doc-2': documentFixture('doc-2') },
            ui: {},
        }),
    );
}

beforeEach((): void => projectActive('doc-2'));

afterEach((): void => {
    store.dispatch(resetProjection());
    revision = 0;
    jest.clearAllMocks();
    store.dispatch(resetReading());
    store.dispatch(resetNotifications());
});

describe.each(entryPoints)('%s', (_name, method, invoke) => {
    it('enters Reading mode when the open reports readingMode', async () => {
        adapter[method].mockResolvedValue(opened);
        const { result } = renderCommands();
        await act(async (): Promise<void> => {
            await invoke(result);
        });
        expect(store.getState().reading.active).toBe(true);
    });

    it('does not enter Reading mode without the flag and never clears an active one', async () => {
        adapter[method].mockResolvedValue({ ...opened, readingMode: undefined });
        const { result } = renderCommands();
        await act(async (): Promise<void> => {
            await invoke(result);
        });
        expect(store.getState().reading.active).toBe(false);
        act((): void => {
            store.dispatch(enterReading());
        });
        await act(async (): Promise<void> => {
            await invoke(result);
        });
        expect(store.getState().reading.active).toBe(true);
    });

    it('does not enter Reading mode when a newer open superseded it', async () => {
        adapter[method].mockResolvedValue(opened);
        const { result } = renderCommands(() => false);
        await act(async (): Promise<void> => {
            await invoke(result);
        });
        expect(store.getState().reading.active).toBe(false);
    });
});

it('waits for the projection to make the opened document active before entering Reading mode', async () => {
    projectActive(null);
    adapter.openDocument.mockResolvedValue(opened);
    const { result } = renderCommands();
    await act(async (): Promise<void> => {
        await result.current.onOpenDocument(1);
    });
    expect(store.getState().reading.active).toBe(false);

    act((): void => projectActive('doc-2'));
    expect(store.getState().reading.active).toBe(true);
});

describe('tree New File', () => {
    it('opens without Reading mode and leaves it when active', async () => {
        adapter.createWorkspaceFile.mockResolvedValue({ status: 'opened' });
        adapter.openRecentFile.mockResolvedValue(opened);
        const { result } = renderCommands();
        act((): void => {
            store.dispatch(enterReading());
        });
        await act(async (): Promise<void> => {
            await result.current.onCreateWorkspaceEntry('file', '/a', 'draft.md');
        });
        expect(adapter.openRecentFile).toHaveBeenCalled();
        expect(store.getState().reading.active).toBe(false);
    });

    it('does not enter Reading mode from an inactive state', async () => {
        adapter.createWorkspaceFile.mockResolvedValue({ status: 'opened' });
        adapter.openRecentFile.mockResolvedValue(opened);
        const { result } = renderCommands();
        await act(async (): Promise<void> => {
            await result.current.onCreateWorkspaceEntry('file', '/a', 'draft.md');
        });
        expect(store.getState().reading.active).toBe(false);
    });
});
