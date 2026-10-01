import type { Root } from 'mdast';

import type { TextEdit } from './protocol';
import { hardBreakRanges, protectedRanges } from './rules';

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
