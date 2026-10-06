import { fireEvent, render, screen, within } from '@testing-library/react';

import type { ProblemsSummary } from '../../../src/logic/operations/problemsSummary';
import type { LintFinding } from '../../../src/logic/tidy/protocol';
import ProblemsPanel from '../../../src/ui/widgets/ProblemsPanel/ProblemsPanel';

function finding(line: number, rule: LintFinding['rule'] = 'trailing-space'): LintFinding {
    return {
        rule,
        severity: line === 2 ? 'error' : 'warning',
        startLine: line,
        startColumn: 3,
        endLine: line,
        endColumn: 4,
        message: { key: `lint.rule.${rule}.message` },
        hint: `lint.rule.${rule}.hint`,
    };
}

function panel(summary: ProblemsSummary | null, onActivate = jest.fn(), onClose = jest.fn()): void {
    render(<ProblemsPanel summary={summary} onActivate={onActivate} onClose={onClose} />);
}

it('shows a named region and a run prompt before Lint has run', () => {
    panel(null);
    expect(screen.getByRole('region', { name: 'Problems' })).toHaveTextContent('Run Lint to check this document');
    expect(screen.queryAllByRole('button', { name: /line \d+/i })).toHaveLength(0);
});

it('shows the clean state after Lint finds no problems', () => {
    panel({ findings: [], total: 0, stale: false });
    expect(screen.getByRole('region', { name: 'Problems' })).toHaveTextContent('No problems');
});

it('lists findings in document order with severity, position, message and rule', () => {
    panel({ findings: [finding(7), finding(2, 'single-h1'), finding(4, 'fence-language')], total: 3, stale: false });
    const rows = within(screen.getByRole('region', { name: 'Problems' })).getAllByRole('button', {
        name: /Line \d+, column/i,
    });
    expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Line 2, column 3'),
        expect.stringContaining('Line 4, column 3'),
        expect.stringContaining('Line 7, column 3'),
    ]);
    expect(rows[0]).toHaveTextContent('Error');
    expect(rows[0]).toHaveTextContent('This document has more than one top-level heading.');
    expect(rows[0]).toHaveTextContent('Multiple top-level headings');
});

it('activates a finding with click and Enter, and keeps each row in keyboard order', () => {
    const onActivate = jest.fn();
    panel({ findings: [finding(2), finding(4)], total: 2, stale: false }, onActivate);
    const rows = screen.getAllByRole('button', { name: /Line \d+, column/i });
    expect(rows).toHaveLength(2);
    expect(rows[0].tabIndex).toBe(0);
    expect(rows[1].tabIndex).toBe(0);
    fireEvent.click(rows[0]);
    expect(fireEvent.keyDown(rows[1], { key: 'Enter', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(rows[1], { key: 'Enter', metaKey: true })).toBe(true);
    expect(onActivate).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(rows[1], { key: 'Enter' });
    expect(onActivate).toHaveBeenNthCalledWith(1, expect.objectContaining({ startLine: 2, startColumn: 3 }));
    expect(onActivate).toHaveBeenNthCalledWith(2, expect.objectContaining({ startLine: 4, startColumn: 3 }));
});

it('shows an out of date banner while retaining stale findings', () => {
    panel({ findings: [finding(3)], total: 1, stale: true });
    expect(screen.getByText('Results are out of date until Lint runs again')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Line 3, column 3/i })).toBeInTheDocument();
});

it('caps visible rows at 10,000 and reports the remaining 2,000', () => {
    const findings = Array.from({ length: 12000 }, (_, index) => finding(index + 1));
    panel({ findings, total: 12000, stale: false });
    expect(document.querySelectorAll('[data-problem-row]')).toHaveLength(10000);
    expect(screen.getByText('2,000 more not shown')).toBeInTheDocument();
});

it('closes from the named header button', () => {
    const onClose = jest.fn();
    panel(null, jest.fn(), onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Close Problems' }));
    expect(onClose).toHaveBeenCalledTimes(1);
});
