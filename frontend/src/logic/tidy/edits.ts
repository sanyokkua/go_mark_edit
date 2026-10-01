import { eastAsianWidth } from 'get-east-asian-width';
import type { Heading, Root, Table } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { SKIP, visit } from 'unist-util-visit';

import { parseFull } from './parser';
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

function displayWidth(value: string): number {
    let width = 0;
    for (const character of value) width += eastAsianWidth(character.codePointAt(0) ?? 0);
    return width;
}

function columnAfter(source: string, start: number): number {
    let column = start;
    for (const character of source) column += character === '\t' ? 4 - (column % 4) : 1;
    return column;
}

function continuationPrefix(prefix: string): string | null {
    let remaining = prefix;
    let continuation = '';
    let column = 0;
    while (remaining !== '') {
        const whitespace = /^[ \t]+/u.exec(remaining);
        if (whitespace !== null) {
            continuation += whitespace[0];
            column = columnAfter(whitespace[0], column);
            remaining = remaining.slice(whitespace[0].length);
            continue;
        }
        if (remaining.startsWith('>')) {
            continuation += '>';
            column++;
            remaining = remaining.slice(1);
            continue;
        }
        const listMarker = /^(?:[-+*]|\d{1,9}[.)])[ \t]+/u.exec(remaining);
        if (listMarker === null) return null;
        const afterMarker = columnAfter(listMarker[0], column);
        continuation += ' '.repeat(afterMarker - column);
        column = afterMarker;
        remaining = remaining.slice(listMarker[0].length);
    }
    return continuation;
}

/** Fold existing marker and line edits into a larger source replacement. */
function replaceRegion(
    source: string,
    edits: TextEdit[],
    from: number,
    to: number,
    replacement: (current: string) => string | null,
): void {
    if (edits.some((edit) => edit.from < to && edit.to > from && (edit.from < from || edit.to > to))) return;
    const inside = edits
        .filter((edit) => edit.from >= from && edit.to <= to && edit.from < to)
        .sort((left, right) => left.from - right.from || left.to - right.to);
    const current = applyEdits(
        source.slice(from, to),
        inside.map((edit) => ({ from: edit.from - from, to: edit.to - from, text: edit.text })),
    );
    const next = replacement(current);
    if (next === null || next === current) return;
    for (let index = edits.length - 1; index >= 0; index--) {
        if (inside.includes(edits[index])) edits.splice(index, 1);
    }
    edits.push({ from, to, text: next });
}

