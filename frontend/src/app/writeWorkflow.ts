import type { ConflictPreview, WriteResult } from '../logic/store/appModelTypes';

export interface WriteIntent {
    readonly documentId: string;
    readonly filename: string;
    readonly kind: 'save' | 'save-as';
}

export interface NormalizationRequest extends WriteIntent {
    readonly contentRevision: number;
    readonly decisionToken: string;
    readonly proposedEnding: 'lf' | 'crlf';
}

export interface ExternalConflictRequest extends WriteIntent {
    readonly preview: ConflictPreview;
}

export type WritePrompt =
    | { readonly phase: 'idle' }
    | { readonly phase: 'normalization'; readonly request: NormalizationRequest }
    | { readonly phase: 'conflict'; readonly request: ExternalConflictRequest };

export function promptAfterWrite(
    result: WriteResult,
    intent: WriteIntent,
    contentRevision: number,
    decisionToken: string,
): WritePrompt {
    if (result.status === 'needs-normalization') {
        return {
            phase: 'normalization',
            request: {
                ...intent,
                contentRevision: result.documentRevision ?? contentRevision,
                decisionToken: result.decisionToken ?? decisionToken,
                proposedEnding: result.proposedEnding ?? 'lf',
            },
        };
    }
    if (result.status === 'conflict' && result.conflict !== undefined) {
        return { phase: 'conflict', request: { ...intent, preview: result.conflict } };
    }
    return { phase: 'idle' };
}
