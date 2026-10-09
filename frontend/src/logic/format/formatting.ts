import type { EditorPosition, EditorRange, EditorSelection } from '../../ui/components/CodeEditor';
import type { DocumentCommandAPI, DocumentCommandResult } from '../hooks/useDocumentCommands';
import type { ActionId } from '../actions/actionRegistry';

export type FormatActionId =
    | 'bold'
    | 'italic'
    | 'bold-italic'
    | 'strike'
    | 'inline-code'
    | 'heading-1'
    | 'heading-2'
    | 'heading-3'
    | 'heading-4'
    | 'heading-5'
    | 'heading-6'
    | 'bullet-list'
    | 'numbered-list'
    | 'task-list'
    | 'quote'
    | 'link'
    | 'table';

export const formatActionIds: Readonly<Partial<Record<ActionId, FormatActionId>>> = Object.freeze({
    bold: 'bold',
    italic: 'italic',
    'bold-italic': 'bold-italic',
    strike: 'strike',
    'inline-code': 'inline-code',
    'heading-1': 'heading-1',
    'heading-2': 'heading-2',
    'heading-3': 'heading-3',
    'heading-4': 'heading-4',
    'heading-5': 'heading-5',
    'heading-6': 'heading-6',
    'bullet-list': 'bullet-list',
    'numbered-list': 'numbered-list',
    'task-list': 'task-list',
    quote: 'quote',
    link: 'link',
    table: 'table',
});

export interface MarkdownMarkerPreferences {
    bulletMarker: '-' | '*' | '+';
    emphasisMarker: '_' | '*';
    headingStyle: 'atx' | 'setext';
}

export function formatMarkers(settings: {
    bulletMarker: string;
    emphasisMarker: string;
    headingStyle: string;
}): MarkdownMarkerPreferences {
    return {
        bulletMarker: settings.bulletMarker === '*' || settings.bulletMarker === '+' ? settings.bulletMarker : '-',
        emphasisMarker: settings.emphasisMarker === '_' ? '_' : '*',
        headingStyle: settings.headingStyle === 'setext' ? 'setext' : 'atx',
    };
}

export interface FormatRequest {
    actionId: FormatActionId;
    source: string;
    selection: EditorSelection;
    markers?: MarkdownMarkerPreferences;
}

export interface FormatEdit {
    range: EditorRange;
    text: string;
    selection?: EditorSelection;
}

export interface FormatRunnerRequest {
    actionId: ActionId;
    commands: DocumentCommandAPI | null;
    markers?: MarkdownMarkerPreferences;
    selection?: EditorSelection | null;
}

const emptySelection: EditorSelection = {
    start: { lineNumber: 1, column: 1 },
    end: { lineNumber: 1, column: 1 },
};

/**
 * The one entry point for a formatting command from a UI surface.
 *
 * Toolbar buttons and context-menu items may capture different selections, but
 * they must not each resolve an action id or build a formatter request. The
 * runner owns that translation and leaves the document-command session as the
 * only mutation boundary.
 */
export function runFormatAction(request: FormatRunnerRequest): DocumentCommandResult<FormatEdit> {
    const formatActionId = formatActionIds[request.actionId];
    if (formatActionId === undefined || request.commands === null) {
        return { status: 'unavailable' };
    }
    const commands =
        request.selection === undefined
            ? request.commands
            : {
                  ...request.commands,
                  getSelection: (): DocumentCommandResult<EditorSelection | null> => ({
                      status: 'available',
                      value: request.selection ?? null,
                  }),
              };
    return applyFormatEdit(commands, {
        actionId: formatActionId,
        markers: request.markers,
        selection: request.selection ?? emptySelection,
        source: '',
    });
}

