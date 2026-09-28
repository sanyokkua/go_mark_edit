import { createScrollSyncController } from '../../../src/logic/scrollSync/scrollSyncController';
import type { FrameScheduler } from '../../../src/logic/scrollSync/scrollSyncController';
import type {
    EditorScrollPort,
    PreviewScrollPort,
    ScrollGeometryChange,
    ScrollSyncPane,
    SourceLineOffset,
} from '../../../src/logic/scrollSync/scrollSyncTypes';

class FakeScheduler implements FrameScheduler {
    private nextHandle = 1;
    private now = 0;
    private readonly frames = new Map<number, () => void>();
    private readonly timers = new Map<number, { callback: () => void; dueAt: number }>();

    requestFrame(callback: () => void): number {
        const handle = this.nextHandle++;
        this.frames.set(handle, callback);
        return handle;
    }

    cancelFrame(handle: number): void {
        this.frames.delete(handle);
    }

    setTimer(callback: () => void, delayMs: number): number {
        const handle = this.nextHandle++;
        this.timers.set(handle, { callback, dueAt: this.now + delayMs });
        return handle;
    }

    clearTimer(handle: number): void {
        this.timers.delete(handle);
    }

    /** Runs, in request order, the frame callbacks requested before this frame began. */
    runFrame(): void {
        for (const handle of [...this.frames.keys()]) {
            const callback = this.frames.get(handle);
            if (callback === undefined) continue;
            this.frames.delete(handle);
            callback();
        }
    }

    runFrames(count: number): void {
        for (let frame = 0; frame < count; frame += 1) this.runFrame();
    }

    advanceTime(milliseconds: number): void {
        this.now += milliseconds;
        const due = [...this.timers].filter(([, timer]) => timer.dueAt <= this.now);
        for (const [handle, timer] of due.sort(([, left], [, right]) => left.dueAt - right.dueAt)) {
            if (!this.timers.delete(handle)) continue;
            timer.callback();
        }
    }

    get pendingFrames(): number {
        return this.frames.size;
    }

    get pendingTimers(): number {
        return this.timers.size;
    }
}

class FakePaneEvents {
    private readonly scrollListeners = new Set<(scrollTop: number) => void>();
    private readonly geometryListeners = new Set<(change: ScrollGeometryChange) => void>();

    onScroll(listener: (scrollTop: number) => void): () => void {
        this.scrollListeners.add(listener);
        return () => {
            this.scrollListeners.delete(listener);
        };
    }

    onGeometryChange(listener: (change: ScrollGeometryChange) => void): () => void {
        this.geometryListeners.add(listener);
        return () => {
            this.geometryListeners.delete(listener);
        };
    }

    protected emitScroll(scrollTop: number): void {
        for (const listener of [...this.scrollListeners]) listener(scrollTop);
    }

    changeGeometry(change: ScrollGeometryChange): void {
        for (const listener of [...this.geometryListeners]) listener(change);
    }

    get listenerCount(): number {
        return this.scrollListeners.size + this.geometryListeners.size;
    }
}

/** Twenty-pixel lines: 100 lines end at 2000 px, and a 400 px viewport can scroll to 1600 px. */
class FakeEditor extends FakePaneEvents implements EditorScrollPort {
    scrollTop = 0;
    viewportHeight = 400;
    lineCount = 100;
    documentBottom = 2000;
    lineTop = (lineNumber: number): number => (lineNumber - 1) * 20;
    readonly writes: number[] = [];

    getScrollTop(): number {
        return this.scrollTop;
    }

    /** Monaco keeps whole-pixel offsets and reports the new one synchronously, inside the call. */
    setScrollTop(scrollTop: number): void {
        this.writes.push(scrollTop);
        this.scrollTop = Math.trunc(scrollTop);
        this.emitScroll(this.scrollTop);
    }

    getViewportHeight(): number {
        return this.viewportHeight;
    }

    getLineCount(): number {
        return this.lineCount;
    }

    getLineTop(lineNumber: number): number {
        return this.lineTop(lineNumber);
    }

    getDocumentBottom(): number {
        return this.documentBottom;
    }

