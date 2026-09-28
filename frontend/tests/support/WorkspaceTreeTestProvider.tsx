import type { PropsWithChildren } from 'react';

import {
    WorkspaceTreeCommandsContext,
    type WorkspaceTreeCommands,
} from '../../src/ui/widgets/WorkspaceTree/workspaceTreeCommands';

const commands: WorkspaceTreeCommands = {
    onOpenFolder: (): void => undefined,
    onCloseFolder: (): void => undefined,
    onRefreshWorkspace: (): void => undefined,
    onSetWorkspaceHiddenFolders: (): void => undefined,
    onOpenTreeFile: (): Promise<undefined> => Promise.resolve(undefined),
};

export function WorkspaceTreeTestProvider({ children }: PropsWithChildren): React.JSX.Element {
    return <WorkspaceTreeCommandsContext.Provider value={commands}>{children}</WorkspaceTreeCommandsContext.Provider>;
}