export function applyFormatEdit(
    commands: DocumentCommandAPI,
    request: FormatRequest,
): DocumentCommandResult<FormatEdit> {
    if (
        request.markers === undefined &&
        (request.actionId === 'italic' ||
            request.actionId === 'bold-italic' ||
            request.actionId === 'bullet-list' ||
            request.actionId === 'task-list')
    ) {
        return { status: 'unavailable' };
    }
    const content = commands.getContent();
    if (content.status !== 'available') return content;
    const selection = commands.getSelection();
    if (selection.status !== 'available' || selection.value === null) {
        return selection.status === 'available' ? { status: 'unavailable' } : selection;
    }
    const edit = formatMarkdown({
        ...request,
        source: content.value,
        selection: selection.value,
    });
    const result =
        edit.selection === undefined
            ? commands.replaceRange(edit.range, edit.text)
            : commands.replaceRange(edit.range, edit.text, edit.selection);
    return result.status === 'available' ? { status: 'available', value: edit } : result;
}

function offsetAt(source: string, position: EditorPosition): number {
    const start = lineStartOffset(source, position.lineNumber);
    const end = lineEndOffset(source, position.lineNumber);
    return Math.min(start + position.column - 1, end);
}

function positionAt(source: string, offset: number): EditorPosition {
    const safeOffset = Math.max(0, Math.min(source.length, offset));
    let lineNumber = 1;
    let lineStart = 0;
    let newline = source.indexOf('\n');
    while (newline !== -1 && newline < safeOffset) {
        lineNumber += 1;
        lineStart = newline + 1;
        newline = source.indexOf('\n', newline + 1);
    }
    return {
        lineNumber,
        column: safeOffset - lineStart + 1 + Math.max(0, offset - source.length),
    };
}

function lineStartOffset(source: string, lineNumber: number): number {
    let start = 0;
    for (let line = 1; line < lineNumber; line += 1) {
        const newline = source.indexOf('\n', start);
        if (newline === -1) return source.length;
        start = newline + 1;
    }
    return start;
}

function lineEndOffset(source: string, lineNumber: number): number {
    const start = lineStartOffset(source, lineNumber);
    const newline = source.indexOf('\n', start);
    return newline === -1 ? source.length : newline;
}

function rangeForOffsets(source: string, start: number, end: number): EditorRange {
    return { start: positionAt(source, start), end: positionAt(source, end) };
}

function editForOffsets(
    source: string,
    start: number,
    end: number,
    text: string,
    selection?: EditorSelection,
): FormatEdit {
    return { range: rangeForOffsets(source, start, end), text, selection };
}

function selectedText(request: FormatRequest): {
    start: number;
    end: number;
    text: string;
} {
    const start = offsetAt(request.source, request.selection.start);
    const end = offsetAt(request.source, request.selection.end);
    return {
        start: Math.min(start, end),
        end: Math.max(start, end),
        text: request.source.substring(Math.min(start, end), Math.max(start, end)),
    };
}

interface InlinePair {
    close: string;
    open: string;
}

function symmetricPair(marker: string): InlinePair {
    return { open: marker, close: marker };
}

function pairFor(actionId: FormatActionId, emphasisMarker?: '_' | '*'): InlinePair | null {
    switch (actionId) {
        case 'bold':
            return symmetricPair('**');
        case 'italic':
            return emphasisMarker === undefined ? null : symmetricPair(emphasisMarker);
        case 'bold-italic':
            return emphasisMarker === undefined ? null : { open: '**' + emphasisMarker, close: emphasisMarker + '**' };
        case 'strike':
            return symmetricPair('~~');
        case 'inline-code':
            return symmetricPair('`');
        default:
            return null;
    }
}

type InlineStyle = 'bold' | 'italic' | 'strike' | 'inline-code';
type RequestedInlineStyle = InlineStyle | 'bold-italic';

interface InlineWrapper {
    marker: string;
    style: InlineStyle;
}

interface InlineWrapperStack {
    baseEnd: number;
    baseStart: number;
    baseText: string;
    end: number;
    start: number;
    wrappers: InlineWrapper[];
}

const MAX_INLINE_WRAPPER_DEPTH = 8;
const INLINE_WRAPPER_CHARACTERS = new Set(['*', '_', '~', '`']);

function inlineStyleFor(actionId: FormatActionId): RequestedInlineStyle | null {
    switch (actionId) {
        case 'bold':
            return 'bold';
        case 'italic':
            return 'italic';
        case 'bold-italic':
            return 'bold-italic';
        case 'strike':
            return 'strike';
        case 'inline-code':
            return 'inline-code';
        default:
            return null;
    }
}

