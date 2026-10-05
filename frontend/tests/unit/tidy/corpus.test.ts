import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { visit } from 'unist-util-visit';

import { runOnText } from '../../../src/logic/tidy/engine';
import { applyEdits } from '../../../src/logic/tidy/edits';
import { guardEdits } from '../../../src/logic/tidy/equivalence';
import { parseFull } from '../../../src/logic/tidy/parser';
import type { TidyPreferences } from '../../../src/logic/tidy/prefs';
import type { TextEdit } from '../../../src/logic/tidy/protocol';
import { hardBreakRanges, protectedRanges } from '../../../src/logic/tidy/rules';

const prefs: TidyPreferences = { bullet: '-', emphasis: '_', heading: 'atx' };
const corpusDirectory = join(__dirname, '../../fixtures/tidy-corpus');
const names = readdirSync(corpusDirectory)
    .filter((name) => name.endsWith('.md'))
    .sort();
const refusal = '11-quote-ordered-guard-candidate.md';
const matchingRules = {
    MD004: 'ul-marker',
    MD049: 'emphasis-marker',
    MD050: 'strong-marker',
    MD003: 'heading-style',
    MD009: 'trailing-space',
    MD012: 'blank-lines',
    MD040: 'fence-language',
    MD047: 'final-newline',
    MD025: 'single-h1',
} as const;
type OracleRule = keyof typeof matchingRules;
type Divergence = { oracle: number; local: number; reason: string };

// Each difference is tied to source behavior in one handwritten fixture. Counts are
// hand-checked expectations, not values taken from GoMarkEdit's lint result.
const intendedDivergences: Record<string, Partial<Record<OracleRule, Divergence>>> = {
    '04-adjacent-lists.md': {
        MD004: { oracle: 2, local: 0, reason: 'The two starred items keep adjacent unordered lists separate.' },
    },
    '17-table-inline-marks.md': {
        MD049: { oracle: 1, local: 0, reason: 'Format preserves marker bytes inside table cells.' },
    },
    '18-front-matter.md': {
        MD025: { oracle: 1, local: 0, reason: 'markdownlint counts the YAML title as an H1; Full mdast does not.' },
    },
    '29-nested-emphasis.md': {
        MD049: {
            oracle: 0,
            local: 3,
            reason: 'Safe adjacent delimiters in nested emphasis use marker choices that markdownlint exempts.',
        },
    },
    '31-multiline-setext.md': {
        MD003: { oracle: 1, local: 0, reason: 'This multiline Setext heading cannot be safely converted to ATX.' },
    },
    '32-leading-prose-headings.md': {
        MD025: {
            oracle: 0,
            local: 1,
            reason: 'Full mdast counts both H1s after prose; markdownlint treats the first as title.',
        },
    },
};
interface OracleIssue {
    lineNumber: number;
    ruleNames: string[];
    errorRange: [number, number] | null;
}

// markdownlint is ESM-only; the Jest project uses CommonJS for application tests.
const oracleScript = `
import { readFileSync } from 'node:fs';
import { lint } from 'markdownlint/sync';
const strings = JSON.parse(readFileSync(0, 'utf8'));
const results = lint({ strings, noInlineConfig: true, config: {
  default: false,
  MD004: { style: 'dash' }, MD049: { style: 'underscore' },
  MD050: { style: 'asterisk' }, MD003: { style: 'atx' },
  MD009: true, MD012: true, MD040: true, MD047: true, MD025: true,
} });
process.stdout.write(JSON.stringify(results));
`;
const documents = Object.fromEntries(names.map((name) => [name, readFileSync(join(corpusDirectory, name), 'utf8')]));
const oracle = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', oracleScript], {
        cwd: join(__dirname, '../../..'),
        input: JSON.stringify(documents),
        encoding: 'utf8',
    }),
) as Record<string, OracleIssue[]>;

function sourceOffset(source: string, line: number, column: number): number {
    const lines = source.split('\n');
    return lines.slice(0, line - 1).reduce((sum, value) => sum + value.length + 1, 0) + column - 1;
}

