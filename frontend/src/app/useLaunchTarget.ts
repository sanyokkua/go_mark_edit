import { useEffect, useRef } from 'react';

import { windowAdapter } from '../logic/adapter';
import { store } from '../logic/store';
import type { UseCommandsResult } from './useCommands';

/**
 * Takes the file or folder this window accepted at startup, once, after
 * bootstrap is ready, and opens it with the existing open commands. The take is
 * not cancelled when the effect is cleaned up, so a target taken in flight
 * under StrictMode is still opened and the second take returns nothing.
 */
export function useLaunchTarget(
    commands: Pick<UseCommandsResult, 'onOpenRecentFile' | 'onOpenWorkspacePath'>,
    ready: boolean,
): void {
    const taken = useRef(false);
    const latestCommands = useRef(commands);
    useEffect(() => {
        latestCommands.current = commands;
    });

    useEffect(() => {
        if (!ready || taken.current) return;
        taken.current = true;
        void (async (): Promise<void> => {
            try {
                const target = await windowAdapter.takeLaunchTarget();
                if (target === undefined) return;
                if (target.kind === 'folder') {
                    await latestCommands.current.onOpenWorkspacePath(target.path);
                } else {
                    await latestCommands.current.onOpenRecentFile(
                        target.path,
                        store.getState().documents.tabSetRevision,
                    );
                }
            } catch {
                // The adapter has already shown the failure as a notification.
            }
        })();
    }, [ready]);
}