function isInlineBaseCharacter(character: string): boolean {
    return character.length > 0 && !/\s/.test(character) && !INLINE_WRAPPER_CHARACTERS.has(character);
}

function lineBoundsAtOffset(source: string, offset: number): { end: number; start: number } {
    const start = (offset === 0 ? -1 : source.lastIndexOf('\n', offset - 1)) + 1;
    const nextNewline = source.indexOf('\n', offset);
    return { end: nextNewline === -1 ? source.length : nextNewline, start };
}

function baseTokenBounds(source: string, start: number, end: number): { end: number; start: number } | null {
    const line = lineBoundsAtOffset(source, start);
    let probe = -1;

    if (start === end) {
        if (start < line.end && isInlineBaseCharacter(source.charAt(start))) {
            probe = start;
        } else if (start > line.start && isInlineBaseCharacter(source.charAt(start - 1))) {
            probe = start - 1;
        }
    } else {
        for (let offset = start; offset < end; offset += 1) {
            if (isInlineBaseCharacter(source.charAt(offset))) {
                probe = offset;
                break;
            }
        }
    }

    if (probe === -1) return null;

    let tokenStart = probe;
    while (tokenStart > line.start && isInlineBaseCharacter(source.charAt(tokenStart - 1))) {
        tokenStart -= 1;
    }
    let tokenEnd = probe + 1;
    while (tokenEnd < line.end && isInlineBaseCharacter(source.charAt(tokenEnd))) {
        tokenEnd += 1;
    }

    return { end: tokenEnd, start: tokenStart };
}

function inlineCodeMarkerAt(source: string, left: number, right: number): string | null {
    let leftLength = 0;
    while (source.charAt(left - leftLength - 1) === '`') leftLength += 1;
    let rightLength = 0;
    while (source.charAt(right + rightLength) === '`') rightLength += 1;
    return leftLength > 0 && leftLength === rightLength ? '`'.repeat(leftLength) : null;
}

function wrapperAt(source: string, left: number, right: number): InlineWrapper | null {
    const codeMarker = inlineCodeMarkerAt(source, left, right);
    if (codeMarker !== null) return { marker: codeMarker, style: 'inline-code' };

    const candidates: readonly InlineWrapper[] = [
        { marker: '**', style: 'bold' },
        { marker: '__', style: 'bold' },
        { marker: '~~', style: 'strike' },
        { marker: '*', style: 'italic' },
        { marker: '_', style: 'italic' },
    ];
    return (
        candidates.find(
            (candidate) =>
                source.substring(left - candidate.marker.length, left) === candidate.marker &&
                source.substring(right, right + candidate.marker.length) === candidate.marker,
        ) ?? null
    );
}

function resolveInlineWrapperStack(source: string, start: number, end: number): InlineWrapperStack | null {
    const base = baseTokenBounds(source, start, end);
    if (base === null) return null;

    let stackStart = base.start;
    let stackEnd = base.end;
    const innerToOuter: InlineWrapper[] = [];
    while (innerToOuter.length < MAX_INLINE_WRAPPER_DEPTH) {
        const wrapper = wrapperAt(source, stackStart, stackEnd);
        if (wrapper === null) break;
        stackStart -= wrapper.marker.length;
        stackEnd += wrapper.marker.length;
        innerToOuter.push(wrapper);
    }

    const wholeBase = start === base.start && end === base.end;
    const wholeStack = start === stackStart && end === stackEnd;
    const collapsedOnBase = start === end && start >= base.start && start <= base.end;
    if (!collapsedOnBase && !wholeBase && !wholeStack) return null;

    return {
        baseEnd: base.end,
        baseStart: base.start,
        baseText: source.substring(base.start, base.end),
        end: stackEnd,
        start: stackStart,
        wrappers: innerToOuter.reverse(),
    };
}

function renderInlineWrapperStack(wrappers: readonly InlineWrapper[], baseText: string): string {
    return wrappers.reduceRight((text, wrapper) => wrapper.marker + text + wrapper.marker, baseText);
}

function wrapperPrefixLength(wrappers: readonly InlineWrapper[]): number {
    return wrappers.reduce((length, wrapper) => length + wrapper.marker.length, 0);
}

