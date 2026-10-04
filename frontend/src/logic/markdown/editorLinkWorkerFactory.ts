import EditorLinkWorker from './editorLinkWorker?worker';

/** Vite emits this as a worker dedicated to editor-link extraction. */
export function createEditorLinkWorker(): Worker {
    return new EditorLinkWorker();
}
