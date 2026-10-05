import type { Heading, List, Root } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';

import { headingReplacement } from './edits';
import type { TidyPreferences } from './prefs';
import type { LintFinding, LintRule } from './protocol';
import {
    expectedBulletMarker,
    expectedEmphasisMarker,
    hardBreakRanges,
    inlineMarkerRanges,
    protectedRanges,
    unorderedMarkerAt,
    type BulletMarker,
    type SourceRange,
} from './rules';

export interface LintState {
    h1Count: number;
}

const errors = new Set<LintRule>(['trailing-space', 'final-newline']);

function lineStarts(source: string): number[] {
    const starts = [0];
    for (let index = 0; index < source.length; index++) if (source[index] === '\n') starts.push(index + 1);
    return starts;
}

function position(starts: number[], offset: number): { line: number; column: number } {
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
        const middle = (low + high) >>> 1;
        if (starts[middle] <= offset) low = middle;
        else high = middle;
    }
    return { line: low + 1, column: offset - starts[low] + 1 };
}

function finding(rule: LintRule, from: number, to: number, starts: number[], length: number): LintFinding {
    // Monaco markers require a nonempty span, including for a missing EOF newline.
    if (from === to && from > 0) from--;
    else if (from === to) to = Math.min(length, to + 1) || 1;
    const start = position(starts, from);
    const end = position(starts, to);
    return {
        rule,
        severity: errors.has(rule) ? 'error' : 'warning',
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        endColumn: end.column,
        message: { key: `lint.rule.${rule}.message` },
        hint: `lint.rule.${rule}.hint`,
    };
}

function overlaps(spans: SourceRange[], from: number, to: number): boolean {
    return spans.some((span) => span.from < to && span.to > from);
}

function lintLists(
    source: string,
    tree: Root,
    prefs: TidyPreferences,
    add: (rule: LintRule, from: number, to: number) => void,
): void {
    const expected = new Map<object, BulletMarker>();
    visit(tree, 'list', (list, index, parent) => {
        const previous = index === undefined ? undefined : parent?.children[index - 1];
        const previousList = previous?.type === 'list' ? previous : null;
        if (!list.ordered) {
            const marker = expectedBulletMarker(
                list,
                previousList,
                previousList === null ? null : (expected.get(previousList) ?? null),
                source,
                prefs.bullet,
            );
            expected.set(list, marker);
            if (unorderedMarkerAt(list, source) !== null) {
                for (const item of list.children) {
                    const from = item.position?.start.offset;
                    if (from !== undefined && ['-', '*', '+'].includes(source[from]) && source[from] !== marker)
                        add('ul-marker', from, from + 1);
                }
            }
        }
        lintListIndent(source, list, add);
    });
}

function lintListIndent(source: string, list: List, add: (rule: LintRule, from: number, to: number) => void): void {
    const items = list.children.map((item) => {
        const from = item.position?.start.offset;
        const column = item.position?.start.column;
        if (from === undefined || column === undefined) return null;
        const marker = list.ordered ? /^\d{1,9}[.)]/u.exec(source.slice(from)) : /^[-+*]/u.exec(source.slice(from));
        return marker === null ? null : { from, column, width: marker[0].length };
    });
    const first = items[0];
    if (first === null || first === undefined) return;
    for (const item of items.slice(1)) {
        if (
            item !== null &&
            item.column !== first.column &&
            !(list.ordered && item.column + item.width === first.column + first.width)
        )
            add('list-indent', item.from, item.from + item.width);
    }
}

function lintInline(
    source: string,
    tree: Root,
    prefs: TidyPreferences,
    add: (rule: LintRule, from: number, to: number) => void,
): void {
    visit(tree, (node, _index, parent) => {
        if (node.type === 'table') return SKIP;
        if (node.type !== 'emphasis' && node.type !== 'strong') return;
        const ranges = inlineMarkerRanges(node);
        if (ranges === null) return;
        const marker =
            node.type === 'strong'
                ? '**'
                : expectedEmphasisMarker(node, source, prefs.emphasis, parent?.type === 'strong' ? parent : null);
        if (
            source.slice(ranges.open.from, ranges.open.to) !== marker ||
            source.slice(ranges.close.from, ranges.close.to) !== marker
        )
            add(node.type === 'strong' ? 'strong-marker' : 'emphasis-marker', ranges.open.from, ranges.close.to);
    });
}

function lintHeadings(
    source: string,
    tree: Root,
    prefs: TidyPreferences,
    state: LintState,
    add: (rule: LintRule, from: number, to: number) => void,
): void {
    visit(tree, 'heading', (heading: Heading) => {
        const from = heading.position?.start.offset;
        const to = heading.position?.end.offset;
        if (from === undefined || to === undefined) return;
        if (heading.depth === 1 && state.h1Count++ > 0) add('single-h1', from, to);
        if (heading.depth <= 2 && headingReplacement(source, heading, source.slice(from, to), prefs.heading) !== null)
            add('heading-style', from, to);
    });
}

function lintLines(source: string, tree: Root, add: (rule: LintRule, from: number, to: number) => void): void {
    const protectedSpans = protectedRanges(tree, source);
    const breaks = hardBreakRanges(tree);
    let blanks = 0;
    for (let from = 0; from < source.length;) {
        const newline = source.indexOf('\n', from);
        const end = newline < 0 ? source.length : newline;
        const after = newline < 0 ? end : end + 1;
        const value = source.slice(from, end);
        const protectedLine = overlaps(protectedSpans, from, after);
        if (/^[ \t]*$/u.test(value) && !protectedLine) {
            blanks++;
            if (blanks === 2) add('blank-lines', from, after);
        } else blanks = 0;
        const whitespace = /[ \t]+$/u.exec(value);
        if (whitespace !== null) {
            const start = end - whitespace[0].length;
            const hardBreak =
                whitespace[0].length >= 2 &&
                /^ +$/u.test(whitespace[0]) &&
                breaks.some((span) => span.from <= start && span.to > end);
            if (!overlaps(protectedSpans, start, end) && !hardBreak) add('trailing-space', start, end);
        }
        from = after;
    }
}

function lintFences(source: string, tree: Root, add: (rule: LintRule, from: number, to: number) => void): void {
    visit(tree, 'code', (node) => {
        const from = node.position?.start.offset;
        if (from === undefined || node.lang) return;
        const marker = /^(`{3,}|~{3,})/u.exec(source.slice(from));
        if (marker !== null) add('fence-language', from, from + marker[1].length);
    });
}

export function lintFindings(
    source: string,
    tree: Root,
    prefs: TidyPreferences,
    state: LintState,
    finalChunk: boolean,
): LintFinding[] {
    const starts = lineStarts(source);
    const findings: LintFinding[] = [];
    const add = (rule: LintRule, from: number, to: number): void => {
        findings.push(finding(rule, from, to, starts, source.length));
    };
    lintLists(source, tree, prefs, add);
    lintInline(source, tree, prefs, add);
    lintHeadings(source, tree, prefs, state, add);
    lintLines(source, tree, add);
    lintFences(source, tree, add);
    if (finalChunk && !source.endsWith('\n')) add('final-newline', source.length, source.length);
    return findings.sort(
        (left, right) =>
            left.startLine - right.startLine ||
            left.startColumn - right.startColumn ||
            left.endLine - right.endLine ||
            left.endColumn - right.endColumn ||
            left.rule.localeCompare(right.rule),
    );
}
