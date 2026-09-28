import { createAction, createSlice } from '@reduxjs/toolkit';

import { applyStatePatch, hydrateProjection, resetProjection } from './appModelProjectionActions';
import type { WorkspaceNode, WorkspaceSnapshot } from './appModelTypes';

export interface WorkspaceState {
    revision: number;
    snapshot: WorkspaceSnapshot | null;
    reading: boolean;
}

const initialState: WorkspaceState = {
    revision: -1,
    snapshot: null,
    reading: false,
};

export const setWorkspaceReading = createAction<boolean>('workspace/setReading');

function normalizeWorkspaceNode(node: WorkspaceNode): WorkspaceNode {
    return {
        path: node.path,
        name: node.name,
        isDir: node.isDir,
        unreadable: node.unreadable,
        children: node.children?.map(normalizeWorkspaceNode),
    };
}

function normalizeWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
    return {
        rootPath: snapshot.rootPath,
        rootName: snapshot.rootName,
        root: normalizeWorkspaceNode(snapshot.root),
        totalEntries: snapshot.totalEntries,
        truncated: snapshot.truncated,
        unavailable: snapshot.unavailable,
        filterSuffixes: [...snapshot.filterSuffixes],
        showHiddenFolders: snapshot.showHiddenFolders,
    };
}

const workspaceSlice = createSlice({
    name: 'workspace',
    initialState,
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(hydrateProjection, (state, action): void => {
                if (action.payload.revision < state.revision) {
                    return;
                }

                state.revision = action.payload.revision;
                state.snapshot =
                    action.payload.workspace === undefined
                        ? null
                        : normalizeWorkspaceSnapshot(action.payload.workspace);
                state.reading = false;
            })
            .addCase(applyStatePatch, (state, action): void => {
                const patch = action.payload;
                if (patch.revision <= state.revision) {
                    return;
                }

                state.revision = patch.revision;
                if (patch.workspace !== undefined) {
                    state.snapshot = patch.workspace === null ? null : normalizeWorkspaceSnapshot(patch.workspace);
                }
            })
            .addCase(setWorkspaceReading, (state, action): void => {
                state.reading = action.payload;
            })
            .addCase(resetProjection, (): WorkspaceState => initialState);
    },
});

export const workspaceReducer = workspaceSlice.reducer;