    userScroll(scrollTop: number): void {
        this.scrollTop = scrollTop;
        this.emitScroll(this.scrollTop);
    }
}

/** Blocks from lines 21 and 61 render at 1000 px and 2000 px; the content can scroll to 3200 px. */
class FakePreview extends FakePaneEvents implements PreviewScrollPort {
    scrollTop = 0;
    maxScrollTop = 3200;
    sourceLines: SourceLineOffset[] = [
        { line: 21, top: 1000 },
        { line: 61, top: 2000 },
    ];
    readonly writes: number[] = [];
    measureSourceLinesCalls = 0;

    constructor(private readonly scheduler: FakeScheduler) {
        super();
    }

    getScrollTop(): number {
        return this.scrollTop;
    }

    /** The browser clamps the offset and reports the scroll on the next frame. */
    setScrollTop(scrollTop: number): void {
        this.writes.push(scrollTop);
        this.scrollTop = Math.min(Math.max(scrollTop, 0), this.maxScrollTop);
        this.scheduler.requestFrame(() => this.reportScroll());
    }

    getMaxScrollTop(): number {
        return this.maxScrollTop;
    }

    measureSourceLines(): readonly SourceLineOffset[] {
        this.measureSourceLinesCalls += 1;
        return this.sourceLines;
    }

    dispose(): void {}

    userScroll(scrollTop: number): void {
        this.scrollTop = scrollTop;
        this.reportScroll();
    }

    reportScroll(): void {
        this.emitScroll(this.scrollTop);
    }

    /** Re-renders the content; the browser keeps the offset unless the new content is too short for it. */
    replaceContent(sourceLines: SourceLineOffset[], maxScrollTop: number): void {
        this.sourceLines = sourceLines;
        this.maxScrollTop = maxScrollTop;
        this.scrollTop = Math.min(this.scrollTop, maxScrollTop);
        this.changeGeometry('content');
    }
}

function startSync(options: { reference?: ScrollSyncPane; editorScrollTop?: number; previewScrollTop?: number } = {}) {
    const scheduler = new FakeScheduler();
    const editor = new FakeEditor();
    const preview = new FakePreview(scheduler);
    editor.scrollTop = options.editorScrollTop ?? 0;
    preview.scrollTop = options.previewScrollTop ?? 0;
    const controller = createScrollSyncController({
        editor,
        preview,
        reference: options.reference ?? 'editor',
        scheduler,
    });
    return { scheduler, editor, preview, controller };
}

/** Starts synchronization and lets the two settle frames and the first alignment frame run. */
function startSettledSync(options: { editorScrollTop?: number } = {}) {
    const sync = startSync(options);
    sync.scheduler.runFrames(3);
    return sync;
}

const rounded = (values: readonly number[]): number[] => values.map((value) => Math.round(value * 1000) / 1000);

// With the default fakes the anchors pair editor offsets 0, 400, 1200 and 1600
// with preview offsets 0, 1000, 2000 and 3200.

it('waits for the panes to settle before aligning the follower to the reference pane', () => {
    const { scheduler, editor, preview } = startSync({ reference: 'preview', previewScrollTop: 1501 });

    editor.userScroll(40);
    scheduler.runFrame();
    preview.userScroll(1501);
    scheduler.runFrame();

    expect(editor.writes).toEqual([]);
    expect(preview.writes).toEqual([]);

    scheduler.runFrame();

    expect(rounded(editor.writes)).toEqual([800.8]);
    expect(preview.writes).toEqual([]);

    // Monaco reports that alignment as 800 px inside the write. The report is not the user taking the
    // lead, so the preview can be scrolled straight away and the editor follows it.
    preview.userScroll(2600);
    scheduler.runFrame();

    expect(rounded(editor.writes)).toEqual([800.8, 1400]);
    expect(preview.writes).toEqual([]);
});

it('moves the preview at most once per frame while the editor leads', () => {
    const { scheduler, editor, preview } = startSettledSync();

    editor.userScroll(100);
    editor.userScroll(200);
    editor.userScroll(300);
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([750]);

    editor.userScroll(600);
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([750, 1250]);
    expect(editor.writes).toEqual([]);
});

