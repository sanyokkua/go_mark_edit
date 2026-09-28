import { store } from '../../../src/logic/store';
import {
    applyStatePatch,
    hydrateProjection,
    resetProjection,
} from '../../../src/logic/store/appModelProjectionActions';
import { setWorkspaceReading, type WorkspaceState } from '../../../src/logic/store/workspaceSlice';
import type { WorkspaceSnapshot } from '../../../src/logic/store/appModelTypes';

const workspace: WorkspaceSnapshot = {
    rootPath: '/tmp/project',
    rootName: 'project',
    root: {
        path: '/tmp/project',
        name: 'project',
        isDir: true,
        children: [{ path: '/tmp/project/notes.md', name: 'notes.md', isDir: false }],
    },
    totalEntries: 2,
    truncated: false,
    unavailable: false,
    filterSuffixes: ['.md', '.markdown', '.mdown', '.txt'],
    showHiddenFolders: false,
};

const otherWorkspace: WorkspaceSnapshot = {
    rootPath: '/tmp/other-project',
    rootName: 'other-project',
    root: { path: '/tmp/other-project', name: 'other-project', isDir: true },
    totalEntries: 1,
    truncated: false,
    unavailable: false,
    filterSuffixes: ['.md', '.markdown', '.mdown', '.txt'],
    showHiddenFolders: true,
};

function projectedWorkspace(): WorkspaceState {
    return store.getState().workspace;
}

function hydrate(revision: number, snapshot: WorkspaceSnapshot): void {
    store.dispatch(
        hydrateProjection({
            revision,
            documents: {},
            activeDocumentId: '',
            ui: {},
            workspace: snapshot,
        }),
    );
}

beforeEach((): void => {
    store.dispatch(resetProjection());
});

it('When the projection hydrates a workspace, the slice exposes its tree and starts idle.', (): void => {
    hydrate(3, workspace);

    expect(projectedWorkspace()).toEqual({ revision: 3, snapshot: workspace, reading: false });
});

it('When a patch omits workspace it remains open, and an explicit null patch clears it.', (): void => {
    hydrate(3, workspace);
    store.dispatch(applyStatePatch({ revision: 4 }));

    expect(projectedWorkspace()?.snapshot).toEqual(workspace);

    store.dispatch(applyStatePatch({ revision: 5, workspace: otherWorkspace }));
    expect(projectedWorkspace()?.snapshot).toEqual(otherWorkspace);

    store.dispatch(applyStatePatch({ revision: 6, workspace: null }));

    expect(projectedWorkspace()?.snapshot).toBeNull();
});

it('When a workspace patch is older than the projection, it is ignored and reset clears local state.', (): void => {
    hydrate(3, workspace);
    store.dispatch(applyStatePatch({ revision: 2, workspace: null }));

    expect(projectedWorkspace()).toEqual({ revision: 3, snapshot: workspace, reading: false });

    store.dispatch(resetProjection());

    expect(projectedWorkspace()).toEqual({ revision: -1, snapshot: null, reading: false });
});

it('When a workspace read starts and ends, its local busy flag changes without a backend revision.', (): void => {
    hydrate(3, workspace);
    store.dispatch(setWorkspaceReading(true));

    expect(projectedWorkspace()).toEqual({ revision: 3, snapshot: workspace, reading: true });

    store.dispatch(setWorkspaceReading(false));

    expect(projectedWorkspace()).toEqual({ revision: 3, snapshot: workspace, reading: false });
});

it('When a workspace snapshot enters the projection, its nested nodes are copied.', (): void => {
    hydrate(3, workspace);

    const projected = projectedWorkspace().snapshot;
    expect(projected).not.toBe(workspace);
    expect(projected?.root).not.toBe(workspace.root);
    expect(projected?.root.children).not.toBe(workspace.root.children);
    expect(projected?.root.children?.[0]).not.toBe(workspace.root.children?.[0]);
});
