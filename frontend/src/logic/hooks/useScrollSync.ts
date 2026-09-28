import { useEffect, useLayoutEffect, useRef } from 'react';

import { createPreviewScrollPort } from '../scrollSync/previewScrollPort';
import { createScrollSyncController } from '../scrollSync/scrollSyncController';
import type { EditorScrollPort, ScrollSyncPane } from '../scrollSync/scrollSyncTypes';

/**
 * Keeps the editor and the preview scrolled to the same place while both are
 * shown, and reports whether that is running.
 *
 * The minimum window width arrives as one hidden pane, and a paused preview as
 * no container, so neither needs naming here.
 */
export function useScrollSync(options: {
    enabled: boolean;
    editorPort: EditorScrollPort | null;
    editorVisible: boolean;
    previewContainer: HTMLElement | null;
    previewVisible: boolean;
}): boolean {
    const { enabled, editorPort, editorVisible, previewContainer, previewVisible } = options;
    const visibleEditorPort = editorVisible ? editorPort : null;
    const visiblePreviewContainer = previewVisible ? previewContainer : null;
    /** Synchronization runs only with the setting on and both panes shown and reporting. */
    const active = enabled && visibleEditorPort !== null && visiblePreviewContainer !== null;
    /** The pane that did not change last, which the other one is aligned to when synchronization starts. */
    const referenceRef = useRef<ScrollSyncPane>('editor');

    /*
     * When both panes change in one commit both effects below run, the
     * preview's runs second, and the editor is left as the reference — so the
     * preview is the pane that moves. That is deliberate, and the same
     * resolution as switching the setting on: the editor holds the caret and
     * the selection, so moving the preview instead never pulls the text out
     * from under the user.
     */
    useLayoutEffect((): void => {
        if (visibleEditorPort !== null) referenceRef.current = 'preview';
    }, [visibleEditorPort]);

    useLayoutEffect((): void => {
        if (visiblePreviewContainer !== null) referenceRef.current = 'editor';
    }, [visiblePreviewContainer]);

    useLayoutEffect((): void => {
        if (enabled) referenceRef.current = 'editor';
    }, [enabled]);

    useEffect((): (() => void) | undefined => {
        if (!active) return undefined;

        const preview = createPreviewScrollPort(visiblePreviewContainer);
        const controller = createScrollSyncController({
            editor: visibleEditorPort,
            preview,
            reference: referenceRef.current,
        });

        /*
         * The controller unsubscribes from both ports and drops its pending
         * frames; the preview port is this hook's own to dispose. The editor's
         * port belongs to the editor, which withdraws it when its activation
         * ends, and is never read from here once that has happened.
         */
        return (): void => {
            controller.dispose();
            preview.dispose();
        };
    }, [active, visibleEditorPort, visiblePreviewContainer]);

    return active;
}