export function headingReplacement(
    source: string,
    heading: Heading,
    current: string,
    preferred: 'atx' | 'setext',
): string | null {
    const from = heading.position?.start.offset;
    const to = heading.position?.end.offset;
    if (from === undefined || to === undefined) return null;
    const lineStart = source.lastIndexOf('\n', from - 1) + 1;
    const prefix = source.slice(lineStart, from);
    const continuation = continuationPrefix(prefix);
    if (continuation === null) return null;
    const lines = current.split('\n');
    const underline =
        lines.length === 2 && lines[1].startsWith(continuation)
            ? /^(=+|-+)[ \t]*$/u.exec(lines[1].slice(continuation.length))
            : null;
    if (underline !== null) {
        if (preferred === 'setext') return null;
        const depth = underline[1][0] === '=' ? 1 : 2;
        return depth === heading.depth ? `${'#'.repeat(depth)} ${lines[0]}` : null;
    }
    if (preferred !== 'setext' || heading.depth > 2 || current.includes('\n')) return null;
    const atx = /^(#{1,6})(?:[ \t]+(.*))?$/u.exec(current);
    if (atx === null || atx[1].length !== heading.depth) return null;
    const content = (atx[2] ?? '').replace(/[ \t]+#+[ \t]*$/u, '').trimEnd();
    if (content === '') return null;
    const underlineText = (heading.depth === 1 ? '=' : '-').repeat(Math.max(3, displayWidth(toString(heading))));
    const candidate = `${content}\n${continuation}${underlineText}`;
    const parsed = parseFull(`${prefix}${candidate}`);
    let found = 0;
    let sameDepth = false;
    visit(parsed, 'heading', (node) => {
        found++;
        if (node.depth === heading.depth) sameDepth = true;
    });
    if (parsed.children.length !== 1 || found !== 1 || !sameDepth) return null;
    return candidate;
}

function formatHeading(source: string, heading: Heading, prefs: TidyPreferences, edits: TextEdit[]): void {
    const from = heading.position?.start.offset;
    const to = heading.position?.end.offset;
    if (from === undefined || to === undefined) return;
    replaceRegion(source, edits, from, to, (current) => headingReplacement(source, heading, current, prefs.heading));
}

interface TableLine {
    cells: string[];
    leadingPipe: boolean;
    trailingPipe: boolean;
    ambiguous: boolean;
}

function splitTableLine(line: string): TableLine {
    const segments: string[] = [];
    let previous = 0;
    let backticks = 0;
    let ambiguous = false;
    for (let index = 0; index < line.length; index++) {
        if (line[index] === '`') {
            let run = 1;
            while (line[index + run] === '`') run++;
            if (backticks === 0) backticks = run;
            else if (backticks === run) backticks = 0;
            index += run - 1;
            continue;
        }
        if (line[index] !== '|') continue;
        let escapes = 0;
        for (let before = index - 1; before >= 0 && line[before] === '\\'; before--) escapes++;
        if (escapes % 2 === 1) continue;
        if (backticks !== 0) ambiguous = true;
        segments.push(line.slice(previous, index));
        previous = index + 1;
    }
    segments.push(line.slice(previous));
    const leadingPipe = line.startsWith('|');
    const trailingPipe = line.includes('|') && /^[ \t]*$/u.test(segments.at(-1) ?? '');
    return {
        cells: segments.slice(leadingPipe ? 1 : 0, trailingPipe ? -1 : undefined).map((cell) => cell.trim()),
        leadingPipe,
        trailingPipe,
        ambiguous,
    };
}

function formatTable(source: string, table: Table, edits: TextEdit[]): void {
    const header = table.children[0];
    const headerFrom = header?.position?.start.offset;
    const headerTo = header?.position?.end.offset;
    const headerColumn = header?.position?.start.column;
    if (headerFrom === undefined || headerTo === undefined || headerColumn === undefined) return;
    const separatorLineStart = source.indexOf('\n', headerTo);
    if (separatorLineStart < 0) return;
    const separatorFrom = separatorLineStart + 1 + headerColumn - 1;
    const separatorNewline = source.indexOf('\n', separatorFrom);
    const separatorTo = separatorNewline < 0 ? source.length : separatorNewline;
    const ranges = [
        { from: headerFrom, to: headerTo },
        { from: separatorFrom, to: separatorTo },
    ];
    for (const row of table.children.slice(1)) {
        const from = row.position?.start.offset;
        const to = row.position?.end.offset;
        if (from === undefined || to === undefined) return;
        ranges.push({ from, to });
    }
    const current = ranges.map((range) => {
        const inside = edits
            .filter((edit) => edit.from >= range.from && edit.to <= range.to && edit.from < range.to)
            .sort((left, right) => left.from - right.from || left.to - right.to);
        return applyEdits(
            source.slice(range.from, range.to),
            inside.map((edit) => ({ from: edit.from - range.from, to: edit.to - range.from, text: edit.text })),
        );
    });
    const rows = current.map(splitTableLine);
    const columns = table.children[0]?.children.length ?? 0;
    if (
        columns === 0 ||
        rows.some((row) => row.ambiguous) ||
        rows[0].cells.length !== columns ||
        rows[1].cells.length !== columns ||
        rows.slice(2).some((row, index) => row.cells.length !== table.children[index + 1].children.length) ||
        rows[1].cells.some((cell) => !/^:?-+:?$/u.test(cell))
    )
        return;
    const widths = Array.from({ length: columns }, (_, column) =>
        Math.max(3, ...rows.filter((_, index) => index !== 1).map((row) => displayWidth(row.cells[column] ?? ''))),
    );
    const formatted = rows.map((row, index) => {
        const cells = row.cells.map((cell, column) => {
            if (index === 1) {
                const left = cell.startsWith(':');
                const right = cell.endsWith(':');
                return `${left ? ':' : ''}${'-'.repeat(widths[column] - Number(left) - Number(right))}${right ? ':' : ''}`;
            }
            const pad = column < row.cells.length - 1 || row.trailingPipe ? widths[column] - displayWidth(cell) : 0;
            return cell + ' '.repeat(pad);
        });
        return `${row.leadingPipe ? '| ' : ''}${cells.join(' | ')}${row.trailingPipe ? ' |' : ''}`;
    });
    for (let index = 0; index < ranges.length; index++) {
        replaceRegion(source, edits, ranges[index].from, ranges[index].to, () => formatted[index]);
    }
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
        // Table formatting may change surrounding whitespace only, including nested markers.
        if (node.type === 'table') return SKIP;
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
    visit(tree, 'heading', (heading) => formatHeading(source, heading, prefs, edits));
    visit(tree, 'table', (table) => formatTable(source, table, edits));
    return edits.sort((a, b) => a.from - b.from || a.to - b.to);
}
