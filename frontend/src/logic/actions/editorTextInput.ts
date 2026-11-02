/** Monaco's editing textarea, excluding its Find and Replace controls. */
export function isEditorTextInput(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLTextAreaElement &&
        target.matches('[data-editor-surface] .monaco-editor textarea.inputarea')
    );
}
