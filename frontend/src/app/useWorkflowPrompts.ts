import { useEffect, useState } from 'react';

import { selectConflictPrompt } from './conflictPresentation';
import type { CloseWorkflow } from './useCloseWorkflow';
import type { DocumentWrites } from './useDocumentWrites';
import type { useExternalChanges } from './useExternalChanges';

function normalizationPrompt(close: CloseWorkflow, writes: DocumentWrites, writeVisible: boolean) {
    if (close.state.phase === 'normalization') {
        return {
            id: `close:${close.state.plan.id}:${close.state.request.decisionToken}`,
            ...close.state.request,
            onConfirm: () => close.decideNormalization(true),
            onCancel: () => {
                void close.decideNormalization(false);
            },
        };
    }
    if (writeVisible && writes.prompt.phase === 'normalization') {
        return {
            id: `write:${writes.prompt.request.decisionToken}`,
            ...writes.prompt.request,
            onConfirm: () => writes.decideNormalization(true),
            onCancel: () => {
                void writes.decideNormalization(false);
            },
        };
    }
    return null;
}

/** Suspended writes retain their owner and intent; resumption only revalidates the prompt. */
export function useWorkflowPrompts(
    close: CloseWorkflow,
    writes: DocumentWrites,
    external: ReturnType<typeof useExternalChanges>,
) {
    const [writeReady, setWriteReady] = useState(true);
    if (close.active && writes.active && writeReady) setWriteReady(false);
    useEffect(() => {
        if (close.active || writeReady) return;
        let disposed = false;
        void writes.revalidatePrompt().finally(() => {
            if (!disposed) setWriteReady(true);
        });
        return () => {
            disposed = true;
        };
    }, [close.active, writeReady, writes.revalidatePrompt]);

    const closeOwnedWriteVisible = close.state.phase === 'saving-active' && writes.closeOwnedPrompt;
    const writeVisible = (closeOwnedWriteVisible || (!close.active && writeReady)) && !writes.validationFailed;
    const normalization = normalizationPrompt(close, writes, writeVisible);
    const conflict = selectConflictPrompt(close.conflict, writeVisible ? writes.conflict : null, external.conflict);
    return {
        normalization,
        conflict,
        close: close.state.phase === 'collecting' ? { plan: close.state.plan, onChoice: close.choose } : null,
        recovery:
            close.state.phase === 'recovery-confirmation'
                ? {
                      names: close.recoveryDiscardNames,
                      onConfirm: () => {
                          void close.decideRecovery(true);
                      },
                      onCancel: () => {
                          void close.decideRecovery(false);
                      },
                  }
                : null,
        modalOpen: close.active || external.active || ((writes.active || !writeReady) && !writes.validationFailed),
    } as const;
}

export type WorkflowPrompts = ReturnType<typeof useWorkflowPrompts>;
