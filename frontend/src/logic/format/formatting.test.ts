import {
  applyFormatEdit,
  formatMarkdown,
  type FormatRequest,
} from './formatting';
import type { DocumentCommandAPI } from '../hooks/useDocumentCommands';

const selection = (
  startLine: number,
  startColumn: number,
  endLine = startLine,
  endColumn = startColumn,
): FormatRequest['selection'] => ({
  start: { lineNumber: startLine, column: startColumn },
  end: { lineNumber: endLine, column: endColumn },
});

const request = (
  actionId: FormatRequest['actionId'],
  source: string,
  range: FormatRequest['selection'],
  overrides: Partial<FormatRequest> = {},
): FormatRequest => ({
  actionId,
  source,
  selection: range,
  markers: {
    bulletMarker: '-',
    emphasisMarker: '_',
    headingStyle: 'atx',
  },
  ...overrides,
});

function sourceWithBoundedStringOperations(value: string): string {
  const source = new String(value) as unknown as {
    split: (...args: unknown[]) => string[];
    slice: (start?: number, end?: number) => string;
  };
  Object.defineProperty(source, 'split', {
    value: (): never => {
      throw new Error('formatter must not split the whole document');
    },
  });
  Object.defineProperty(source, 'slice', {
    value: (start = 0, end = value.length): string => {
      if (start === 0 && end - start > 256) {
        throw new Error('formatter must not copy a whole-document prefix');
      }
      return value.slice(start, end);
    },
  });
  return source as unknown as string;
}

it('T006 toggles marker pairs around a selection and restores the original bytes', () => {
  const added = formatMarkdown(
    request('bold', 'hello world', selection(1, 1, 1, 6)),
  );
  expect(added.text).toBe('**hello**');
  expect(added.range).toEqual({
    start: { lineNumber: 1, column: 1 },
    end: { lineNumber: 1, column: 6 },
  });

  const removed = formatMarkdown(
    request('bold', '**hello** world', selection(1, 3, 1, 8)),
  );
  expect(removed.text).toBe('hello');
  expect(removed.range.start.column).toBe(1);
  expect(removed.range.end.column).toBe(10);
});

it('T006 inserts an empty pair with the caret between markers', () => {
  const result = formatMarkdown(request('italic', 'one  two', selection(1, 5)));
  expect(result.text).toBe('__');
  expect(result.selection).toEqual({
    start: { lineNumber: 1, column: 6 },
    end: { lineNumber: 1, column: 6 },
  });
});

it('T064 cancels an empty pair and toggles an unambiguous span under the caret', () => {
  const cancelled = formatMarkdown(
    request('bold', 'before **** after', selection(1, 10)),
  );
  expect(cancelled.text).toBe('');
  expect(cancelled.range).toEqual({
    start: { lineNumber: 1, column: 8 },
    end: { lineNumber: 1, column: 12 },
  });
  expect(cancelled.selection).toEqual({
    start: { lineNumber: 1, column: 8 },
    end: { lineNumber: 1, column: 8 },
  });

  const existing = formatMarkdown(
    request('italic', 'before _word_ after', selection(1, 10)),
  );
  expect(existing.text).toBe('word');
  expect(existing.range).toEqual({
    start: { lineNumber: 1, column: 8 },
    end: { lineNumber: 1, column: 14 },
  });
  expect(existing.selection).toEqual({
    start: { lineNumber: 1, column: 8 },
    end: { lineNumber: 1, column: 8 },
  });

  expect(
    formatMarkdown(request('bold', 'ordinary', selection(1, 4))).text,
  ).toBe('****');
});

it('T064 keeps whitespace and list or quote prefixes outside inline markers', () => {
  const whitespace = formatMarkdown(
    request('bold', '  hello  ', selection(1, 1, 1, 10)),
  );
  expect(whitespace.text).toBe('  **hello**  ');

  const multiline = formatMarkdown(
    request('italic', '- first\n> second', selection(1, 1, 2, 9)),
  );
  expect(multiline.text).toBe('- _first_\n> _second_');
});

