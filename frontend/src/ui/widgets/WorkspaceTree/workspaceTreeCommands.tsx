import { createContext, useContext } from 'react';
import type { EntryCommandOutcome, WorkspaceCreateOutcome } from '../../../app/useCommands';
import type { WorkspaceNode } from '../../../logic/store/appModelTypes';
import type { PathCommandResult } from '../../../logic/store/appModelTypes';

export interface WorkspaceTreeCommands {
    onOpenFolder: () => unknown;
    onCloseFolder: () => unknown;
    onRefreshWorkspace: () => unknown;
    onSetWorkspaceHiddenFolders: (show: boolean) => unknown;
    onOpenTreeFile: (path: string, expectedTabSetRevision: number) => Promise<EntryCommandOutcome | undefined>;
    onTreeContextMenu?: (node: WorkspaceNode, point: { x: number; y: number }) => void;
    onCreateWorkspaceEntry?: (
        kind: 'file' | 'folder',
        parentPath: string,
        name: string,
    ) => Promise<WorkspaceCreateOutcome | undefined>;
    onFocusCreatedFile?: (documentId: string) => void;
    onRevealWorkspacePath?: (path: string) => Promise<PathCommandResult | undefined>;
    onCopyWorkspacePath?: (path: string) => Promise<PathCommandResult | undefined>;
}

export const WorkspaceTreeCommandsContext = createContext<WorkspaceTreeCommands | null>(null);

export function useWorkspaceTreeCommands(): WorkspaceTreeCommands {
    const commands = useContext(WorkspaceTreeCommandsContext);
    if (commands === null) throw new Error('WorkspaceTree requires WorkspaceTreeCommandsContext');
    return commands;
}
