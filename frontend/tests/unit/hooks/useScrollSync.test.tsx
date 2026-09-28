import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';

import { useScrollSync } from '../../../src/logic/hooks/useScrollSync';
import type { EditorScrollPort, ScrollGeometryChange } from '../../../src/logic/scrollSync/scrollSyncTypes';

const FRAME_MS = 16;
const PREVIEW_CLIENT_HEIGHT = 400;
const PREVIEW_SCROLL_HEIGHT = 3000;

interface SyncProps {
    enabled: boolean;
    editorPort: EditorScrollPort | null;
    editorVisible: boolean;
    previewContainer: HTMLElement | null;
    previewVisible: boolean;
}

function rectAt(top: number): DOMRect {
    return {
        bottom: top,
        height: 0,
        left: 0,
        right: 0,
        toJSON: (): Record<string, never> => ({}),
        top,
        width: 0,
        x: 0,
        y: top,
    };
}

/**
 * The editor of a 99-line document, as synchronized scrolling sees it: 20 px
 * lines under 12 px of padding, in a 300 px viewport, so it scrolls to 1704 px.
 */
class FakeEditorPort implements EditorScrollPort {
    scrollTop = 0;
    private readonly scrollListeners = new Set<(scrollTop: number) => void>();
    private readonly geometryListeners = new Set<(change: ScrollGeometryChange) => void>();

    getScrollTop(): number {
        return this.scrollTop;
    }

    /** Monaco reports the new offset synchronously, inside the call. */
    setScrollTop(scrollTop: number): void {
        this.scrollTop = scrollTop;
        this.report();
    }

    getViewportHeight(): number {
        return 300;
    }

    getLineCount(): number {
        return 99;
    }

    getLineTop(lineNumber: number): number {
        return 12 + (lineNumber - 1) * 20;
    }

    getDocumentBottom(): number {
        return 2004;
    }

    onScroll(listener: (scrollTop: number) => void): () => void {
        this.scrollListeners.add(listener);

        return (): void => {
            this.scrollListeners.delete(listener);
        };
    }

    onGeometryChange(listener: (change: ScrollGeometryChange) => void): () => void {
        this.geometryListeners.add(listener);

        return (): void => {
            this.geometryListeners.delete(listener);
        };
    }

    /** The user scrolls the editor. */
    userScroll(scrollTop: number): void {
        this.scrollTop = scrollTop;
        this.report();
    }

    get listenerCount(): number {
        return this.scrollListeners.size + this.geometryListeners.size;
    }

    private report(): void {
        for (const listener of [...this.scrollListeners]) listener(this.scrollTop);
    }
}

/**
 * The same document rendered: each odd source line starts 30 px further down
 * the content, which scrolls to 2600 px. Editor 412 px and preview 600 px are
 * the same place — the block of line 21.
 */
function createPreviewContainer(scrollTop = 0): HTMLElement {
    const container = document.createElement('div');
    let offset = scrollTop;
    container.getBoundingClientRect = (): DOMRect => rectAt(0);
    Object.defineProperties(container, {
        clientHeight: { configurable: true, get: (): number => PREVIEW_CLIENT_HEIGHT },
        scrollHeight: { configurable: true, get: (): number => PREVIEW_SCROLL_HEIGHT },
        scrollTop: {
            configurable: true,
            get: (): number => offset,
            set: (next: number): void => {
                offset = Math.min(Math.max(next, 0), PREVIEW_SCROLL_HEIGHT - PREVIEW_CLIENT_HEIGHT);
            },
        },
    });

    for (let line = 1; line <= 99; line += 2) {
        const block = document.createElement('p');
        const contentTop = (line - 1) * 30;
        block.setAttribute('data-source-line', String(line));
        block.getBoundingClientRect = (): DOMRect => rectAt(contentTop - container.scrollTop);
        container.append(block);
    }

    document.body.append(container);

    return container;
}

/** Lets the panes settle and the first alignment run. */
function settle(): void {
    act((): void => {
        jest.advanceTimersByTime(FRAME_MS * 3);
    });
}

function runFrame(): void {
    act((): void => {
        jest.advanceTimersByTime(FRAME_MS);
    });
}

beforeEach((): void => {
    jest.useFakeTimers();
});

