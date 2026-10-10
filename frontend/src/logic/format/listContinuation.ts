import type { EditorPosition, EditorSelection, EnterEdit } from '../../ui/components/CodeEditor';
import { parseListLine, parseQuoteLine } from './formatting';

const MARKER = /^(?:([-+*])|(\d+)([.)]))(?:\s|$)/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/** Whether the lines above the caret leave a fenced code block open (the fence rule of `logic/tidy/chunking.ts`). */
function insideFence(linesAbove: readonly string[]): boolean {
    let fence: { marker: string; length: number } | null = null;
    for (const line of linesAbove) {
        if (fence === null) {
            const open = FENCE_OPEN.exec(line);
            if (open !== null) fence = { marker: open[1][0], length: open[1].length };
        } else if (new RegExp(`^ {0,3}${fence.marker}{${fence.length},}[ \\t]*$`, 'u').test(line)) {
            fence = null;
        }
    }
    return fence !== null;
}

/**
 * The edit Enter makes at the end of a Markdown list item, or `null` when Enter should insert a plain line.
 *
 * `lines` are the document lines up to and including the caret line, so the cost is bounded by the caret's line
 * number. A non-empty item continues with the next marker; an empty item loses its marker and indentation.
 */
export function continueList(lines: readonly string[], position: EditorPosition): EnterEdit | null {
    const line = lines[position.lineNumber - 1];
    if (line === undefined || position.column !== line.length + 1) return null;

    const quoted = parseQuoteLine(line);
    const item = parseListLine(quoted.content);
    const marker = MARKER.exec(quoted.content.slice(item.indent.length));
    if (item.kind === null || marker === null) return null;
    if (insideFence(lines.slice(0, position.lineNumber - 1))) return null;

    const quotePrefix = quoted.quote === '' ? '' : quoted.indent + quoted.quote;
    const lineRange = {
        start: { lineNumber: position.lineNumber, column: 1 },
        end: { lineNumber: position.lineNumber, column: line.length + 1 },
    };

    if (item.content.trim() === '') {
        return { range: lineRange, text: quotePrefix, selection: caretAt(position.lineNumber, quotePrefix.length + 1) };
    }

    const outerIndent = quoted.quote === '' ? '' : quoted.indent + quoted.quote;
    const innerIndent = quoted.quote === '' ? quoted.indent + item.indent : item.indent;
    const body =
        item.kind === 'numbered-list'
            ? `${Number(marker[2]) + 1}${marker[3]} `
            : item.kind === 'task-list'
              ? `${marker[1]} [ ] `
              : `${marker[1]} `;
    const text = `\n${outerIndent}${innerIndent}${body}`;
    return {
        range: { start: position, end: position },
        text,
        selection: caretAt(position.lineNumber + 1, text.length),
    };
}

function caretAt(lineNumber: number, column: number): EditorSelection {
    const at = { lineNumber, column };
    return { start: at, end: at };
}