it('moves the editor while the preview leads', () => {
    const { scheduler, editor, preview } = startSettledSync();

    preview.userScroll(1250);
    scheduler.runFrame();

    expect(rounded(editor.writes)).toEqual([600]);

    preview.userScroll(2600);
    scheduler.runFrame();

    expect(rounded(editor.writes)).toEqual([600, 1400]);
    expect(preview.writes).toEqual([]);
});

it("ignores the follower's own scroll events while a pane leads", () => {
    const { scheduler, editor, preview } = startSettledSync();

    editor.userScroll(300);
    scheduler.runFrame();
    scheduler.advanceTime(60);
    editor.userScroll(600);
    scheduler.runFrame();

    // Past the release the first editor event armed, but within the one its last event re-armed.
    scheduler.advanceTime(60);
    preview.userScroll(900);
    scheduler.runFrame();

    expect(editor.writes).toEqual([]);
    expect(rounded(preview.writes)).toEqual([750, 1250]);

    // Once the editor has been quiet for the whole release delay, the preview can lead.
    scheduler.advanceTime(40);
    preview.userScroll(1500);
    scheduler.runFrame();

    expect(rounded(editor.writes)).toEqual([800]);
});

it('ignores a late echo of its own write after leadership is released', () => {
    const { scheduler, editor, preview } = startSettledSync();

    // The preview's content got shorter and its geometry change has not arrived yet, so the map
    // still aims at 3200 px and the browser clamps the write to 3000 px.
    preview.maxScrollTop = 3000;
    editor.userScroll(1600);
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([3200]);
    expect(preview.scrollTop).toBe(3000);

    // Leadership is released before the preview's scroll event for that write arrives.
    scheduler.advanceTime(100);
    scheduler.runFrame();

    // Had the echo taken the lead, this editor scroll would be ignored and the editor would move instead.
    editor.userScroll(600);
    scheduler.runFrame();

    expect(editor.writes).toEqual([]);
    expect(rounded(preview.writes)).toEqual([3200, 1250]);
});

it('follows a pane that returns in one step to the offset last written to it', () => {
    const top = startSettledSync();

    // The preview scrolls down and back up, so the editor is last written 0 px.
    top.preview.userScroll(1500);
    top.scheduler.runFrame();
    top.preview.userScroll(0);
    top.scheduler.runFrame();
    top.scheduler.advanceTime(100);

    // The editor scrolls down, then returns to its top in one step.
    top.editor.userScroll(400);
    top.scheduler.runFrame();
    top.scheduler.advanceTime(100);
    top.editor.userScroll(0);
    top.scheduler.runFrame();

    expect(rounded(top.editor.writes)).toEqual([800, 0]);
    expect(rounded(top.preview.writes)).toEqual([1000, 0]);

    const bottom = startSettledSync();

    // The editor reaches its bottom, so the preview is last written 3200 px.
    bottom.editor.userScroll(1600);
    bottom.scheduler.runFrame();
    bottom.scheduler.advanceTime(100);

    // The preview scrolls up, then returns to its bottom in one step.
    bottom.preview.userScroll(1500);
    bottom.scheduler.runFrame();
    bottom.preview.userScroll(3200);
    bottom.scheduler.runFrame();

    expect(rounded(bottom.preview.writes)).toEqual([3200]);
    expect(rounded(bottom.editor.writes)).toEqual([800, 1600]);
});

it('follows the editor back to its last synced offset after a layout change moved it away', () => {
    const { scheduler, editor, preview } = startSettledSync();

    // The preview leads, so the editor is last written 800 px; then leadership is released.
    preview.userScroll(1500);
    scheduler.runFrame();
    scheduler.advanceTime(100);

    // A narrower editor rewraps a line above the viewport onto four more rows. Monaco keeps line 41
    // at the top, so it reports 880 px while the realignment is pending.
    editor.lineTop = (lineNumber) => (lineNumber - 1) * 20 + (lineNumber > 5 ? 80 : 0);
    editor.documentBottom = 2080;
    editor.changeGeometry('layout');
    editor.userScroll(880);
    scheduler.runFrame();

    // The preview already shows the same place, so the realignment writes nothing.
    expect(preview.writes).toEqual([]);

    // Scrolling the editor up four lines lands on the offset it was last written.
    editor.userScroll(800);
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([1400]);
});

