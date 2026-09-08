import type {
  EditorPosition,
  EditorRange,
  EditorSelection,
} from '../../ui/components/CodeEditor';
import type {
  DocumentCommandAPI,
  DocumentCommandResult,
} from '../hooks/useDocumentCommands';
import type { ActionId } from '../actions/actionRegistry';

export type FormatActionId =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inline-code'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'numbered-list'
  | 'task-list'
  | 'quote'
  | 'link'
  | 'table';

export const formatActionIds: Readonly<
  Partial<Record<ActionId, FormatActionId>>
> = Object.freeze({
  bold: 'bold',
  italic: 'italic',
  strike: 'strike',
  'inline-code': 'inline-code',
  'heading-1': 'heading-1',
  'heading-2': 'heading-2',
  'heading-3': 'heading-3',
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

export interface FormatRequest {
  actionId: FormatActionId;
  source: string;
  selection: EditorSelection;
  markers: MarkdownMarkerPreferences;
}

export interface FormatEdit {
  range: EditorRange;
  text: string;
  selection?: EditorSelection;
}

export function applyFormatEdit(
  commands: DocumentCommandAPI,
  request: FormatRequest,
): DocumentCommandResult<FormatEdit> {
  const content = commands.getContent();
  if (content.status !== 'available') return content;
  const selection = commands.getSelection();
  if (selection.status !== 'available' || selection.value === null) {
    return selection.status === 'available'
      ? { status: 'unavailable' }
      : selection;
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
  return result.status === 'available'
    ? { status: 'available', value: edit }
    : result;
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

function rangeForOffsets(
  source: string,
  start: number,
  end: number,
): EditorRange {
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

function pairFor(
  actionId: FormatActionId,
  emphasisMarker: '_' | '*',
): string | null {
  switch (actionId) {
    case 'bold':
      return '**';
    case 'italic':
      return emphasisMarker;
    case 'strike':
      return '~~';
    case 'inline-code':
      return '`';
    default:
      return null;
  }
}

function pairEdit(request: FormatRequest, marker: string): FormatEdit {
  const { start, end, text } = selectedText(request);
  const source = request.source;
  if (start === end) {
    const isEmptyPair =
      source.substring(start - marker.length, start) === marker &&
      source.substring(start, start + marker.length) === marker;
    if (isEmptyPair) {
      const caret = positionAt(source, start - marker.length);
      return editForOffsets(
        source,
        start - marker.length,
        start + marker.length,
        '',
        {
          start: caret,
          end: caret,
        },
      );
    }

    const lineStart =
      (start === 0 ? -1 : source.lastIndexOf('\n', start - 1)) + 1;
    const lineEnd = source.indexOf('\n', start);
    const beforeCaret = source.substring(lineStart, start);
    const opening = beforeCaret.lastIndexOf(marker);
    const closing = source.indexOf(marker, start);
    const closingInLine =
      closing !== -1 && (lineEnd === -1 || closing < lineEnd);
    if (opening !== -1 && closingInLine) {
      const spanStart = lineStart + opening;
      const contentStart = spanStart + marker.length;
      const content = source.substring(contentStart, closing);
      if (content.trim().length > 0) {
        const caret = positionAt(source, spanStart);
        return editForOffsets(
          source,
          spanStart,
          closing + marker.length,
          content,
          {
            start: caret,
            end: caret,
          },
        );
      }
    }

    const caret = positionAt(source, start + marker.length);
    return editForOffsets(source, start, end, marker + marker, {
      start: caret,
      end: caret,
    });
  }

  const hasOutsideMarkers =
    source.substring(start - marker.length, start) === marker &&
    source.substring(end, end + marker.length) === marker;
  if (hasOutsideMarkers) {
    return editForOffsets(
      source,
      start - marker.length,
      end + marker.length,
      text,
    );
  }

  const inlineText = text
    .split('\n')
    .map((line) => formatInlineLine(line, marker))
    .join('\n');
  const firstLine = inlineText.split('\n', 1)[0] ?? '';
  const lastLine = inlineText.slice(inlineText.lastIndexOf('\n') + 1);
  const firstContent = inlineContentBounds(firstLine, marker);
  const lastContent = inlineContentBounds(lastLine, marker);
  const nextSelection = {
    start: positionAt(source, start + firstContent.start),
    end: positionAt(
      source,
      start + inlineText.length - lastLine.length + lastContent.end,
    ),
  };
  return editForOffsets(source, start, end, inlineText, nextSelection);
}

function inlinePrefix(line: string): string {
  return (
    line.match(
      /^(\s*(?:>\s*)?(?:(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?)?)/,
    )?.[1] ?? ''
  );
}

function formatInlineLine(line: string, marker: string): string {
  const prefix = inlinePrefix(line);
  const remainder = line.slice(prefix.length);
  const leading = remainder.match(/^\s*/)?.[0] ?? '';
  const trailing = remainder.match(/\s*$/)?.[0] ?? '';
  const content = remainder.slice(
    leading.length,
    remainder.length - trailing.length,
  );
  return content.length === 0
    ? line
    : prefix + leading + marker + content + marker + trailing;
}

function inlineContentBounds(
  line: string,
  marker: string,
): {
  start: number;
  end: number;
} {
  const prefix = inlinePrefix(line);
  const remainder = line.slice(prefix.length);
  const leading = remainder.match(/^\s*/)?.[0] ?? '';
  const trailing = remainder.match(/\s*$/)?.[0] ?? '';
  return {
    start: prefix.length + leading.length + marker.length,
    end: line.length - trailing.length - marker.length,
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
  const startLine = Math.min(
    selection.start.lineNumber,
    selection.end.lineNumber,
  );
  const endLine = Math.max(
    selection.start.lineNumber,
    selection.end.lineNumber,
  );
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

function listEdit(request: FormatRequest, kind: ListKind): FormatEdit {
  const bounds = lineBounds(request.source, request.selection);
  const marker = request.markers.bulletMarker;
  const text = bounds.lines
    .map((line) => {
      const quoted = parseQuoteLine(line);
      const parsed = parseListLine(quoted.content);
      const prefix = quoted.indent + quoted.quote;
      if (parsed.kind === kind) return prefix + parsed.indent + parsed.content;
      const content = removeHeading(parsed.content);
      if (kind === 'numbered-list')
        return prefix + parsed.indent + '1. ' + content;
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
  const candidate =
    parsed.kind === null ? quoted.content : parsed.indent + parsed.content;
  const match = candidate.match(/^(\s*)(#{1,6})(?:\s+|$)(.*)$/);
  if (match === null) {
    const indent = candidate.match(/^\s*/)?.[0] ?? '';
    return (
      quoted.indent +
      quoted.quote +
      indent +
      '#'.repeat(level) +
      ' ' +
      candidate.slice(indent.length)
    );
  }
  if (match[2]?.length === level) {
    return quoted.indent + quoted.quote + (match[1] ?? '') + (match[3] ?? '');
  }
  return (
    quoted.indent +
    quoted.quote +
    (match[1] ?? '') +
    '#'.repeat(level) +
    ' ' +
    (match[3] ?? '')
  );
}

function quoteEdit(request: FormatRequest): FormatEdit {
  const bounds = lineBounds(request.source, request.selection);
  const text = bounds.lines
    .map((line) => {
      const quoted = parseQuoteLine(line);
      return quoted.quote.length > 0
        ? quoted.indent + quoted.content
        : quoted.indent + '> ' + quoted.content;
    })
    .join('\n');
  return editForOffsets(request.source, bounds.start, bounds.end, text);
}

function linkEdit(request: FormatRequest): FormatEdit {
  const { start, end, text } = selectedText(request);
  const source = request.source;
  const lineStart =
    (start === 0 ? -1 : source.lastIndexOf('\n', start - 1)) + 1;
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
      return editForOffsets(
        source,
        lineStart + matchStart,
        lineStart + matchEnd,
        match[0],
        {
          start: positionAt(source, urlStart),
          end: positionAt(source, urlEnd),
        },
      );
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
  const lineStart =
    (start === 0 ? -1 : source.lastIndexOf('\n', start - 1)) + 1;
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
  const pair = pairFor(request.actionId, request.markers.emphasisMarker);
  if (pair !== null) return pairEdit(request, pair);

  switch (request.actionId) {
    case 'heading-1':
      return headingEdit(request, 1);
    case 'heading-2':
      return headingEdit(request, 2);
    case 'heading-3':
      return headingEdit(request, 3);
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