function boldItalicWrappers(stack: InlineWrapperStack, emphasisMarker: string): InlineWrapper[] {
    const hasBold = stack.wrappers.some((wrapper) => wrapper.style === 'bold');
    const hasItalic = stack.wrappers.some((wrapper) => wrapper.style === 'italic');
    if (hasBold && hasItalic) {
        return stack.wrappers.filter((wrapper) => wrapper.style !== 'bold' && wrapper.style !== 'italic');
    }
    const wrappers = [...stack.wrappers];
    if (!hasBold) wrappers.unshift({ marker: '**', style: 'bold' });
    if (!hasItalic) {
        wrappers.splice(wrappers.findIndex((wrapper) => wrapper.style === 'bold') + 1, 0, {
            marker: emphasisMarker,
            style: 'italic',
        });
    }
    return wrappers;
}

function singleStyleWrappers(
    stack: InlineWrapperStack,
    style: InlineStyle,
    marker: string,
    collapsed: boolean,
): InlineWrapper[] {
    const existingStyleIndex = stack.wrappers.findIndex((wrapper) => wrapper.style === style);
    if (existingStyleIndex !== -1) return stack.wrappers.filter((_, index) => index !== existingStyleIndex);
    return collapsed && stack.wrappers.length === 1
        ? stack.wrappers.map(() => ({ marker, style }))
        : [{ marker, style }, ...stack.wrappers];
}

function inlineStackEdit(
    source: string,
    stack: InlineWrapperStack,
    style: RequestedInlineStyle,
    marker: string,
    start: number,
    end: number,
): FormatEdit {
    const collapsed = start === end;
    const wrappers =
        style === 'bold-italic'
            ? boldItalicWrappers(stack, marker)
            : singleStyleWrappers(stack, style, marker, collapsed);
    const text = renderInlineWrapperStack(wrappers, stack.baseText);
    const prefixLength = wrapperPrefixLength(wrappers);
    const nextSelection = collapsed
        ? (() => {
              const caret = positionAt(source, stack.start + prefixLength + start - stack.baseStart);
              return { start: caret, end: caret };
          })()
        : {
              start: positionAt(source, stack.start + prefixLength),
              end: positionAt(source, stack.start + prefixLength + stack.baseText.length),
          };

    return editForOffsets(source, stack.start, stack.end, text, nextSelection);
}

function fallbackPairEdit(request: FormatRequest, pair: InlinePair): FormatEdit {
    const { start, end, text } = selectedText(request);
    const source = request.source;
    if (start === end) {
        const isEmptyPair =
            source.substring(start - pair.open.length, start) === pair.open &&
            source.substring(start, start + pair.close.length) === pair.close;
        if (isEmptyPair) {
            const caret = positionAt(source, start - pair.open.length);
            return editForOffsets(source, start - pair.open.length, start + pair.close.length, '', {
                start: caret,
                end: caret,
            });
        }

        const caret = positionAt(source, start + pair.open.length);
        return editForOffsets(source, start, end, pair.open + pair.close, {
            start: caret,
            end: caret,
        });
    }

    const hasOutsideMarkers =
        source.substring(start - pair.open.length, start) === pair.open &&
        source.substring(end, end + pair.close.length) === pair.close;
    if (hasOutsideMarkers) {
        return editForOffsets(source, start - pair.open.length, end + pair.close.length, text);
    }

    const inlineText = text
        .split('\n')
        .map((line) => formatInlineLine(line, pair))
        .join('\n');
    const firstLine = inlineText.split('\n', 1)[0] ?? '';
    const lastLine = inlineText.slice(inlineText.lastIndexOf('\n') + 1);
    const firstContent = inlineContentBounds(firstLine, pair);
    const lastContent = inlineContentBounds(lastLine, pair);
    const nextSelection = {
        start: positionAt(source, start + firstContent.start),
        end: positionAt(source, start + inlineText.length - lastLine.length + lastContent.end),
    };
    return editForOffsets(source, start, end, inlineText, nextSelection);
}

