import { useAppSelector } from '../store';

/**
 * Whether the active document's editor is on screen: a document is open, its
 * editor pane is visible (not the Preview arrangement) and Reading mode is off.
 * Surfaces pass the result to `getActionAvailability` as `editorShown`.
 */
export function useEditorShown(): boolean {
    return useAppSelector((state) => {
        const { activeDocumentId, byId } = state.documents;
        const document = activeDocumentId === null ? undefined : byId[activeDocumentId];
        return document !== undefined && document.view.editorVisible && !state.reading.active;
    });
}
