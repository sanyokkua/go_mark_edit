/** One of the two panes that synchronized scrolling keeps aligned. */
export type ScrollSyncPane = 'editor' | 'preview';

/** Whether a pane's content or its layout changed its scroll geometry. */
export type ScrollGeometryChange = 'content' | 'layout';

/** Subscriptions every scroll port offers; each returns the function that unsubscribes the listener. */
export interface ScrollPaneEvents {
    /**
     * Calls `listener` with the pane's current scroll offset at the moment each
     * event is delivered, never a buffered or older value: the synchronization
     * controller's echo guard compares that offset with what it last wrote, and
     * a stale one makes the guard swallow a real scroll.
     */
    onScroll(listener: (scrollTop: number) => void): () => void;
    onGeometryChange(listener: (change: ScrollGeometryChange) => void): () => void;
}

/** The editor pane as synchronized scrolling sees it; every offset is in pixels from the document top. */
export interface EditorScrollPort extends ScrollPaneEvents {
    getScrollTop(): number;
    setScrollTop(scrollTop: number): void;
    getViewportHeight(): number;
    getLineCount(): number;
    getLineTop(lineNumber: number): number;
    getDocumentBottom(): number;
}

/** A rendered preview block's one-based Markdown source line and its pixel offset in the preview's content. */
export interface SourceLineOffset {
    readonly line: number;
    readonly top: number;
}

/** The preview pane as synchronized scrolling sees it; every offset is in pixels from the content top. */
export interface PreviewScrollPort extends ScrollPaneEvents {
    getScrollTop(): number;
    setScrollTop(scrollTop: number): void;
    getMaxScrollTop(): number;
    measureSourceLines(): readonly SourceLineOffset[];
    dispose(): void;
}
