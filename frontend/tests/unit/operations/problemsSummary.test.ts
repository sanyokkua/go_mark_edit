import type { LintFinding } from '../../../src/logic/tidy/protocol';
import { clear, getSnapshot, markStale, replace, subscribe } from '../../../src/logic/operations/problemsSummary';

const finding: LintFinding = {
    rule: 'trailing-space',
    severity: 'error',
    startLine: 1,
    startColumn: 5,
    endLine: 1,
    endColumn: 6,
    message: { key: 'lint.rule.trailing-space.message' },
    hint: 'lint.rule.trailing-space.hint',
};

afterEach(() => clear());

it('retains exact findings and marks a changed document stale until replacement', () => {
    replace('first', [finding], 1500, 'line \n');
    expect(getSnapshot()).toEqual({ findings: [finding], total: 1500, stale: false });

    markStale('first', 'line \n');
    markStale('second', 'changed');
    expect(getSnapshot()?.stale).toBe(false);

    markStale('first', 'line changed\n');
    expect(getSnapshot()).toEqual({ findings: [finding], total: 1500, stale: true });

    replace('first', [], 0, 'line changed\n');
    expect(getSnapshot()).toEqual({ findings: [], total: 0, stale: false });
});

it('clears the active summary and publishes only changed snapshots', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    replace('first', [finding], 1, 'text');
    markStale('first', 'text');
    markStale('first', 'changed');
    markStale('first', 'changed again');
    clear();
    expect(getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
});
