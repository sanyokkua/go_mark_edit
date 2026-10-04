import { renderHook } from '@testing-library/react';

import { useWorkflowPrompts } from '../../src/app/useWorkflowPrompts';
import type { CloseWorkflow } from '../../src/app/useCloseWorkflow';
import type { DocumentWrites } from '../../src/app/useDocumentWrites';
import type { useExternalChanges } from '../../src/app/useExternalChanges';

const request = {
    documentId: 'one',
    filename: 'one.md',
    kind: 'save' as const,
    contentRevision: 2,
    decisionToken: 'normalize-2',
    proposedEnding: 'lf' as const,
};

function prompts(closeOwnedPrompt: boolean) {
    const close = { active: true, state: { phase: 'saving-active' }, conflict: null } as CloseWorkflow;
    const writes = {
        active: true,
        closeOwnedPrompt,
        validationFailed: false,
        prompt: { phase: 'normalization', request },
        conflict: null,
        decideNormalization: jest.fn(),
        revalidatePrompt: jest.fn().mockResolvedValue(true),
    } as unknown as DocumentWrites;
    const external = { active: false, conflict: null } as ReturnType<typeof useExternalChanges>;
    return { result: renderHook(() => useWorkflowPrompts(close, writes, external)).result, writes };
}

it('shows the close-owned normalization decision while the active Save awaits it', () => {
    const { result } = prompts(true);
    expect(result.current.normalization?.documentId).toBe('one');
    expect(result.current.modalOpen).toBe(true);
});

it('keeps an unrelated write prompt deferred during an active close', () => {
    const { result } = prompts(false);
    expect(result.current.normalization).toBeNull();
    expect(result.current.modalOpen).toBe(true);
});
