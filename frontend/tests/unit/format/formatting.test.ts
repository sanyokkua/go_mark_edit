import { applyFormatEdit, formatMarkdown, type FormatRequest } from '../../../src/logic/format/formatting';
import type { DocumentCommandAPI } from '../../../src/logic/hooks/useDocumentCommands';

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

it.each(['italic', 'bold-italic', 'bullet-list', 'task-list'] as const)(
    'refuses direct %s edits before reading a document when marker settings are absent',
    (actionId) => {
        const getContent = jest.fn(() => ({ status: 'available' as const, value: 'word' }));
        const getSelection = jest.fn(() => ({ status: 'available' as const, value: selection(1, 1, 1, 5) }));
        const replaceRange = jest.fn(() => ({ status: 'available' as const, value: undefined }));
        const commands: DocumentCommandAPI = {
            focus: jest.fn(() => ({ status: 'available', value: undefined })),
            getContent,
            getSelection,
            replaceRange,
            replaceAll: jest.fn(() => ({ status: 'available', value: undefined })),
            applyEdits: jest.fn(() => ({ status: 'available', value: undefined })),
            setPosition: jest.fn(() => ({ status: 'available', value: undefined })),
            setMarkers: jest.fn(() => ({ status: 'available', value: undefined })),
        };

        expect(
            applyFormatEdit(commands, request(actionId, 'word', selection(1, 1, 1, 5), { markers: undefined })),
        ).toEqual({ status: 'unavailable' });
        expect(getContent).not.toHaveBeenCalled();
        expect(getSelection).not.toHaveBeenCalled();
        expect(replaceRange).not.toHaveBeenCalled();
    },
);