it('skips corrections smaller than one pixel', () => {
    const { scheduler, editor, preview } = startSettledSync();

    editor.userScroll(300);
    scheduler.runFrame();
    editor.userScroll(300.25);
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([750]);

    editor.userScroll(300.5);
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([750, 751.25]);
});

it('realigns the preview from the editor after the preview content changes', () => {
    const { scheduler, editor, preview } = startSettledSync({ editorScrollTop: 800 });
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([1500]);

    // The blocks move up and the content becomes too short for the current offset, which the
    // browser clamps and reports before the realignment frame.
    preview.replaceContent(
        [
            { line: 21, top: 500 },
            { line: 61, top: 1000 },
        ],
        1400,
    );
    preview.reportScroll();
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([1500, 750]);
    expect(editor.writes).toEqual([]);
});

it('keeps the preview in place and moves the editor when the preview changes while the user scrolls it', () => {
    const { scheduler, editor, preview } = startSettledSync();

    preview.userScroll(1500);
    scheduler.runFrame();

    expect(rounded(editor.writes)).toEqual([800]);

    // An image above the blocks finishes loading while the user is still scrolling the preview.
    scheduler.advanceTime(80);
    preview.replaceContent(
        [
            { line: 21, top: 1300 },
            { line: 61, top: 2300 },
        ],
        3500,
    );
    scheduler.runFrame();

    expect(rounded(editor.writes)).toEqual([800, 560]);

    // The change renewed the preview's lead, so an editor scroll past the first release is still ignored.
    scheduler.advanceTime(40);
    editor.userScroll(700);
    scheduler.runFrame();

    expect(preview.writes).toEqual([]);
    expect(preview.scrollTop).toBe(1500);
});

it('only invalidates the map when the editor content height changes', () => {
    const { scheduler, editor, preview } = startSettledSync({ editorScrollTop: 800 });
    scheduler.runFrame();

    // A long line pasted at line 5 wraps onto four more rows and pushes every later line down 80 px.
    editor.lineTop = (lineNumber) => (lineNumber - 1) * 20 + (lineNumber > 5 ? 80 : 0);
    editor.documentBottom = 2080;
    editor.changeGeometry('content');
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([1500]);

    editor.userScroll(1400);
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([1500, 2360]);
});

it('realigns after an editor layout change', () => {
    const { scheduler, editor, preview } = startSettledSync({ editorScrollTop: 800 });
    scheduler.runFrame();

    // The editor grows to an 800 px viewport, so it can now scroll only to 1200 px.
    editor.viewportHeight = 800;
    editor.changeGeometry('layout');
    scheduler.runFrame();

    expect(rounded(preview.writes)).toEqual([1500, 2100]);
    expect(editor.writes).toEqual([]);
});

it('stops scheduling and unsubscribes after dispose', () => {
    const { scheduler, editor, preview, controller } = startSettledSync();

    editor.userScroll(300);

    expect(scheduler.pendingFrames).toBeGreaterThan(0);
    expect(scheduler.pendingTimers).toBeGreaterThan(0);

    controller.dispose();

    expect(scheduler.pendingFrames).toBe(0);
    expect(scheduler.pendingTimers).toBe(0);
    expect(editor.listenerCount).toBe(0);
    expect(preview.listenerCount).toBe(0);

    scheduler.runFrame();
    scheduler.advanceTime(100);

    expect(preview.writes).toEqual([]);
    expect(editor.writes).toEqual([]);
});

it('measures the preview only once per frame no matter how many geometry changes arrive first', () => {
    const { scheduler, editor, preview } = startSettledSync();
    const measurementsAfterSettle = preview.measureSourceLinesCalls;

    // Two invalidations arrive back to back, before any frame has run; a lazy rebuild waits for
    // the frame that actually needs the map and coalesces both into a single measurement.
    editor.changeGeometry('layout');
    preview.changeGeometry('content');

    expect(preview.measureSourceLinesCalls).toBe(measurementsAfterSettle);

    scheduler.runFrame();

    expect(preview.measureSourceLinesCalls).toBe(measurementsAfterSettle + 1);
});
