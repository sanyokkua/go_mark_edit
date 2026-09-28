import { useMemo } from 'react';

import { documentConflictAdapter } from '../logic/adapter';
import type { ConflictPreview, ConflictResult } from '../logic/store/appModelTypes';
import type { ExternalChangeDecision } from '../ui/widgets/dialogs/ExternalChangePrompt';
import type { GuardedActivation } from '../ui/widgets/editorSession';

export interface ConflictCommands {
    execute: (decision: ExternalChangeDecision, preview: ConflictPreview) => Promise<ConflictResult>;
}

/** Shares transport and reload installation; each caller owns its continuation. */
export function useConflictCommands(activation: GuardedActivation): ConflictCommands {
    return useMemo(
        () => ({
            async execute(decision: ExternalChangeDecision, preview: ConflictPreview): Promise<ConflictResult> {
                const { documentId, contentRevision, detectedDiskVersion } = preview;
                switch (decision) {
                    case 'reload': {
                        const generation = activation.begin();
                        const result = await documentConflictAdapter.reloadFromDisk(
                            documentId,
                            contentRevision,
                            detectedDiskVersion,
                        );
                        if (result.status === 'reloaded' && result.error === undefined) {
                            activation.acknowledge(generation, result.activeBuffer, documentId, 'reload');
                        }
                        return result;
                    }
                    case 'keep-mine':
                        return documentConflictAdapter.authorizeKeepMine(
                            documentId,
                            contentRevision,
                            preview.path ?? '',
                            detectedDiskVersion,
                        );
                    case 'skip':
                        return documentConflictAdapter.skipConflict(documentId, contentRevision, detectedDiskVersion);
                    case 'cancel':
                        return documentConflictAdapter.cancelConflict(documentId, contentRevision, detectedDiskVersion);
                }
            },
        }),
        [activation],
    );
}
