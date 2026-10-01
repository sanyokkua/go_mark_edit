import { splitIntoChunks } from './chunking';
import { compactEdits, formatEdits } from './edits';
import { guardEdits } from './equivalence';
import { lintFindings } from './lint';
import { parseFull } from './parser';
import type { TidyPreferences } from './prefs';
import type { LintFinding, TextEdit, TidyOp, WorkerOutcome } from './protocol';

export function runOnText(
    op: TidyOp,
    text: string,
    prefs: TidyPreferences,
    onProgress?: (done: number, total: number) => void,
): WorkerOutcome {
    const chunks = splitIntoChunks(text);
    const edits: TextEdit[] = [];
    const findings: LintFinding[] = [];
    const state = { h1Count: 0 };
    let lineOffset = 0;
    for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const tree = parseFull(chunk.text);
        if (op === 'lint') {
            for (const finding of lintFindings(chunk.text, tree, prefs, state, index === chunks.length - 1)) {
                findings.push({
                    ...finding,
                    startLine: finding.startLine + lineOffset,
                    endLine: finding.endLine + lineOffset,
                });
            }
            lineOffset += chunk.text.split('\n').length - 1;
            onProgress?.(index + 1, chunks.length);
            continue;
        }
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
    if (op === 'lint') return { kind: 'findings', findings, total: findings.length };
    return { kind: 'edits', edits };
}
