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

it('prioritizes the close normalization prompt over a write prompt', async () => {
    const decideNormalization = jest.fn();
    const close = {
        active: true,
        state: { phase: 'normalization', plan: { id: 'close-plan' }, request },
        conflict: null,
        decideNormalization,
    } as unknown as CloseWorkflow;
    const writes = {
        active: true,
        closeOwnedPrompt: true,
        validationFailed: false,
        prompt: { phase: 'normalization', request },
        conflict: null,
        decideNormalization: jest.fn(),
        revalidatePrompt: jest.fn().mockResolvedValue(true),
    } as unknown as DocumentWrites;
    const external = { active: false, conflict: null } as ReturnType<typeof useExternalChanges>;
    const { result } = renderHook(() => useWorkflowPrompts(close, writes, external));

    expect(result.current.normalization?.id).toBe('close:close-plan:normalize-2');
    await result.current.normalization?.onConfirm();
    result.current.normalization?.onCancel();
    expect(decideNormalization).toHaveBeenNthCalledWith(1, true);
    expect(decideNormalization).toHaveBeenNthCalledWith(2, false);
    expect(writes.decideNormalization).not.toHaveBeenCalled();
});

it('routes write normalization choices to the write owner', async () => {
    const { result, writes } = prompts(true);
    expect(result.current.normalization?.id).toBe('write:normalize-2');
    await result.current.normalization?.onConfirm();
    result.current.normalization?.onCancel();
    expect(writes.decideNormalization).toHaveBeenNthCalledWith(1, true);
    expect(writes.decideNormalization).toHaveBeenNthCalledWith(2, false);
});