it('T065 replaces heading and list markers on complete lines without stale syntax', () => {
  expect(
    formatMarkdown(request('bullet-list', '# Title', selection(1, 1))).text,
  ).toBe('- Title');
  expect(
    formatMarkdown(request('heading-1', '- Title', selection(1, 3))).text,
  ).toBe('# Title');
  expect(
    formatMarkdown(
      request(
        'numbered-list',
        '  * first\n    - second',
        selection(1, 1, 2, 12),
      ),
    ).text,
  ).toBe('  1. first\n    1. second');
});

it('T065 keeps quote composition and indentation while toggling block markers', () => {
  expect(
    formatMarkdown(request('quote', '  # Title', selection(1, 1))).text,
  ).toBe('  > # Title');
  expect(
    formatMarkdown(request('quote', '  > - Title', selection(1, 1))).text,
  ).toBe('  - Title');
  expect(
    formatMarkdown(request('heading-2', '> - Title', selection(1, 4))).text,
  ).toBe('> ## Title');
});

it('T066 edits an existing link instead of nesting and selects the empty-link URL', () => {
  const empty = formatMarkdown(request('link', '', selection(1, 1)));
  expect(empty.text).toBe('[](url)');
  expect(empty.selection).toEqual({
    start: { lineNumber: 1, column: 4 },
    end: { lineNumber: 1, column: 7 },
  });

  const existing = formatMarkdown(
    request('link', 'See [docs](url) today', selection(1, 8)),
  );
  expect(existing.text).toBe('[docs](url)');
  expect(existing.range).toEqual({
    start: { lineNumber: 1, column: 5 },
    end: { lineNumber: 1, column: 16 },
  });
  expect(existing.selection).toEqual({
    start: { lineNumber: 1, column: 12 },
    end: { lineNumber: 1, column: 15 },
  });
});

it('T066 inserts a two-column table at a block boundary without consuming source text', () => {
  const inline = formatMarkdown(
    request('table', 'A sentence continues here.', selection(1, 12)),
  );
  expect(inline.range).toEqual({
    start: { lineNumber: 1, column: 27 },
    end: { lineNumber: 1, column: 27 },
  });
  expect(inline.text).toBe(
    '\n\n| Header 1 | Header 2 |\n| --- | --- |\n|  |  |',
  );

  const blank = formatMarkdown(request('table', '\n', selection(1, 1)));
  expect(blank.text).toBe('| Header 1 | Header 2 |\n| --- | --- |\n|  |  |');
  expect(blank.selection).toEqual({
    start: { lineNumber: 1, column: 3 },
    end: { lineNumber: 1, column: 11 },
  });
});

it('T044 respects acknowledged bullet and emphasis marker preferences', () => {
  const markers = {
    bulletMarker: '*',
    emphasisMarker: '_',
    headingStyle: 'atx' as const,
  } as const;

  expect(
    formatMarkdown(
      request('bullet-list', 'first\nsecond', selection(1, 1, 2, 7), {
        markers,
      }),
    ).text,
  ).toBe('* first\n* second');
  expect(
    formatMarkdown(
      request('italic', 'word', selection(1, 1, 1, 5), { markers }),
    ).text,
  ).toBe('_word_');
});

it('T006 replaces and removes ATX heading levels on the current line', () => {
  expect(
    formatMarkdown(request('heading-1', '## Title', selection(1, 4))).text,
  ).toBe('# Title');
  expect(
    formatMarkdown(request('heading-2', '## Title', selection(1, 4))).text,
  ).toBe('Title');
  expect(
    formatMarkdown(request('heading-3', 'Title', selection(1, 3))).text,
  ).toBe('### Title');
});

it('T063 keeps formatting bounded to the selected line in a large document', () => {
  const source = sourceWithBoundedStringOperations(
    `## selected\n${'unrelated content\n'.repeat(50_000)}`,
  );

  const result = formatMarkdown(
    request('heading-2', source, selection(1, 1, 1, 12)),
  );

  expect(result.text).toBe('selected');
  expect(result.range).toEqual({
    start: { lineNumber: 1, column: 1 },
    end: { lineNumber: 1, column: 12 },
  });
});

it('T046 transforms every selected heading line without deleting bounded source bytes', () => {
  const source = 'alpha\nbeta\nomega';
  const result = formatMarkdown(
    request('heading-2', source, selection(1, 1, 2, 5)),
  );

  expect(result.text).toBe('## alpha\n## beta');
  expect(result.range).toEqual({
    start: { lineNumber: 1, column: 1 },
    end: { lineNumber: 2, column: 5 },
  });
});

