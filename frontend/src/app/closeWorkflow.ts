import type {
    CloseChoice,
    ClosePlanDecision,
    ClosePlanKind,
    ClosePlanSummary,
    ConflictPreview,
    DocumentMetadata,
} from '../logic/store/appModelTypes';
import { tabLabelsFor } from '../ui/widgets/tabLabel';

export type CloseOrigin =
    | { readonly type: 'tabs'; readonly kind: ClosePlanKind; readonly targetDocumentIds: string[] }
    | { readonly type: 'native'; readonly closeId: string };

export interface CloseContext {
    readonly origin: CloseOrigin;
    readonly acceptedNormalizations: Readonly<Record<string, string>>;
    readonly discardRecovery?: boolean;
}

export interface CloseNormalization {
    readonly documentId: string;
    readonly decisionToken: string;
    readonly filename: string;
    readonly proposedEnding: 'lf' | 'crlf';
}

export type CloseState =
    | { readonly phase: 'idle' }
    | (CloseContext & { readonly phase: 'preparing' | 'cancelling' | 'failed' | 'recovery-confirmation' })
    | (CloseContext & { readonly phase: 'collecting' | 'executing'; readonly plan: ClosePlanSummary })
    | (CloseContext & {
          readonly phase: 'normalization';
          readonly plan: ClosePlanSummary;
          readonly request: CloseNormalization;
      })
    | (CloseContext & {
          readonly phase: 'conflict';
          readonly plan: ClosePlanSummary;
          readonly preview: ConflictPreview;
      });

/** Tokens remain in backend summaries after confirmation; only unaccepted tokens need a prompt. */
export function closeStateFor(plan: ClosePlanSummary, context: CloseContext): CloseState {
    const normalization = plan.targets.find(
        (target) =>
            target.dirty &&
            target.choice === 'save' &&
            target.normalizationToken !== undefined &&
            target.proposedEnding !== undefined &&
            context.acceptedNormalizations[target.documentId] !== target.normalizationToken,
    );
    if (normalization !== undefined) {
        return {
            ...context,
            phase: 'normalization',
            plan,
            request: {
                documentId: normalization.documentId,
                decisionToken: normalization.normalizationToken as string,
                filename: normalization.displayName ?? normalization.title,
                proposedEnding: normalization.proposedEnding ?? 'lf',
            },
        };
    }
    const conflict = plan.targets.find(
        (target) => target.dirty && target.choice === 'save' && target.conflict !== undefined,
    )?.conflict;
    if (conflict !== undefined) return { ...context, phase: 'conflict', plan, preview: conflict };
    return { ...context, phase: plan.status === 'ready' ? 'executing' : 'collecting', plan };
}

export function closePlanDecisions(
    plan: ClosePlanSummary,
    tokenOverride?: { documentId: string; decisionToken: string },
): ClosePlanDecision[] {
    return plan.targets
        .filter((target) => target.dirty && target.choice !== undefined)
        .map((target) => ({
            choice: target.choice as CloseChoice,
            documentId: target.documentId,
            decisionToken:
                target.documentId === tokenOverride?.documentId
                    ? tokenOverride.decisionToken
                    : target.normalizationToken,
        }));
}

export function recoveryDiscardNames(
    orderedIds: readonly string[],
    documents: Readonly<Record<string, DocumentMetadata>>,
): string[] {
    const ordered = orderedIds
        .map((id) => documents[id])
        .filter((document): document is DocumentMetadata => document !== undefined);
    const labels = tabLabelsFor(ordered);
    return ordered
        .filter((document) => document.dirty)
        .map((document) => labels.get(document.documentId)?.label ?? document.displayName ?? document.title);
}
