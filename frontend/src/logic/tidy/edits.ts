import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

import type { TidyPreferences } from './prefs';
import type { TextEdit } from './protocol';
import {
    expectedBulletMarker,
    expectedEmphasisMarker,
    hardBreakRanges,
    inlineMarkerRanges,
    protectedRanges,
    unorderedMarkerAt,
    type BulletMarker,
} from './rules';

export function applyEdits(source: string, edits: TextEdit[]): string {
    let previous = 0;
    let result = '';
    for (const edit of edits) {
        if (edit.from < previous || edit.to < edit.from || edit.to > source.length)
            throw new Error('Overlapping or invalid tidy edits');
        result += source.slice(previous, edit.from) + edit.text;
        previous = edit.to;
    }
    return result + source.slice(previous);
}

interface Line {
    from: number;
    end: number;
    after: number;
    value: string;
    blank: boolean;
    protected: boolean;
}

export function compactEdits(source: string, tree: Root): TextEdit[] {
    const protectedSpans = protectedRanges(tree, source);
    const breaks = hardBreakRanges(tree);
    const lines: Line[] = [];
    for (let from = 0; from < source.length;) {
        const newline = source.indexOf('\n', from);
        const end = newline < 0 ? source.length : newline;
        const after = newline < 0 ? end : end + 1;
        const value = source.slice(from, end);
        const protectedLine = protectedSpans.some((span) => span.from < after && span.to > from);
        lines.push({ from, end, after, value, blank: /^[ \t]*$/u.test(value), protected: protectedLine });
        from = after;
    }

    const edits: TextEdit[] = [];
    let blanks = 0;
    for (const line of lines) {
        if (line.blank && !line.protected) {
            blanks++;
            if (blanks > 1) {
                edits.push({ from: line.from, to: line.after, text: '' });
                continue;
            }
        } else {
            blanks = 0;
        }
        const whitespace = /[ \t]+$/u.exec(line.value);
        if (whitespace === null) continue;
        const from = line.end - whitespace[0].length;
        if (protectedSpans.some((span) => span.from < line.end && span.to > from)) continue;
        const hardBreak =
            whitespace[0].length >= 2 &&
            /^ +$/u.test(whitespace[0]) &&
            breaks.some((span) => span.from <= from && span.to > line.end);
        if (!hardBreak) edits.push({ from, to: line.end, text: '' });
    }
    return edits;
}

function blockGapEdits(source: string, tree: Root): TextEdit[] {
    const edits: TextEdit[] = [];
    visit(tree, (node) => {
        if (node.type !== 'root' && node.type !== 'blockquote' && node.type !== 'containerDirective') return;
        for (let index = 1; index < node.children.length; index++) {
            const previous = node.children[index - 1];
            const current = node.children[index];
            if (previous.type === 'list' && current.type === 'list') continue;
            const from = previous.position?.end.offset;
            const to = current.position?.start.offset;
            if (from === undefined || to === undefined) continue;
            const gap = source.slice(from, to);
            if (!/^\n[^\n]*$/u.test(gap)) continue;
            const prefix = gap.slice(1);
            if (!/^[\t >]*$/u.test(prefix)) continue;
            edits.push({ from, to: from, text: '\n' + prefix.trimEnd() });
        }
    });
    return edits;
}

function formatLineEdits(source: string, tree: Root, finalChunk: boolean): TextEdit[] {
    const edits = compactEdits(source, tree);
    if (!finalChunk) return edits.concat(blockGapEdits(source, tree));
    const tail = /[ \t\n]+$/u.exec(source);
    if (tail !== null) {
        const from = source.length - tail[0].length;
        const safe = !protectedRanges(tree, source).some((span) => span.from < source.length && span.to > from);
        if (safe) {
            if (tail[0] !== '\n') {
                for (let index = edits.length - 1; index >= 0; index--) {
                    if (edits[index].to > from || edits[index].from >= from) edits.splice(index, 1);
                }
                edits.push({ from, to: source.length, text: '\n' });
            }
        } else if (!source.endsWith('\n')) {
            edits.push({ from: source.length, to: source.length, text: '\n' });
        }
    } else {
        edits.push({ from: source.length, to: source.length, text: '\n' });
    }
    return edits.concat(blockGapEdits(source, tree));
}

export function formatEdits(source: string, tree: Root, prefs: TidyPreferences, finalChunk = true): TextEdit[] {
    const edits = formatLineEdits(source, tree, finalChunk);
    const expected = new Map<object, BulletMarker>();
    visit(tree, 'list', (list, index, parent) => {
        if (list.ordered) return;
        const previous = index === undefined ? undefined : parent?.children[index - 1];
        const previousList = previous?.type === 'list' ? previous : null;
        const marker = expectedBulletMarker(
            list,
            previousList,
            previousList === null ? null : (expected.get(previousList) ?? null),
            source,
            prefs.bullet,
        );
        expected.set(list, marker);
        for (const item of list.children) {
            const from = item.position?.start.offset;
            if (from === undefined || source[from] === marker || unorderedMarkerAt(list, source) === null) continue;
            if (source[from] === '-' || source[from] === '*' || source[from] === '+') {
                edits.push({ from, to: from + 1, text: marker });
            }
        }
    });
    visit(tree, (node, _index, parent) => {
        if (node.type !== 'emphasis' && node.type !== 'strong') return;
        const ranges = inlineMarkerRanges(node);
        if (ranges === null) return;
        const marker =
            node.type === 'strong'
                ? '**'
                : expectedEmphasisMarker(node, source, prefs.emphasis, parent?.type === 'strong' ? parent : null);
        for (const range of [ranges.open, ranges.close]) {
            if (source.slice(range.from, range.to) !== marker) {
                edits.push({ from: range.from, to: range.to, text: marker });
            }
        }
    });
    return edits.sort((a, b) => a.from - b.from || a.to - b.to);
}