function pairEdit(request: FormatRequest, pair: InlinePair): FormatEdit {
    const { start, end } = selectedText(request);
    const style = inlineStyleFor(request.actionId);
    const stack = style === null ? null : resolveInlineWrapperStack(request.source, start, end);
    // For bold italic the inner marker is the emphasis marker, which is also the close pair's first character.
    return stack === null || style === null
        ? fallbackPairEdit(request, pair)
        : inlineStackEdit(
              request.source,
              stack,
              style,
              style === 'bold-italic' ? pair.close.charAt(0) : pair.open,
              start,
              end,
          );
}

function inlinePrefix(line: string): string {
    return line.match(/^(\s*(?:>\s*)?(?:(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?)?)/)?.[1] ?? '';
}

function formatInlineLine(line: string, pair: InlinePair): string {
    const prefix = inlinePrefix(line);
    const remainder = line.slice(prefix.length);
    const leading = remainder.match(/^\s*/)?.[0] ?? '';
    const trailing = remainder.match(/\s*$/)?.[0] ?? '';
    const content = remainder.slice(leading.length, remainder.length - trailing.length);
    return content.length === 0 ? line : prefix + leading + pair.open + content + pair.close + trailing;
}

function inlineContentBounds(
    line: string,
    pair: InlinePair,
): {
    start: number;
    end: number;
} {
    const prefix = inlinePrefix(line);
    const remainder = line.slice(prefix.length);
    const leading = remainder.match(/^\s*/)?.[0] ?? '';
    const trailing = remainder.match(/\s*$/)?.[0] ?? '';
    return {
        start: prefix.length + leading.length + pair.open.length,
        end: line.length - trailing.length - pair.close.length,
    };
}

function lineBounds(
    source: string,
    selection: EditorSelection,
): {
    start: number;
    end: number;
    lines: string[];
} {
    const startLine = Math.min(selection.start.lineNumber, selection.end.lineNumber);
    const endLine = Math.max(selection.start.lineNumber, selection.end.lineNumber);
    const start = lineStartOffset(source, startLine);
    const end = lineEndOffset(source, endLine);
    const lines = source.substring(start, end).split('\n');
    return { start, end, lines };
}

type ListKind = 'bullet-list' | 'numbered-list' | 'task-list';

interface ParsedLine {
    indent: string;
    kind: ListKind | null;
    content: string;
}

interface QuotedLine {
    indent: string;
    quote: string;
    content: string;
}

function parseQuoteLine(line: string): QuotedLine {
    const match = line.match(/^(\s*)(>\s?)?(.*)$/);
    return {
        indent: match?.[1] ?? '',
        quote: match?.[2] ?? '',
        content: match?.[3] ?? '',
    };
}

function removeHeading(line: string): string {
    const match = line.match(/^(\s*)#{1,6}(?:\s+|$)(.*)$/);
    return match === null ? line : (match[1] ?? '') + (match[2] ?? '');
}

function parseListLine(line: string): ParsedLine {
    const indent = line.match(/^\s*/)?.[0] ?? '';
    const rest = line.slice(indent.length);
    const task = rest.match(/^[-+*]\s+\[[ xX]\]\s*(.*)$/);
    if (task !== null) {
        return { indent, kind: 'task-list', content: task[1] ?? '' };
    }
    const numbered = rest.match(/^\d+[.)]\s+(.*)$/);
    if (numbered !== null) {
        return { indent, kind: 'numbered-list', content: numbered[1] ?? '' };
    }
    const bullet = rest.match(/^[-+*]\s*(.*)$/);
    if (bullet !== null) {
        return { indent, kind: 'bullet-list', content: bullet[1] ?? '' };
    }
    return { indent, kind: null, content: rest };
}

const NUMBERED_MARKER = /^(\d+)([.)])\s/;

interface NumberCounter {
    delimiter: string;
    next: number;
}

