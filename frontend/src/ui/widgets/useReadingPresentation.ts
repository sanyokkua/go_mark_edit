import { useEffect, useRef } from 'react';

import { useAppDispatch, useAppSelector } from '../../logic/store';
import { closeReadingOverlays, leaveReading } from '../../logic/store/readingSlice';

export interface ReadingPresentationOptions {
    reading: boolean;
    modalOpen: boolean;
    /** Focuses the rendered document; false when it is not shown yet. */
    focusDocument: () => boolean;
    /** Focuses the editor, used when the control focused before entry is gone. */
    focusEditor: () => void;
}

/**
 * Reading mode's window-level behaviour: Escape closes an open overlay first and then leaves it, unless a menu or dialog already handled the key,
 * focus moves to the rendered document on entry and back to the previous element on exit.
 */
export function useReadingPresentation({
    reading,
    modalOpen,
    focusDocument,
    focusEditor,
}: ReadingPresentationOptions): void {
    const dispatch = useAppDispatch();
    const overlayShown = useAppSelector((state) => state.reading.sidebarShown || state.reading.tabsShown);
    const previousFocus = useRef<HTMLElement | null>(null);
    const wasReading = useRef(false);

    useEffect((): (() => void) | undefined => {
        if (!reading || modalOpen) return undefined;
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (overlayShown) {
                event.preventDefault();
                dispatch(closeReadingOverlays());
                return;
            }
            dispatch(leaveReading());
        };
        window.addEventListener('keydown', onKeyDown);
        return (): void => window.removeEventListener('keydown', onKeyDown);
    }, [dispatch, modalOpen, overlayShown, reading]);

    useEffect((): void => {
        if (reading === wasReading.current) return;
        wasReading.current = reading;
        if (reading) {
            const active = document.activeElement;
            previousFocus.current = active instanceof HTMLElement && active !== document.body ? active : null;
            focusDocument();
            return;
        }
        const previous = previousFocus.current;
        previousFocus.current = null;
        if (previous !== null && previous.isConnected && previous.closest('[hidden]') === null) {
            previous.focus();
            return;
        }
        focusEditor();
    }, [focusDocument, focusEditor, reading]);
}