function oracleCount(source: string, rule: OracleRule, issues: OracleIssue[]): number {
    const relevant = issues.filter((issue) => issue.ruleNames[0] === rule);
    if (rule === 'MD012') {
        // MD012 reports every extra line; the product reports one finding per blank run.
        return relevant.filter((issue, index) => index === 0 || issue.lineNumber > relevant[index - 1].lineNumber + 1)
            .length;
    }
    if (rule === 'MD049' || rule === 'MD050') {
        // MD049/050 report opening and closing delimiters; match each to one parsed inline node.
        const kind = rule === 'MD049' ? 'emphasis' : 'strong';
        const nodes: Array<{ from: number; to: number }> = [];
        visit(parseFull(source), kind, (node) => {
            const from = node.position?.start.offset;
            const to = node.position?.end.offset;
            if (from !== undefined && to !== undefined) nodes.push({ from, to });
        });
        const matched = new Set<string>();
        for (const issue of relevant) {
            if (issue.errorRange === null) continue;
            const offset = sourceOffset(source, issue.lineNumber, issue.errorRange[0]);
            const node = nodes
                .filter(({ from, to }) => from <= offset && offset < to)
                .sort((a, b) => a.to - a.from - (b.to - b.from))[0];
            matched.add(node ? `${node.from}:${node.to}` : `unmatched:${issue.lineNumber}:${issue.errorRange[0]}`);
        }
        return matched.size;
    }
    if (rule === 'MD009') {
        const tree = parseFull(source);
        const protectedSpans = protectedRanges(tree, source);
        const breaks = hardBreakRanges(tree);
        return relevant.filter((issue) => {
            const line = source.split('\n')[issue.lineNumber - 1];
            const end = sourceOffset(source, issue.lineNumber, line.length + 1);
            const trailing = /[ \t]+$/u.exec(line);
            if (trailing === null) return true;
            const start = end - trailing[0].length;
            if (protectedSpans.some((span) => span.from < end && span.to > start)) return false;
            return !(
                trailing[0].length >= 2 &&
                /^ +$/u.test(trailing[0]) &&
                breaks.some((span) => span.from <= start && span.to > end)
            );
        }).length;
    }
    return relevant.length;
}

function codeSlices(source: string): string[] {
    const slices: string[] = [];
    visit(parseFull(source), 'code', (node) => {
        const from = node.position?.start.offset;
        const to = node.position?.end.offset;
        if (from !== undefined && to !== undefined) slices.push(source.slice(from, to));
    });
    return slices;
}

function wholeReplacementPreservesTree(before: string, after: string): void {
    const replacement: TextEdit[] = [{ from: 0, to: before.length, text: after }];
    expect(guardEdits(before, replacement, parseFull(before))).toEqual({ kind: 'edits', edits: replacement });
}

test('when the tidy corpus is loaded, it contains at least thirty distinct handwritten documents', () => {
    expect(names.length).toBeGreaterThanOrEqual(30);
    expect(new Set(names.map((name) => readFileSync(join(corpusDirectory, name), 'utf8'))).size).toBe(names.length);
});

test.each(names)(
    'when %s is tidied, both actions preserve the Full tree and code bytes and reach a fixed point',
    (name) => {
        const source = readFileSync(join(corpusDirectory, name), 'utf8');
        for (const op of ['format', 'compact'] as const) {
            const first = runOnText(op, source, prefs);
            if (name === refusal && op === 'format') {
                expect(first).toEqual({ kind: 'refused', reason: 'render-differs' });
                continue;
            }
            expect(first.kind).toBe('edits');
            if (first.kind !== 'edits') continue;
            const result = applyEdits(source, first.edits);
            wholeReplacementPreservesTree(source, result);
            expect(codeSlices(result)).toEqual(codeSlices(source));
            expect(runOnText(op, result, prefs)).toEqual({ kind: 'edits', edits: [] });
            if (op === 'format') {
                const lint = runOnText('lint', result, prefs);
                expect(lint.kind).toBe('findings');
                if (lint.kind === 'findings') {
                    expect(
                        lint.findings.filter(
                            (finding) => !['fence-language', 'single-h1', 'list-indent'].includes(finding.rule),
                        ),
                    ).toEqual([]);
                }
            }
        }
    },
);

test.each(names)('when %s is linted, nine rule counts agree with markdownlint or a named source divergence', (name) => {
    const source = documents[name];
    const outcome = runOnText('lint', source, prefs);
    expect(outcome.kind).toBe('findings');
    if (outcome.kind !== 'findings') return;
    for (const [rule, localRule] of Object.entries(matchingRules) as Array<
        [OracleRule, (typeof matchingRules)[OracleRule]]
    >) {
        const actual = outcome.findings.filter((finding) => finding.rule === localRule).length;
        const expected = oracleCount(source, rule, oracle[name]);
        const divergence = intendedDivergences[name]?.[rule];
        if (divergence) {
            expect(divergence.reason.length).toBeGreaterThan(0);
            expect({ name, rule, oracle: expected, local: actual }).toEqual({
                name,
                rule,
                oracle: divergence.oracle,
                local: divergence.local,
            });
        } else expect({ name, rule, local: actual }).toEqual({ name, rule, local: expected });
    }
});
