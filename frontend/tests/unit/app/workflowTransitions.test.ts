import {
    closePlanDecisions,
    closeStateFor,
    recoveryDiscardNames,
    type CloseContext,
} from '../../../src/app/closeWorkflow';
import {
    isConflictCurrent,
    selectConflictPrompt,
    type ConflictPresentation,
} from '../../../src/app/conflictPresentation';
import { promptAfterWrite } from '../../../src/app/writeWorkflow';
import type { ClosePlanSummary } from '../../../src/logic/store/appModelTypes';
import { conflictFixture, documentFixture } from '../../support/appFixtures';

const intent = { kind: 'save-as' as const, documentId: 'one', filename: 'one.md' };
const context: CloseContext = {
    origin: { type: 'tabs', kind: 'others', targetDocumentIds: ['one', 'two'] },
    acceptedNormalizations: {},
};

function plan(): ClosePlanSummary {
    return {
        id: 'plan-1',
        kind: 'others',
        tabSetRevision: 4,
        status: 'ready',
        targets: [
            {
                documentId: 'one',
                title: 'one.md',
                dirty: true,
                choice: 'save',
                contentRevision: 3,
                normalizationToken: 'normalize-one',
                proposedEnding: 'crlf',
            },
            { documentId: 'two', title: 'two.md', dirty: false, contentRevision: 0 },
        ],
    };
}

it('retains Save As and its target across normalization and conflict instead of falling back to Save', () => {
    expect(
        promptAfterWrite(
            { status: 'needs-normalization', decisionToken: 'fresh', documentRevision: 7, proposedEnding: 'crlf' },
            intent,
            3,
            '',
        ),
    ).toEqual({
        phase: 'normalization',
        request: {
            kind: 'save-as',
            documentId: 'one',
            filename: 'one.md',
            contentRevision: 7,
            decisionToken: 'fresh',
            proposedEnding: 'crlf',
        },
    });
    const preview = conflictFixture('one', 7);
    expect(promptAfterWrite({ status: 'conflict', conflict: preview }, intent, 7, 'fresh')).toEqual({
        phase: 'conflict',
        request: { kind: 'save-as', documentId: 'one', filename: 'one.md', preview },
    });
    expect(promptAfterWrite({ status: 'cancelled' }, intent, 7, 'fresh')).toEqual({ phase: 'idle' });
});

it('executes a ready close after its normalization token was confirmed, without asking twice', () => {
    expect(closeStateFor(plan(), context).phase).toBe('normalization');
    const next = closeStateFor(plan(), { ...context, acceptedNormalizations: { one: 'normalize-one' } });
    expect(next.phase).toBe('executing');
    expect('origin' in next && next.origin).toEqual({
        type: 'tabs',
        kind: 'others',
        targetDocumentIds: ['one', 'two'],
    });
    expect(closeStateFor(plan(), { ...context, acceptedNormalizations: { one: 'expired' } }).phase).toBe(
        'normalization',
    );
});

it('continues from confirmed normalization to the conflict and overrides only the authorized target token', () => {
    const summary = plan();
    summary.targets[0].conflict = conflictFixture('one', 3);
    expect(closeStateFor(summary, { ...context, acceptedNormalizations: { one: 'normalize-one' } }).phase).toBe(
        'conflict',
    );
    expect(closePlanDecisions(summary, { documentId: 'one', decisionToken: 'keep-one' })).toEqual([
        { documentId: 'one', choice: 'save', decisionToken: 'keep-one' },
    ]);
});

it('selects Close before Save before foreground, while leaving each deferred identity intact', () => {
    const model = (id: string): ConflictPresentation => ({
        id,
        preview: conflictFixture(),
        valid: true,
        onDecision: async () => undefined,
    });
    const close = model('close:plan-1');
    const write = model('write:save-as:one');
    const foreground = model('foreground:two');
    expect(selectConflictPrompt(close, write, foreground)).toBe(close);
    expect(selectConflictPrompt(null, write, foreground)).toBe(write);
    expect(selectConflictPrompt(null, null, foreground)).toBe(foreground);
    expect(write.id).toBe('write:save-as:one');
});

it('rejects authorization for a closed or changed target, even when another document has the expected revision', () => {
    const preview = conflictFixture('one', 0);
    expect(isConflictCurrent(preview, { two: documentFixture('two') })).toBe(false);
    expect(isConflictCurrent(preview, { one: documentFixture('one', 1), two: documentFixture('two') })).toBe(false);
    expect(isConflictCurrent(preview, { one: { ...documentFixture(), contentRevision: undefined } })).toBe(true);
});

it('names only dirty documents in the recovery discard confirmation', () => {
    expect(
        recoveryDiscardNames(['one', 'two', 'removed'], {
            one: documentFixture(),
            two: { ...documentFixture('two'), dirty: false },
        }),
    ).toEqual(['\u2068one.md\u2069']);
});