it.each([
    ['bold', '**word**'],
    ['numbered-list', '1. word'],
] as const)('keeps direct %s edits available without marker settings', (actionId, expectedText) => {
    const replaceRange = jest.fn<
        ReturnType<DocumentCommandAPI['replaceRange']>,
        Parameters<DocumentCommandAPI['replaceRange']>
    >(() => ({ status: 'available', value: undefined }));
    const commands: DocumentCommandAPI = {
        focus: jest.fn(() => ({ status: 'available', value: undefined })),
        getContent: jest.fn(() => ({ status: 'available', value: 'word' })),
        getSelection: jest.fn(() => ({ status: 'available', value: selection(1, 1, 1, 5) })),
        replaceRange,
        replaceAll: jest.fn(() => ({ status: 'available', value: undefined })),
        applyEdits: jest.fn(() => ({ status: 'available', value: undefined })),
        setPosition: jest.fn(() => ({ status: 'available', value: undefined })),
        setMarkers: jest.fn(() => ({ status: 'available', value: undefined })),
    };

    expect(
        applyFormatEdit(commands, request(actionId, 'word', selection(1, 1, 1, 5), { markers: undefined })),
    ).toMatchObject({ status: 'available' });
    expect(replaceRange.mock.calls[0]?.[1]).toBe(expectedText);
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

it('toggles marker pairs around a selection and restores the original bytes', () => {
    const added = formatMarkdown(request('bold', 'hello world', selection(1, 1, 1, 6)));
    expect(added.text).toBe('**hello**');
    expect(added.range).toEqual({
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 6 },
    });

    const removed = formatMarkdown(request('bold', '**hello** world', selection(1, 3, 1, 8)));
    expect(removed.text).toBe('hello');
    expect(removed.range.start.column).toBe(1);
    expect(removed.range.end.column).toBe(10);
});

it('resolves a wrapped word stack at a collapsed caret without moving the logical caret', () => {
    const wrapped = formatMarkdown(request('bold', 'Word', selection(1, 3)));
    expect(wrapped).toMatchObject({
        text: '**Word**',
        selection: {
            start: { lineNumber: 1, column: 5 },
            end: { lineNumber: 1, column: 5 },
        },
    });

    const unwrapped = formatMarkdown(request('bold', '**Word**', selection(1, 5)));
    expect(unwrapped).toMatchObject({
        text: 'Word',
        selection: {
            start: { lineNumber: 1, column: 3 },
            end: { lineNumber: 1, column: 3 },
        },
    });

    const replaced = formatMarkdown(request('italic', '**Word**', selection(1, 5)));
    expect(replaced).toMatchObject({
        text: '_Word_',
        selection: {
            start: { lineNumber: 1, column: 4 },
            end: { lineNumber: 1, column: 4 },
        },
    });
});

it('adds or removes only the requested wrapper around a complete selected word stack', () => {
    const added = formatMarkdown(request('strike', '**Word**', selection(1, 3, 1, 7)));
    expect(added).toMatchObject({
        range: {
            start: { lineNumber: 1, column: 1 },
            end: { lineNumber: 1, column: 9 },
        },
        text: '~~**Word**~~',
        selection: {
            start: { lineNumber: 1, column: 5 },
            end: { lineNumber: 1, column: 9 },
        },
    });

    const removed = formatMarkdown(request('bold', '~~**Word**~~', selection(1, 5, 1, 9)));
    expect(removed).toMatchObject({
        range: {
            start: { lineNumber: 1, column: 1 },
            end: { lineNumber: 1, column: 13 },
        },
        text: '~~Word~~',
        selection: {
            start: { lineNumber: 1, column: 3 },
            end: { lineNumber: 1, column: 7 },
        },
    });
});

it('treats both italic markers as one semantic style and never duplicates an existing stack style', () => {
    const alternateItalic = formatMarkdown(request('italic', '*Word*', selection(1, 3)));
    expect(alternateItalic).toMatchObject({
        text: 'Word',
        selection: {
            start: { lineNumber: 1, column: 2 },
            end: { lineNumber: 1, column: 2 },
        },
    });

    const multipleStyles = formatMarkdown(request('inline-code', '**~~Word~~**', selection(1, 7)));
    expect(multipleStyles).toMatchObject({
        text: '`**~~Word~~**`',
        selection: {
            start: { lineNumber: 1, column: 8 },
            end: { lineNumber: 1, column: 8 },
        },
    });
});

it('inserts an empty pair with the caret between markers', () => {
    const result = formatMarkdown(request('italic', 'one  two', selection(1, 5)));
    expect(result.text).toBe('__');
    expect(result.selection).toEqual({
        start: { lineNumber: 1, column: 6 },
        end: { lineNumber: 1, column: 6 },
    });
});

it('cancels an empty pair and toggles an unambiguous span under the caret', () => {
    const cancelled = formatMarkdown(request('bold', 'before **** after', selection(1, 10)));
    expect(cancelled.text).toBe('');
    expect(cancelled.range).toEqual({
        start: { lineNumber: 1, column: 8 },
        end: { lineNumber: 1, column: 12 },
    });
    expect(cancelled.selection).toEqual({
        start: { lineNumber: 1, column: 8 },
        end: { lineNumber: 1, column: 8 },
    });

    const existing = formatMarkdown(request('italic', 'before _word_ after', selection(1, 10)));
    expect(existing.text).toBe('word');
    expect(existing.range).toEqual({
        start: { lineNumber: 1, column: 8 },
        end: { lineNumber: 1, column: 14 },
    });
    expect(existing.selection).toEqual({
        start: { lineNumber: 1, column: 9 },
        end: { lineNumber: 1, column: 9 },
    });

    expect(formatMarkdown(request('bold', 'ordinary', selection(1, 4))).text).toBe('**ordinary**');
});

it('keeps whitespace and list or quote prefixes outside inline markers', () => {
    const whitespace = formatMarkdown(request('bold', '  hello  ', selection(1, 1, 1, 10)));
    expect(whitespace.text).toBe('  **hello**  ');

    const multiline = formatMarkdown(request('italic', '- first\n> second', selection(1, 1, 2, 9)));
    expect(multiline.text).toBe('- _first_\n> _second_');
});

it('replaces heading and list markers on complete lines without stale syntax', () => {
    expect(formatMarkdown(request('bullet-list', '# Title', selection(1, 1))).text).toBe('- Title');
    expect(formatMarkdown(request('heading-1', '- Title', selection(1, 3))).text).toBe('# Title');
    expect(formatMarkdown(request('numbered-list', '  * first\n    - second', selection(1, 1, 2, 12))).text).toBe(
        '  1. first\n    1. second',
    );
});

it('keeps quote composition and indentation while toggling block markers', () => {
    expect(formatMarkdown(request('quote', '  # Title', selection(1, 1))).text).toBe('  > # Title');
    expect(formatMarkdown(request('quote', '  > - Title', selection(1, 1))).text).toBe('  - Title');
    expect(formatMarkdown(request('heading-2', '> - Title', selection(1, 4))).text).toBe('> ## Title');
});

it('edits an existing link instead of nesting and selects the empty-link URL', () => {
    const empty = formatMarkdown(request('link', '', selection(1, 1)));
    expect(empty.text).toBe('[](url)');
    expect(empty.selection).toEqual({
        start: { lineNumber: 1, column: 4 },
        end: { lineNumber: 1, column: 7 },
    });

    const existing = formatMarkdown(request('link', 'See [docs](url) today', selection(1, 8)));
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

it('inserts a default 3 by 3 table at a block boundary without consuming source text', () => {
    const skeleton = '| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n|  |  |  |';
    const inline = formatMarkdown(request('table', 'A sentence continues here.', selection(1, 12)));
    expect(inline.range).toEqual({
        start: { lineNumber: 1, column: 27 },
        end: { lineNumber: 1, column: 27 },
    });
    expect(inline.text).toBe(`\n\n${skeleton}`);

    const blank = formatMarkdown(request('table', '\n', selection(1, 1)));
    expect(blank.text).toBe(skeleton);
    expect(blank.selection).toEqual({
        start: { lineNumber: 1, column: 3 },
        end: { lineNumber: 1, column: 11 },
    });
});

it('respects acknowledged bullet and emphasis marker preferences', () => {
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
    expect(formatMarkdown(request('italic', 'word', selection(1, 1, 1, 5), { markers })).text).toBe('_word_');
});

it('replaces and removes ATX heading levels on the current line', () => {
    expect(formatMarkdown(request('heading-1', '## Title', selection(1, 4))).text).toBe('# Title');
    expect(formatMarkdown(request('heading-2', '## Title', selection(1, 4))).text).toBe('Title');
    expect(formatMarkdown(request('heading-3', 'Title', selection(1, 3))).text).toBe('### Title');
});

it('keeps formatting bounded to the selected line in a large document', () => {
    const source = sourceWithBoundedStringOperations(`## selected\n${'unrelated content\n'.repeat(50_000)}`);

    const result = formatMarkdown(request('heading-2', source, selection(1, 1, 1, 12)));

    expect(result.text).toBe('selected');
    expect(result.range).toEqual({
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 1, column: 12 },
    });
});

it('transforms every selected heading line without deleting bounded source bytes', () => {
    const source = 'alpha\nbeta\nomega';
    const result = formatMarkdown(request('heading-2', source, selection(1, 1, 2, 5)));

    expect(result.text).toBe('## alpha\n## beta');
    expect(result.range).toEqual({
        start: { lineNumber: 1, column: 1 },
        end: { lineNumber: 2, column: 5 },
    });
});

it('replaces mixed list markers with a sequential count and still removes numbering when every line is numbered', () => {
    const result = formatMarkdown(request('numbered-list', '- first\n* second\n12. third', selection(1, 1, 3, 10)));
    expect(result.text).toBe('1. first\n2. second\n3. third');

    expect(formatMarkdown(request('numbered-list', '1. first\n1. second', selection(1, 1, 2, 10))).text).toBe(
        'first\nsecond',
    );
});

it('applies quote, source-only link, and the empty GFM table skeleton', () => {
    expect(formatMarkdown(request('quote', 'alpha\nbeta', selection(1, 1, 2, 5))).text).toBe('> alpha\n> beta');
    expect(formatMarkdown(request('link', 'docs', selection(1, 1, 1, 5))).text).toBe('[docs](url)');
    expect(formatMarkdown(request('table', '', selection(1, 1))).text).toBe(
        '| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n|  |  |  |',
    );
});

it('builds a table of the requested size and selects Header 1', () => {
    const result = formatMarkdown(request('table', '', selection(1, 1), { table: { columns: 4, rows: 2 } }));
    expect(result.text).toBe(
        '| Header 1 | Header 2 | Header 3 | Header 4 |\n| --- | --- | --- | --- |\n|  |  |  |  |\n|  |  |  |  |',
    );
    expect(result.selection).toEqual({
        start: { lineNumber: 1, column: 3 },
        end: { lineNumber: 1, column: 11 },
    });
});

it('separates a table from a non-blank line by exactly one blank line', () => {
    const result = formatMarkdown(request('table', 'Intro', selection(1, 6), { table: { columns: 2, rows: 1 } }));
    expect(result.text).toBe('\n\n| Header 1 | Header 2 |\n| --- | --- |\n|  |  |');
    expect(result.selection).toEqual({
        start: { lineNumber: 3, column: 3 },
        end: { lineNumber: 3, column: 11 },
    });
});

it('routes a bounded result through the existing document-command seam', () => {
    const replaceRange = jest.fn<
        { status: 'available'; value: void },
        [
            import('../../../src/ui/components/CodeEditor').EditorRange,
            string,
            import('../../../src/ui/components/CodeEditor').EditorSelection?,
        ]
    >(() => ({ status: 'available', value: undefined }));
    const commands: DocumentCommandAPI = {
        focus: () => ({ status: 'available', value: undefined }),
        getContent: () => ({ status: 'available', value: 'hello' }),
        getSelection: () => ({
            status: 'available',
            value: selection(1, 1, 1, 6),
        }),
        replaceRange,
        replaceAll: jest.fn(),
        applyEdits: jest.fn(() => ({ status: 'available', value: undefined })),
        setPosition: jest.fn(() => ({ status: 'available', value: undefined })),
        setMarkers: jest.fn(() => ({ status: 'available', value: undefined })),
    };

    expect(applyFormatEdit(commands, request('bold', 'ignored', selection(1, 1, 1, 6)))).toMatchObject({
        status: 'available',
        value: { text: '**hello**' },
    });
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

it('forwards the formatter selection intent through document commands', () => {
    const replaceRange = jest.fn<
        { status: 'available'; value: void },
        [
            import('../../../src/ui/components/CodeEditor').EditorRange,
            string,
            import('../../../src/ui/components/CodeEditor').EditorSelection?,
        ]
    >(() => ({ status: 'available', value: undefined }));
    const commands: DocumentCommandAPI = {
        focus: () => ({ status: 'available', value: undefined }),
        getContent: () => ({ status: 'available', value: 'hello' }),
        getSelection: () => ({
            status: 'available',
            value: selection(1, 1, 1, 6),
        }),
        replaceRange,
        replaceAll: jest.fn(),
        applyEdits: jest.fn(() => ({ status: 'available', value: undefined })),
        setPosition: jest.fn(() => ({ status: 'available', value: undefined })),
        setMarkers: jest.fn(() => ({ status: 'available', value: undefined })),
    };

    expect(applyFormatEdit(commands, request('bold', 'ignored', selection(1, 1, 1, 6)))).toMatchObject({
        status: 'available',
    });
    expect(replaceRange).toHaveBeenCalledWith(expect.anything(), '**hello**', {
        start: { lineNumber: 1, column: 3 },
        end: { lineNumber: 1, column: 8 },
    });
});

it('forwards empty-pair caret intent as well as selected-range intent', () => {
    const replaceRange = jest.fn<
        { status: 'available'; value: void },
        [
            import('../../../src/ui/components/CodeEditor').EditorRange,
            string,
            import('../../../src/ui/components/CodeEditor').EditorSelection?,
        ]
    >(() => ({ status: 'available', value: undefined }));
    const commands: DocumentCommandAPI = {
        focus: () => ({ status: 'available', value: undefined }),
        getContent: () => ({ status: 'available', value: '' }),
        getSelection: () => ({
            status: 'available',
            value: selection(1, 1),
        }),
        replaceRange,
        replaceAll: jest.fn(),
        applyEdits: jest.fn(() => ({ status: 'available', value: undefined })),
        setPosition: jest.fn(() => ({ status: 'available', value: undefined })),
        setMarkers: jest.fn(() => ({ status: 'available', value: undefined })),
    };

    expect(applyFormatEdit(commands, request('bold', 'ignored', selection(1, 1)))).toMatchObject({
        status: 'available',
    });
    expect(replaceRange).toHaveBeenCalledWith(expect.anything(), '****', {
        start: { lineNumber: 1, column: 3 },
        end: { lineNumber: 1, column: 3 },
    });
});

describe('Bold italic', () => {
    const boldItalic = (source: string, range: FormatRequest['selection'], emphasisMarker: '_' | '*' = '_') =>
        formatMarkdown(
            request('bold-italic', source, range, {
                markers: { bulletMarker: '-', emphasisMarker, headingStyle: 'atx' },
            }),
        );

    it('wraps the selection with strong outside and the emphasis marker inside, and restores it on a second use', () => {
        const applied = boldItalic('word', selection(1, 1, 1, 5));
        expect(applied.text).toBe('**_word_**');

        const restored = boldItalic('**_word_**', selection(1, 1, 1, 11));
        expect(restored.text).toBe('word');
    });

    it('uses three asterisks when the emphasis marker is an asterisk', () => {
        expect(boldItalic('word', selection(1, 1, 1, 5), '*').text).toBe('***word***');
    });

    it('completes bold text when the caret is inside it', () => {
        expect(boldItalic('**word**', selection(1, 5)).text).toBe('**_word_**');
    });

    it('completes italic text by adding strong outside it', () => {
        expect(boldItalic('_word_', selection(1, 4)).text).toBe('**_word_**');
    });

    it('wraps every non-empty line of a multi-line selection separately', () => {
        const source = '- first\n\n> second';
        expect(boldItalic(source, selection(1, 1, 3, 10)).text).toBe('- **_first_**\n\n> **_second_**');
        expect(boldItalic(source, selection(1, 1, 3, 10), '*').text).toBe('- ***first***\n\n> ***second***');
    });
});

describe('Heading levels 4 to 6', () => {
    it.each([
        ['heading-4', '#### Title'],
        ['heading-5', '##### Title'],
        ['heading-6', '###### Title'],
    ] as const)('%s sets the heading level and toggles it off again', (actionId, expected) => {
        expect(formatMarkdown(request(actionId, 'Title', selection(1, 3))).text).toBe(expected);
        expect(formatMarkdown(request(actionId, expected, selection(1, 3))).text).toBe('Title');
    });

    it('changes a different heading level to the requested one', () => {
        expect(formatMarkdown(request('heading-5', '## Title', selection(1, 4))).text).toBe('##### Title');
    });
});

describe('Numbered list numbering', () => {
    const numbered = (source: string, range: FormatRequest['selection']) =>
        formatMarkdown(request('numbered-list', source, range)).text;

    it('numbers three plain lines from 1', () => {
        expect(numbered('a\nb\nc', selection(1, 1, 3, 2))).toBe('1. a\n2. b\n3. c');
    });

    it('continues the numbered item above with its count and delimiter', () => {
        expect(numbered('4) d\nx\ny', selection(2, 1, 3, 2))).toBe('5) x\n6) y');
    });

    it('continues a numbered item inside a block quote', () => {
        expect(numbered('> 2. b\n> x', selection(2, 1, 2, 4))).toBe('> 3. x');
    });

    it('does not continue a numbered item above that has a different indentation', () => {
        expect(numbered('  4. d\nx', selection(2, 1))).toBe('1. x');
    });

    it('does not continue a numbered item above that has a different quote prefix', () => {
        expect(numbered('> 4. d\nx', selection(2, 1))).toBe('1. x');
    });

    it('restarts nested runs and resumes the outer count', () => {
        expect(numbered('a\n  b\n  c\nd', selection(1, 1, 4, 2))).toBe('1. a\n  1. b\n  2. c\n2. d');
    });

    it('restarts a nested run after each shallower line', () => {
        expect(numbered('a\n  b\nc\n  d', selection(1, 1, 4, 4))).toBe('1. a\n  1. b\n2. c\n  1. d');
        expect(numbered('a\n  b\n    c\n  d\n    e', selection(1, 1, 5, 6))).toBe(
            '1. a\n  1. b\n    1. c\n  2. d\n    1. e',
        );
    });

    it('keeps blank lines blank without consuming a number', () => {
        expect(numbered('a\n\nb', selection(1, 1, 3, 2))).toBe('1. a\n\n2. b');
    });

    it('turns a single blank caret line into an empty first item', () => {
        expect(numbered('', selection(1, 1))).toBe('1. ');
    });

    it('replaces task and heading markers with numbers', () => {
        expect(numbered('- [ ] a\n# b', selection(1, 1, 2, 4))).toBe('1. a\n2. b');
    });

    it('removes numbering when every non-blank line is a numbered item', () => {
        expect(numbered('1. first\n2. second', selection(1, 1, 2, 10))).toBe('first\nsecond');
    });

    it('does not renumber items below the selection', () => {
        const edit = formatMarkdown(request('numbered-list', 'a\n7. z', selection(1, 1)));
        expect(edit.text).toBe('1. a');
        expect(edit.range.end.lineNumber).toBe(1);
    });
});