afterEach((): void => {
    jest.useRealTimers();
    document.body.innerHTML = '';
});

it('synchronizes only when the setting is on and both panes are visible and ready', () => {
    const cases: Array<{ name: string; overrides: Partial<SyncProps> }> = [
        { name: 'everything ready', overrides: {} },
        { name: 'the setting is off', overrides: { enabled: false } },
        { name: 'the editor is hidden', overrides: { editorVisible: false } },
        { name: 'the preview is hidden', overrides: { previewVisible: false } },
        { name: 'the editor has no port yet', overrides: { editorPort: null } },
        { name: 'the preview is paused', overrides: { previewContainer: null } },
    ];
    const results = cases.map(({ name, overrides }) => {
        const editorPort = new FakeEditorPort();
        const previewContainer = createPreviewContainer();
        const { result, unmount } = renderHook(() =>
            useScrollSync({
                enabled: true,
                editorPort,
                editorVisible: true,
                previewContainer,
                previewVisible: true,
                ...overrides,
            }),
        );
        settle();

        act((): void => {
            editorPort.userScroll(412);
        });
        runFrame();

        const observed = { name, active: result.current, previewScrollTop: previewContainer.scrollTop };
        unmount();

        return observed;
    });

    expect(results).toEqual([
        { name: 'everything ready', active: true, previewScrollTop: 600 },
        { name: 'the setting is off', active: false, previewScrollTop: 0 },
        { name: 'the editor is hidden', active: false, previewScrollTop: 0 },
        { name: 'the preview is hidden', active: false, previewScrollTop: 0 },
        { name: 'the editor has no port yet', active: false, previewScrollTop: 0 },
        { name: 'the preview is paused', active: false, previewScrollTop: 0 },
    ]);
});

it('aligns the editor to the preview when the editor becomes available last', () => {
    // An activation: the preview is restored to where the document was left, and Monaco arrives after it.
    const arriving = new FakeEditorPort();
    const restoredPreview = createPreviewContainer(600);
    const activation: SyncProps = {
        enabled: true,
        editorPort: null,
        editorVisible: true,
        previewContainer: restoredPreview,
        previewVisible: true,
    };
    const { rerender } = renderHook((props: SyncProps) => useScrollSync(props), { initialProps: activation });
    settle();

    rerender({ ...activation, editorPort: arriving });
    settle();

    expect(arriving.scrollTop).toBe(412);
    expect(restoredPreview.scrollTop).toBe(600);

    // Preview to Split: the editor keeps its port while hidden, and the preview re-renders meanwhile.
    const shown = new FakeEditorPort();
    const hidden: SyncProps = {
        enabled: true,
        editorPort: shown,
        editorVisible: false,
        previewContainer: createPreviewContainer(600),
        previewVisible: true,
    };
    const editorShown = renderHook((props: SyncProps) => useScrollSync(props), { initialProps: hidden });
    settle();

    const rerenderedPreview = createPreviewContainer(600);
    editorShown.rerender({ ...hidden, previewContainer: rerenderedPreview });
    settle();
    editorShown.rerender({ ...hidden, previewContainer: rerenderedPreview, editorVisible: true });
    settle();

    expect(shown.scrollTop).toBe(412);
    expect(rerenderedPreview.scrollTop).toBe(600);
});

it('aligns the preview to the editor when the preview becomes available last', () => {
    // Editor to Split: the editor is already scrolled when the preview is first rendered.
    const editorPort = new FakeEditorPort();
    editorPort.scrollTop = 412;
    const opening: SyncProps = {
        enabled: true,
        editorPort,
        editorVisible: true,
        previewContainer: null,
        previewVisible: true,
    };
    const { rerender } = renderHook((props: SyncProps) => useScrollSync(props), { initialProps: opening });
    settle();

    const renderedPreview = createPreviewContainer();
    rerender({ ...opening, previewContainer: renderedPreview });
    settle();

    expect(renderedPreview.scrollTop).toBe(600);
    expect(editorPort.scrollTop).toBe(412);

    // The minimum width, where the preview is kept but hidden, and a fresh activation arrives meanwhile.
    const narrowPreview = createPreviewContainer();
    const narrow: SyncProps = {
        enabled: true,
        editorPort: new FakeEditorPort(),
        editorVisible: true,
        previewContainer: narrowPreview,
        previewVisible: false,
    };
    const widened = renderHook((props: SyncProps) => useScrollSync(props), { initialProps: narrow });
    settle();

    const reactivated = new FakeEditorPort();
    reactivated.scrollTop = 412;
    widened.rerender({ ...narrow, editorPort: reactivated });
    settle();
    widened.rerender({ ...narrow, editorPort: reactivated, previewVisible: true });
    settle();

    expect(narrowPreview.scrollTop).toBe(600);
    expect(reactivated.scrollTop).toBe(412);
});

