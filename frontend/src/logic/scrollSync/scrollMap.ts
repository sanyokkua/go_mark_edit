import type { ScrollSyncPane, SourceLineOffset } from './scrollSyncTypes';

/** Scroll offsets of the editor and the preview that show the same place in the document. */
export interface ScrollAnchor {
    readonly editor: number;
    readonly preview: number;
}

/**
 * Piecewise-linear correspondence between the two panes' scroll offsets. The
 * anchors start at both tops, end at both maximum scroll offsets and strictly
 * increase on both axes.
 */
export interface ScrollMap {
    readonly anchors: readonly ScrollAnchor[];
}

/**
 * Builds the scroll map from the preview's measured blocks and the editor's
 * line tops, or returns `null` when either maximum scroll offset is not greater
 * than 0 (NaN included), because a pane with nothing to scroll moves nothing.
 *
 * Each block, in document order, pairs `lineTop(line)` with its preview offset.
 * A block is skipped when its line exceeds `lineCount` (the preview lags the
 * editor) or when its line, editor offset or preview offset is not strictly
 * greater than the last kept anchor's. Collection stops at the first block
 * whose editor or preview offset reaches that pane's maximum.
 */
export function buildScrollMap(input: {
    sourceLines: readonly SourceLineOffset[];
    lineCount: number;
    lineTop: (lineNumber: number) => number;
    editorMaxScrollTop: number;
    previewMaxScrollTop: number;
}): ScrollMap | null {
    const { sourceLines, lineCount, lineTop, editorMaxScrollTop, previewMaxScrollTop } = input;
    if (!(editorMaxScrollTop > 0) || !(previewMaxScrollTop > 0)) return null;

    let lastAnchor: ScrollAnchor = { editor: 0, preview: 0 };
    let lastLine = 0;
    const anchors: ScrollAnchor[] = [lastAnchor];

    for (const { line, top } of sourceLines) {
        if (line > lineCount) continue;

        const editor = lineTop(line);
        if (editor >= editorMaxScrollTop || top >= previewMaxScrollTop) break;
        if (!(line > lastLine && editor > lastAnchor.editor && top > lastAnchor.preview)) continue;

        lastAnchor = { editor, preview: top };
        lastLine = line;
        anchors.push(lastAnchor);
    }

    anchors.push({ editor: editorMaxScrollTop, preview: previewMaxScrollTop });
    return { anchors };
}

/**
 * Maps the `from` pane's scroll offset onto the other pane by interpolating
 * linearly between the two anchors around it, clamped to the other pane's
 * `[0, maximum]`. An editor offset past the editor maximum (the space Monaco
 * allows below the last line) therefore maps to the preview's bottom.
 */
export function mapScrollTop(map: ScrollMap, from: ScrollSyncPane, scrollTop: number): number {
    const to: ScrollSyncPane = from === 'editor' ? 'preview' : 'editor';
    const { anchors } = map;

    // The last segment that starts at or before `scrollTop`; the first one when none does.
    let low = 0;
    let high = anchors.length - 2;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (anchors[middle][from] <= scrollTop) low = middle;
        else high = middle - 1;
    }

    const start = anchors[low];
    const end = anchors[low + 1];
    const ratio = (scrollTop - start[from]) / (end[from] - start[from]);
    const mapped = start[to] + ratio * (end[to] - start[to]);
    return Math.min(Math.max(mapped, 0), anchors[anchors.length - 1][to]);
}
