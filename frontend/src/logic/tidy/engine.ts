import { splitIntoChunks } from './chunking';
import { compactEdits, formatEdits } from './edits';
import { guardEdits } from './equivalence';
import { parseFull } from './parser';
import type { TidyPreferences } from './prefs';
import type { TextEdit, TidyOp, WorkerOutcome } from './protocol';

export function runOnText(
    op: TidyOp,
    text: string,
    prefs: TidyPreferences,
    onProgress?: (done: number, total: number) => void,
): WorkerOutcome {
    if (op === 'lint') return { kind: 'failed' };
    const chunks = splitIntoChunks(text);
    const edits: TextEdit[] = [];
    for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const tree = parseFull(chunk.text);
        const local =
            op === 'format'
                ? formatEdits(chunk.text, tree, prefs, index === chunks.length - 1)
                : compactEdits(chunk.text, tree);
        const guarded = guardEdits(chunk.text, local, tree);
        if (guarded.kind === 'refused') return guarded;
        if (guarded.kind !== 'edits') return { kind: 'failed' };
        for (const edit of guarded.edits) {
            edits.push({ from: edit.from + chunk.offset, to: edit.to + chunk.offset, text: edit.text });
        }
        onProgress?.(index + 1, chunks.length);
    }
    return { kind: 'edits', edits };
}