it('T006 converts every selected list line to canonical numbered markers without renumbering', () => {
  const result = formatMarkdown(
    request(
      'numbered-list',
      '- first\n* second\n12. third',
      selection(1, 1, 3, 10),
    ),
  );
  expect(result.text).toBe('1. first\n1. second\nthird');

  expect(
    formatMarkdown(
      request('numbered-list', '1. first\n1. second', selection(1, 1, 2, 10)),
    ).text,
  ).toBe('first\nsecond');
});

it('T006 applies quote, source-only link, and the empty GFM table skeleton', () => {
  expect(
    formatMarkdown(request('quote', 'alpha\nbeta', selection(1, 1, 2, 5))).text,
  ).toBe('> alpha\n> beta');
  expect(
    formatMarkdown(request('link', 'docs', selection(1, 1, 1, 5))).text,
  ).toBe('[docs](url)');
  expect(formatMarkdown(request('table', '', selection(1, 1))).text).toBe(
    '| Header 1 | Header 2 |\n| --- | --- |\n|  |  |',
  );
});

it('T006 routes a bounded result through the existing document-command seam', () => {
  const replaceRange = jest.fn<
    { status: 'available'; value: void },
    [
      import('../../ui/components/CodeEditor').EditorRange,
      string,
      import('../../ui/components/CodeEditor').EditorSelection?,
    ]
  >(() => ({ status: 'available', value: undefined }));
  const commands: DocumentCommandAPI = {
    getContent: () => ({ status: 'available', value: 'hello' }),
    getSelection: () => ({
      status: 'available',
      value: selection(1, 1, 1, 6),
    }),
    replaceRange,
    replaceAll: jest.fn(),
  };

  expect(
    applyFormatEdit(
      commands,
      request('bold', 'ignored', selection(1, 1, 1, 6)),
    ),
  ).toMatchObject({ status: 'available', value: { text: '**hello**' } });
  expect(replaceRange).toHaveBeenCalledTimes(1);
  expect(replaceRange).toHaveBeenCalledWith(
    expect.objectContaining({ start: { lineNumber: 1, column: 1 } }),
    '**hello**',
    {
      start: { lineNumber: 1, column: 3 },
      end: { lineNumber: 1, column: 8 },
    },
  );
});

it('T057 forwards the formatter selection intent through document commands', () => {
  const replaceRange = jest.fn<
    { status: 'available'; value: void },
    [
      import('../../ui/components/CodeEditor').EditorRange,
      string,
      import('../../ui/components/CodeEditor').EditorSelection?,
    ]
  >(() => ({ status: 'available', value: undefined }));
  const commands: DocumentCommandAPI = {
    getContent: () => ({ status: 'available', value: 'hello' }),
    getSelection: () => ({
      status: 'available',
      value: selection(1, 1, 1, 6),
    }),
    replaceRange,
    replaceAll: jest.fn(),
  };

  expect(
    applyFormatEdit(
      commands,
      request('bold', 'ignored', selection(1, 1, 1, 6)),
    ),
  ).toMatchObject({ status: 'available' });
  expect(replaceRange).toHaveBeenCalledWith(expect.anything(), '**hello**', {
    start: { lineNumber: 1, column: 3 },
    end: { lineNumber: 1, column: 8 },
  });
});

it('T057 forwards empty-pair caret intent as well as selected-range intent', () => {
  const replaceRange = jest.fn<
    { status: 'available'; value: void },
    [
      import('../../ui/components/CodeEditor').EditorRange,
      string,
      import('../../ui/components/CodeEditor').EditorSelection?,
    ]
  >(() => ({ status: 'available', value: undefined }));
  const commands: DocumentCommandAPI = {
    getContent: () => ({ status: 'available', value: '' }),
    getSelection: () => ({
      status: 'available',
      value: selection(1, 1),
    }),
    replaceRange,
    replaceAll: jest.fn(),
  };

  expect(
    applyFormatEdit(commands, request('bold', 'ignored', selection(1, 1))),
  ).toMatchObject({ status: 'available' });
  expect(replaceRange).toHaveBeenCalledWith(expect.anything(), '****', {
    start: { lineNumber: 1, column: 3 },
    end: { lineNumber: 1, column: 3 },
  });
});