function numberedEdit(request: FormatRequest): FormatEdit {
    const bounds = lineBounds(request.source, request.selection);
    const parsedLines = bounds.lines.map((line) => {
        const quoted = parseQuoteLine(line);
        return {
            line,
            parsed: parseListLine(quoted.content),
            prefix: quoted.indent + quoted.quote,
            quote: quoted.quote,
            depth: quoted.indent.length + parseListLine(quoted.content).indent.length,
        };
    });
    const nonBlank = parsedLines.filter(({ parsed }) => parsed.kind !== null || parsed.content.trim().length > 0);
    if (nonBlank.length > 0 && nonBlank.every(({ parsed }) => parsed.kind === 'numbered-list')) {
        const text = parsedLines
            .map(({ line, parsed, prefix }) => (parsed.kind === null ? line : prefix + parsed.indent + parsed.content))
            .join('\n');
        return editForOffsets(request.source, bounds.start, bounds.end, text);
    }

    const counters = new Map<string, Map<number, NumberCounter>>();
    const first = parsedLines[0];
    const startLine = Math.min(request.selection.start.lineNumber, request.selection.end.lineNumber);
    if (first !== undefined && startLine > 1) {
        const above = request.source.substring(
            lineStartOffset(request.source, startLine - 1),
            lineEndOffset(request.source, startLine - 1),
        );
        const quotedAbove = parseQuoteLine(above);
        const parsedAbove = parseListLine(quotedAbove.content);
        const continued =
            parsedAbove.kind === 'numbered-list' ? quotedAbove.content.trimStart().match(NUMBERED_MARKER) : null;
        if (
            continued !== null &&
            quotedAbove.indent + quotedAbove.quote === first.prefix &&
            parsedAbove.indent === first.parsed.indent
        ) {
            counters.set(
                first.quote,
                new Map([[first.depth, { delimiter: continued[2] ?? '.', next: Number(continued[1]) + 1 }]]),
            );
        }
    }

    const text = parsedLines
        .map(({ line, parsed, prefix, quote, depth }) => {
            const isBlank = parsed.kind === null && parsed.content.trim().length === 0;
            if (isBlank && parsedLines.length > 1) return line;
            const levels = counters.get(quote) ?? new Map<number, NumberCounter>();
            counters.set(quote, levels);
            for (const level of [...levels.keys()]) {
                if (level > depth) levels.delete(level);
            }
            const counter = levels.get(depth) ?? { delimiter: '.', next: 1 };
            levels.set(depth, { delimiter: counter.delimiter, next: counter.next + 1 });
            return prefix + parsed.indent + counter.next + counter.delimiter + ' ' + removeHeading(parsed.content);
        })
        .join('\n');
    return editForOffsets(request.source, bounds.start, bounds.end, text);
}

function listEdit(request: FormatRequest, kind: ListKind): FormatEdit {
    if (kind === 'numbered-list') return numberedEdit(request);
    const bounds = lineBounds(request.source, request.selection);
    const marker = request.markers?.bulletMarker;
    const text = bounds.lines
        .map((line) => {
            const quoted = parseQuoteLine(line);
            const parsed = parseListLine(quoted.content);
            const prefix = quoted.indent + quoted.quote;
            if (parsed.kind === kind) return prefix + parsed.indent + parsed.content;
            const content = removeHeading(parsed.content);
            if (marker === undefined) return line;
            if (kind === 'task-list') {
                return prefix + parsed.indent + marker + ' [ ] ' + content;
            }
            return prefix + parsed.indent + marker + ' ' + content;
        })
        .join('\n');
    return editForOffsets(request.source, bounds.start, bounds.end, text);
}

function headingEdit(request: FormatRequest, level: number): FormatEdit {
    const bounds = lineBounds(request.source, request.selection);
    const text = bounds.lines.map((line) => headingLine(line, level)).join('\n');
    return editForOffsets(request.source, bounds.start, bounds.end, text);
}

