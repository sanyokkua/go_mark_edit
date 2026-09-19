import { buildScrollMap, mapScrollTop } from '../../../src/logic/scrollSync/scrollMap';
import type { ScrollMap } from '../../../src/logic/scrollSync/scrollMap';

const twentyPixelLines = (lineNumber: number): number => (lineNumber - 1) * 20;

function requireMap(map: ScrollMap | null): ScrollMap {
    if (map === null) throw new Error('Expected a scroll map.');
    return map;
}

it('maps the top and the bottom of both panes onto each other', () => {
    const withBlocks = requireMap(
        buildScrollMap({
            sourceLines: [
                { line: 10, top: 500 },
                { line: 25, top: 1100 },
            ],
            lineCount: 40,
            lineTop: twentyPixelLines,
            editorMaxScrollTop: 600,
            previewMaxScrollTop: 1500,
        }),
    );
    const withoutBlocks = requireMap(
        buildScrollMap({
            sourceLines: [],
            lineCount: 40,
            lineTop: twentyPixelLines,
            editorMaxScrollTop: 600,
            previewMaxScrollTop: 1500,
        }),
    );

    for (const map of [withBlocks, withoutBlocks]) {
        expect(mapScrollTop(map, 'editor', 0)).toBe(0);
        expect(mapScrollTop(map, 'preview', 0)).toBe(0);
        expect(mapScrollTop(map, 'editor', 600)).toBe(1500);
        expect(mapScrollTop(map, 'preview', 1500)).toBe(600);

        // An elastic overscroll beyond either end still lands on the other pane's end.
        expect(mapScrollTop(map, 'preview', -30)).toBe(0);
        expect(mapScrollTop(map, 'preview', 1530)).toBe(600);
    }
});

it('interpolates between block anchors in both directions', () => {
    const map = requireMap(
        buildScrollMap({
            sourceLines: [
                { line: 5, top: 200 },
                { line: 10, top: 300 },
                { line: 20, top: 900 },
                { line: 30, top: 1000 },
            ],
            lineCount: 40,
            lineTop: twentyPixelLines,
            editorMaxScrollTop: 700,
            previewMaxScrollTop: 1400,
        }),
    );

    // Editor offsets 0, 80, 180, 380, 580 and 700 pair with preview offsets 0, 200, 300, 900, 1000 and 1400.
    const pairs = [
        { editor: 20, preview: 50 },
        { editor: 80, preview: 200 },
        { editor: 105, preview: 225 },
        { editor: 330, preview: 750 },
        { editor: 405, preview: 912.5 },
        { editor: 670, preview: 1300 },
    ];

    for (const { editor, preview } of pairs) {
        expect(mapScrollTop(map, 'editor', editor)).toBeCloseTo(preview, 6);
        expect(mapScrollTop(map, 'preview', preview)).toBeCloseTo(editor, 6);
    }
});

it('ignores anchors that repeat, go backwards, exceed the line count or reach either end', () => {
    // Twenty-pixel lines with line 5 folded under line 4, so both lines report the same top.
    const foldedLineTops: Record<number, number> = {
        1: 0,
        2: 20,
        3: 40,
        4: 60,
        5: 60,
        6: 80,
        7: 100,
        8: 120,
        9: 140,
        10: 160,
        11: 180,
    };
    const repeatsAndBackwards = buildScrollMap({
        sourceLines: [
            { line: 2, top: 50 },
            { line: 2, top: 70 },
            { line: 3, top: 50 },
            { line: 4, top: 90 },
            { line: 5, top: 110 },
            { line: 6, top: 80 },
            { line: 3, top: 130 },
            { line: 7, top: 150 },
            { line: 11, top: 300 },
        ],
        lineCount: 10,
        lineTop: (lineNumber) => foldedLineTops[lineNumber],
        editorMaxScrollTop: 400,
        previewMaxScrollTop: 800,
    });

    expect(repeatsAndBackwards?.anchors).toEqual([
        { editor: 0, preview: 0 },
        { editor: 20, preview: 50 },
        { editor: 60, preview: 90 },
        { editor: 100, preview: 150 },
        { editor: 400, preview: 800 },
    ]);

    // Only the line order rejects the second block: both of its offsets still move forward.
    const outOfOrderLineTops: Record<number, number> = { 2: 80, 4: 40 };
    const backwardsLine = buildScrollMap({
        sourceLines: [
            { line: 4, top: 100 },
            { line: 2, top: 200 },
        ],
        lineCount: 10,
        lineTop: (lineNumber) => outOfOrderLineTops[lineNumber],
        editorMaxScrollTop: 400,
        previewMaxScrollTop: 800,
    });

    expect(backwardsLine?.anchors).toEqual([
        { editor: 0, preview: 0 },
        { editor: 40, preview: 100 },
        { editor: 400, preview: 800 },
    ]);

    const reachesEditorEnd = buildScrollMap({
        sourceLines: [
            { line: 5, top: 100 },
            { line: 21, top: 500 },
        ],
        lineCount: 50,
        lineTop: twentyPixelLines,
        editorMaxScrollTop: 400,
        previewMaxScrollTop: 800,
    });

    expect(reachesEditorEnd?.anchors).toEqual([
        { editor: 0, preview: 0 },
        { editor: 80, preview: 100 },
        { editor: 400, preview: 800 },
    ]);

    const reachesPreviewEnd = buildScrollMap({
        sourceLines: [
            { line: 5, top: 100 },
            { line: 8, top: 800 },
            { line: 9, top: 700 },
        ],
        lineCount: 50,
        lineTop: twentyPixelLines,
        editorMaxScrollTop: 400,
        previewMaxScrollTop: 800,
    });

    expect(reachesPreviewEnd?.anchors).toEqual([
        { editor: 0, preview: 0 },
        { editor: 80, preview: 100 },
        { editor: 400, preview: 800 },
    ]);
});

it('returns no map when either pane cannot scroll', () => {
    const build = (editorMaxScrollTop: number, previewMaxScrollTop: number): ScrollMap | null =>
        buildScrollMap({
            sourceLines: [{ line: 2, top: 40 }],
            lineCount: 10,
            lineTop: twentyPixelLines,
            editorMaxScrollTop,
            previewMaxScrollTop,
        });

    expect(build(0, 800)).toBeNull();
    expect(build(400, 0)).toBeNull();
    expect(build(-20, 800)).toBeNull();
    expect(build(400, -1)).toBeNull();
    expect(build(Number.NaN, 800)).toBeNull();
    expect(build(400, Number.NaN)).toBeNull();
    expect(build(400, 800)).not.toBeNull();
});

it('clamps editor overscroll past the last line to the preview bottom', () => {
    const map = requireMap(
        buildScrollMap({
            sourceLines: [{ line: 10, top: 500 }],
            lineCount: 40,
            lineTop: twentyPixelLines,
            editorMaxScrollTop: 600,
            previewMaxScrollTop: 1500,
        }),
    );

    expect(mapScrollTop(map, 'editor', 601)).toBe(1500);
    expect(mapScrollTop(map, 'editor', 780)).toBe(1500);
});
