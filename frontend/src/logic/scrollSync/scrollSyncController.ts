import { buildScrollMap, mapScrollTop } from './scrollMap';
import type { ScrollMap } from './scrollMap';
import type { EditorScrollPort, PreviewScrollPort, ScrollGeometryChange, ScrollSyncPane } from './scrollSyncTypes';

/** Frame and timer primitives the controller schedules all of its work with. */
export interface FrameScheduler {
    requestFrame(callback: () => void): number;
    cancelFrame(handle: number): void;
    setTimer(callback: () => void, delayMs: number): number;
    clearTimer(handle: number): void;
}

/** A running synchronization between one editor pane and one preview pane. */
export interface ScrollSyncController {
    /** Unsubscribes from both ports and cancels every pending frame and timer. */
    dispose(): void;
}

/** A pane's scroll event this close to the controller's last write to that pane is the write's echo. */
const ECHO_TOLERANCE_PX = 1;

/** A follower closer than this to its target stays where it is. */
const MIN_CORRECTION_PX = 1;

const animationFrameScheduler: FrameScheduler = {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: (handle) => window.clearTimeout(handle),
};

const otherPane = (pane: ScrollSyncPane): ScrollSyncPane => (pane === 'editor' ? 'preview' : 'editor');

/**
 * Keeps the editor and the preview scrolled to the same place in the document
 * through the block-level scroll map, without ever oscillating.
 *
 * - Settle: scroll events are ignored for `settleFrames` animation frames;
 *   then, on the first frame with a valid map, the pane that is not
 *   `reference` is aligned to `reference`.
 * - Leader lock: the first pane to report a scroll leads, each of its events
 *   re-arms a `leaderReleaseMs` release, and the other pane's events are
 *   ignored while a leader is held.
 * - Echo guard: a scroll event within 1 px of the controller's last write to
 *   that pane is ignored, even after the lock is released, until the pane
 *   reports an offset further from that write.
 * - Writes: at most one per animation frame, none under 1 px, always instant.
 * - Geometry: a preview change or an editor `'layout'` change invalidates the
 *   map, renews the lock and ignores scroll events until the next frame
 *   realigns the panes (the editor follows a leading preview, otherwise the
 *   preview follows the editor); an editor `'content'` change only
 *   invalidates the map, which is rebuilt lazily on the next frame that needs it.
 */
export function createScrollSyncController(options: {
    editor: EditorScrollPort;
    preview: PreviewScrollPort;
    reference: ScrollSyncPane;
    scheduler?: FrameScheduler;
    leaderReleaseMs?: number;
    settleFrames?: number;
}): ScrollSyncController {
    const {
        editor,
        preview,
        reference,
        scheduler = animationFrameScheduler,
        leaderReleaseMs = 100,
        settleFrames = 2,
    } = options;
    const ports = { editor, preview };

    let settleFramesLeft = settleFrames;
    // The settle alignment's source until the panes are first aligned or a pane leads.
    let settleSource: ScrollSyncPane | null = reference;
    // The pane the next frame aligns the other pane to.
    let alignSource: ScrollSyncPane | null = reference;
    let realignPending = false;
    let map: ScrollMap | null = null;
    let mapStale = true;
    let leader: ScrollSyncPane | null = null;
    let releaseTimer: number | null = null;
    let frame: number | null = null;
    const lastWrite: Record<ScrollSyncPane, number | null> = { editor: null, preview: null };

    function requestFrame(): void {
        if (frame === null) frame = scheduler.requestFrame(runFrame);
    }

    function runFrame(): void {
        frame = null;
        if (settleFramesLeft > 0) {
            settleFramesLeft -= 1;
            requestFrame();
            return;
        }

        realignPending = false;
        const source = alignSource;
        alignSource = null;
        if (source === null) return;

        const currentMap = readMap();
        if (currentMap === null) return;

        settleSource = null;
        align(currentMap, source);
    }

    function readMap(): ScrollMap | null {
        if (mapStale) {
            map = buildScrollMap({
                sourceLines: preview.measureSourceLines(),
                lineCount: editor.getLineCount(),
                lineTop: (lineNumber) => editor.getLineTop(lineNumber),
                editorMaxScrollTop: editor.getDocumentBottom() - editor.getViewportHeight(),
                previewMaxScrollTop: preview.getMaxScrollTop(),
            });
            mapStale = false;
        }
        return map;
    }

    function align(currentMap: ScrollMap, source: ScrollSyncPane): void {
        const follower = otherPane(source);
        const target = mapScrollTop(currentMap, source, ports[source].getScrollTop());
        if (Math.abs(target - ports[follower].getScrollTop()) < MIN_CORRECTION_PX) return;

        // Monaco reports its scroll inside setScrollTop, so the target is recorded before writing.
        lastWrite[follower] = target;
        ports[follower].setScrollTop(target);
        lastWrite[follower] = ports[follower].getScrollTop();
    }

    function holdLead(): void {
        if (releaseTimer !== null) scheduler.clearTimer(releaseTimer);
        releaseTimer = scheduler.setTimer(() => {
            releaseTimer = null;
            leader = null;
        }, leaderReleaseMs);
    }

    function handleScroll(pane: ScrollSyncPane, scrollTop: number): void {
        const written = lastWrite[pane];
        if (written !== null && Math.abs(scrollTop - written) <= ECHO_TOLERANCE_PX) return;
        // The pane has moved off the last write, so no later event from it can be that write's echo.
        lastWrite[pane] = null;

        if (settleFramesLeft > 0 || realignPending) return;
        if (leader !== null && leader !== pane) return;

        leader = pane;
        holdLead();
        settleSource = null;
        alignSource = pane;
        requestFrame();
    }

    function handleGeometryChange(pane: ScrollSyncPane, change: ScrollGeometryChange): void {
        mapStale = true;
        if (pane === 'editor' && change === 'content') return;

        if (leader !== null) holdLead();
        realignPending = true;
        alignSource = leader ?? settleSource ?? 'editor';
        requestFrame();
    }

    const unsubscribers = [
        editor.onScroll((scrollTop) => handleScroll('editor', scrollTop)),
        editor.onGeometryChange((change) => handleGeometryChange('editor', change)),
        preview.onScroll((scrollTop) => handleScroll('preview', scrollTop)),
        preview.onGeometryChange((change) => handleGeometryChange('preview', change)),
    ];
    requestFrame();

    return {
        dispose(): void {
            for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
            if (frame !== null) scheduler.cancelFrame(frame);
            if (releaseTimer !== null) scheduler.clearTimer(releaseTimer);
            frame = null;
            releaseTimer = null;
        },
    };
}