function headingLine(line: string, level: number): string {
    const quoted = parseQuoteLine(line);
    const parsed = parseListLine(quoted.content);
    const candidate = parsed.kind === null ? quoted.content : parsed.indent + parsed.content;
    const match = candidate.match(/^(\s*)(#{1,6})(?:\s+|$)(.*)$/);
    if (match === null) {
        const indent = candidate.match(/^\s*/)?.[0] ?? '';
        return quoted.indent + quoted.quote + indent + '#'.repeat(level) + ' ' + candidate.slice(indent.length);
    }
    if (match[2]?.length === level) {
        return quoted.indent + quoted.quote + (match[1] ?? '') + (match[3] ?? '');
    }
    return quoted.indent + quoted.quote + (match[1] ?? '') + '#'.repeat(level) + ' ' + (match[3] ?? '');
}

function quoteEdit(request: FormatRequest): FormatEdit {
    const bounds = lineBounds(request.source, request.selection);
    const text = bounds.lines
        .map((line) => {
            const quoted = parseQuoteLine(line);
            return quoted.quote.length > 0 ? quoted.indent + quoted.content : quoted.indent + '> ' + quoted.content;
        })
        .join('\n');
    return editForOffsets(request.source, bounds.start, bounds.end, text);
}

function linkEdit(request: FormatRequest): FormatEdit {
    const { start, end, text } = selectedText(request);
    const source = request.source;
    const lineStart = (start === 0 ? -1 : source.lastIndexOf('\n', start - 1)) + 1;
    const lineEndIndex = source.indexOf('\n', start);
    const lineEnd = lineEndIndex === -1 ? source.length : lineEndIndex;
    const line = source.substring(lineStart, lineEnd);
    const caretInLine = start - lineStart;
    const link = /\[([^\]]*)\]\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = link.exec(line)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;
        if (caretInLine >= matchStart && caretInLine <= matchEnd) {
            const urlStart = lineStart + matchStart + (match[1] ?? '').length + 3;
            const urlEnd = urlStart + (match[2] ?? '').length;
            return editForOffsets(source, lineStart + matchStart, lineStart + matchEnd, match[0], {
                start: positionAt(source, urlStart),
                end: positionAt(source, urlEnd),
            });
        }
    }
    if (start === end) {
        return editForOffsets(source, start, end, '[](url)', {
            start: positionAt(source, start + 3),
            end: positionAt(source, start + 6),
        });
    }
    return editForOffsets(source, start, end, `[${text}](url)`, {
        start: positionAt(source, start + 1),
        end: positionAt(source, start + text.length + 1),
    });
}

const tableSkeleton = '| Header 1 | Header 2 |\n| --- | --- |\n|  |  |';

function tableEdit(request: FormatRequest): FormatEdit {
    const { start } = selectedText(request);
    const source = request.source;
    const lineStart = (start === 0 ? -1 : source.lastIndexOf('\n', start - 1)) + 1;
    const nextNewline = source.indexOf('\n', start);
    const lineEnd = nextNewline === -1 ? source.length : nextNewline;
    const line = source.substring(lineStart, lineEnd);
    const atBlankLine = line.trim().length === 0;
    const insertion = atBlankLine ? lineStart : lineEnd;
    const prefix = atBlankLine ? '' : '\n\n';
    const insertionPosition = positionAt(source, insertion);
    const firstHeaderStart: EditorPosition =
        prefix.length === 0
            ? {
                  lineNumber: insertionPosition.lineNumber,
                  column: insertionPosition.column + 2,
              }
            : {
                  lineNumber: insertionPosition.lineNumber + 2,
                  column: 3,
              };
    return editForOffsets(source, insertion, insertion, prefix + tableSkeleton, {
        start: firstHeaderStart,
        end: {
            ...firstHeaderStart,
            column: firstHeaderStart.column + 'Header 1'.length,
        },
    });
}

export function formatMarkdown(request: FormatRequest): FormatEdit {
    const pair = pairFor(request.actionId, request.markers?.emphasisMarker);
    if (pair !== null) return pairEdit(request, pair);

    switch (request.actionId) {
        case 'heading-1':
            return headingEdit(request, 1);
        case 'heading-2':
            return headingEdit(request, 2);
        case 'heading-3':
            return headingEdit(request, 3);
        case 'heading-4':
            return headingEdit(request, 4);
        case 'heading-5':
            return headingEdit(request, 5);
        case 'heading-6':
            return headingEdit(request, 6);
        case 'bullet-list':
        case 'numbered-list':
        case 'task-list':
            return listEdit(request, request.actionId);
        case 'quote':
            return quoteEdit(request);
        case 'link':
            return linkEdit(request);
        case 'table':
            return tableEdit(request);
        default:
            return editForOffsets(request.source, 0, 0, '');
    }
}
