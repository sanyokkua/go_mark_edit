import { useEffect, useState } from 'react';

import { selectConflictPrompt } from './conflictPresentation';
import type { CloseWorkflow } from './useCloseWorkflow';
import type { DocumentWrites } from './useDocumentWrites';
import type { useExternalChanges } from './useExternalChanges';

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

    const writeVisible = !close.active && writeReady && !writes.validationFailed;
    const normalization =
        close.state.phase === 'normalization'
            ? {
                  id: `close:${close.state.plan.id}:${close.state.request.decisionToken}`,
                  ...close.state.request,
                  onConfirm: () => close.decideNormalization(true),
                  onCancel: () => {
                      void close.decideNormalization(false);
                  },
              }
            : writeVisible && writes.prompt.phase === 'normalization'
              ? {
                    id: `write:${writes.prompt.request.decisionToken}`,
                    ...writes.prompt.request,
                    onConfirm: () => writes.decideNormalization(true),
                    onCancel: () => {
                        void writes.decideNormalization(false);
                    },
                }
              : null;
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
