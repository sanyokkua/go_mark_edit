import type { ConflictPreview, DocumentMetadata } from '../logic/store/appModelTypes';
import type { ExternalChangeDecision } from '../ui/widgets/dialogs/ExternalChangePrompt';

export interface ConflictPresentation {
    readonly id: string;
    readonly preview: ConflictPreview;
    readonly valid: boolean;
    readonly onDecision: (decision: ExternalChangeDecision) => Promise<void>;
}

export function isConflictCurrent(
    preview: ConflictPreview,
    documents: Readonly<Record<string, DocumentMetadata>>,
): boolean {
    const document = documents[preview.documentId];
    return document !== undefined && (document.contentRevision ?? 0) === preview.contentRevision;
}

export function selectConflictPrompt(
    close: ConflictPresentation | null,
    write: ConflictPresentation | null,
    foreground: ConflictPresentation | null,
): ConflictPresentation | null {
    return close ?? write ?? foreground;
}
