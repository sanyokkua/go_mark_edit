import { createContext } from 'react';

import type { DocumentCommandAPI } from '../../logic/hooks/useDocumentCommands';
import type { TidyOp, TidyOutcome } from '../../logic/tidy/protocol';

export interface TidyCommands {
    run(
        op: TidyOp,
        options?: { origin?: 'user' | 'on-save'; commands?: DocumentCommandAPI; documentId?: string },
    ): Promise<TidyOutcome>;
    cancel(): void;
    documentChanged(documentId: string, text: string): void;
}

export const TidyCommandsContext = createContext<TidyCommands | null>(null);