it('aligns the preview to the editor when the setting is switched on', () => {
    const editorPort = new FakeEditorPort();
    editorPort.scrollTop = 412;
    // The panes were free to drift apart while the setting was off.
    const previewContainer = createPreviewContainer(900);
    const off: SyncProps = {
        enabled: false,
        editorPort: null,
        editorVisible: true,
        previewContainer,
        previewVisible: true,
    };
    const { rerender } = renderHook((props: SyncProps) => useScrollSync(props), { initialProps: off });
    settle();

    // Monaco arrives while the setting is still off, so the editor is the pane that changed last.
    rerender({ ...off, editorPort });
    settle();

    rerender({ ...off, editorPort, enabled: true });
    settle();

    expect(previewContainer.scrollTop).toBe(600);
    expect(editorPort.scrollTop).toBe(412);
});

it('stops synchronizing when a pane hides or the preview pauses', () => {
    const cases: Array<{ name: string; change: Partial<SyncProps> }> = [
        { name: 'the editor hides', change: { editorVisible: false } },
        { name: 'the preview hides', change: { previewVisible: false } },
        { name: 'the preview pauses', change: { previewContainer: null } },
    ];
    const results = cases.map(({ name, change }) => {
        const editorPort = new FakeEditorPort();
        const previewContainer = createPreviewContainer();
        const shown: SyncProps = {
            enabled: true,
            editorPort,
            editorVisible: true,
            previewContainer,
            previewVisible: true,
        };
        const { result, rerender } = renderHook((props: SyncProps) => useScrollSync(props), { initialProps: shown });
        settle();

        act((): void => {
            editorPort.userScroll(412);
        });
        runFrame();
        const whileSynchronized = previewContainer.scrollTop;

        rerender({ ...shown, ...change });
        settle();

        act((): void => {
            editorPort.userScroll(812);
        });
        runFrame();
        const previewAfterEditorScroll = previewContainer.scrollTop;

        act((): void => {
            previewContainer.scrollTop = 1500;
            previewContainer.dispatchEvent(new Event('scroll'));
        });
        runFrame();

        return {
            name,
            active: result.current,
            editorListeners: editorPort.listenerCount,
            editorScrollTop: editorPort.scrollTop,
            previewAfterEditorScroll,
            whileSynchronized,
        };
    });

    expect(results).toEqual([
        {
            name: 'the editor hides',
            active: false,
            editorListeners: 0,
            editorScrollTop: 812,
            previewAfterEditorScroll: 600,
            whileSynchronized: 600,
        },
        {
            name: 'the preview hides',
            active: false,
            editorListeners: 0,
            editorScrollTop: 812,
            previewAfterEditorScroll: 600,
            whileSynchronized: 600,
        },
        {
            name: 'the preview pauses',
            active: false,
            editorListeners: 0,
            editorScrollTop: 812,
            previewAfterEditorScroll: 600,
            whileSynchronized: 600,
        },
    ]);
});

it('creates and disposes cleanly when StrictMode runs effects twice', () => {
    const editorPort = new FakeEditorPort();
    const previewContainer = createPreviewContainer();
    const { unmount } = renderHook(
        () =>
            useScrollSync({
                enabled: true,
                editorPort,
                editorVisible: true,
                previewContainer,
                previewVisible: true,
            }),
        { wrapper: StrictMode },
    );
    settle();

    // StrictMode mounts, tears down and remounts every effect once; a leaked first pass would double these.
    expect(editorPort.listenerCount).toBe(2);

    act((): void => {
        editorPort.userScroll(412);
    });
    runFrame();

    expect(previewContainer.scrollTop).toBe(600);

    unmount();

    expect(editorPort.listenerCount).toBe(0);
});
