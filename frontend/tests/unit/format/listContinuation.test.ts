import { continueList } from '../../../src/logic/format/listContinuation';

/** Applies the edit for a caret at the end of the last line of `text` and returns the result. */
function pressEnter(text: string, column?: number): { text: string; caret: { line: number; column: number } } | null {
    const lines = text.split('\n');
    const lineNumber = lines.length;
    const edit = continueList(lines, { lineNumber, column: column ?? (lines[lineNumber - 1] ?? '').length + 1 });
    if (edit === null) return null;
    const last = lines[lineNumber - 1] ?? '';
    const next = last.slice(0, edit.range.start.column - 1) + edit.text + last.slice(edit.range.end.column - 1);
    const result = [...lines.slice(0, -1), next].join('\n');
    return { text: result, caret: { line: edit.selection.start.lineNumber, column: edit.selection.start.column } };
}

describe('continueList', () => {
    it('continues a bullet item with the caret after the marker', () => {
        expect(pressEnter('- apple')).toEqual({ text: '- apple\n- ', caret: { line: 2, column: 3 } });
    });

    it('keeps the bullet character and indentation', () => {
        expect(pressEnter('  * apple')?.text).toBe('  * apple\n  * ');
        expect(pressEnter('+ apple')?.text).toBe('+ apple\n+ ');
    });

    it('increments a numbered item and keeps its indentation', () => {
        expect(pressEnter('  3. three')?.text).toBe('  3. three\n  4. ');
    });

    it('keeps the ) delimiter', () => {
        expect(pressEnter('3) three')?.text).toBe('3) three\n4) ');
    });

    it('continues a task item as unchecked', () => {
        expect(pressEnter('* [x] done')?.text).toBe('* [x] done\n* [ ] ');
        expect(pressEnter('- [ ] todo')?.text).toBe('- [ ] todo\n- [ ] ');
    });

    it('continues a quoted item with the quote prefix', () => {
        expect(pressEnter('> - quoted')?.text).toBe('> - quoted\n> - ');
    });

    it('ends the list on an empty item', () => {
        expect(pressEnter('- ')).toEqual({ text: '', caret: { line: 1, column: 1 } });
        expect(pressEnter(' -')?.text).toBe('');
        expect(pressEnter('1. ')?.text).toBe('');
        expect(pressEnter('- [ ] ')?.text).toBe('');
    });

    it('keeps the quote prefix when ending a quoted list', () => {
        expect(pressEnter('> - ')?.text).toBe('> ');
    });

    it('does nothing when the caret is inside the item text', () => {
        expect(pressEnter('- apple', 5)).toBeNull();
    });

    it('does nothing for non-list lines, emphasis and rules', () => {
        expect(pressEnter('plain text')).toBeNull();
        expect(pressEnter('**bold**')).toBeNull();
        expect(pressEnter('---')).toBeNull();
        expect(pressEnter('-apple')).toBeNull();
        expect(pressEnter('')).toBeNull();
    });

    it('does nothing inside a backtick fence', () => {
        expect(pressEnter('```\n- item')).toBeNull();
    });

    it('does nothing inside a tilde fence', () => {
        expect(pressEnter('~~~js\n- item')).toBeNull();
    });

    it('keeps a longer fence open until a close of at least its length', () => {
        expect(pressEnter('````\n```\n- item')).toBeNull();
        expect(pressEnter('````\n```\n````\n- item')?.text).toBe('````\n```\n````\n- item\n- ');
    });

    it('continues after a closed fence', () => {
        expect(pressEnter('```\ncode\n```\n- item')?.text).toBe('```\ncode\n```\n- item\n- ');
    });
});
