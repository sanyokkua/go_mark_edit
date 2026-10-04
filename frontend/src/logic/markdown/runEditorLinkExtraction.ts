import { createEditorLinkWorker } from './editorLinkWorkerFactory';
import type { EditorLinkExtraction, EditorLinkWorkerReply, EditorLinkWorkerRequest } from './editorLinkWorkerProtocol';

/** An obsolete Full parse is stopped by terminating its dedicated worker. */
export function runEditorLinkExtraction(text: string, signal: AbortSignal): Promise<EditorLinkExtraction> {
    if (signal.aborted) return Promise.resolve({ kind: 'cancelled' });
    let worker: Worker;
    try {
        worker = createEditorLinkWorker();
    } catch {
        console.warn('Editor links unavailable: Markdown link worker could not start.');
        return Promise.resolve({ kind: 'failed' });
    }
    return new Promise<EditorLinkExtraction>((resolve) => {
        let settled = false;
        const finish = (result: EditorLinkExtraction, reason?: string): void => {
            if (settled) return;
            settled = true;
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onWorkerError);
            worker.removeEventListener('messageerror', onMessageError);
            signal.removeEventListener('abort', onAbort);
            worker.terminate();
            // Fixed text only: neither document content nor raw worker errors belong in diagnostics.
            if (reason !== undefined) console.warn(reason);
            resolve(result);
        };
        const onMessage = (event: MessageEvent<EditorLinkWorkerReply>): void => {
            if (event.data.type === 'links') finish({ kind: 'links', links: event.data.links });
            else finish({ kind: 'failed' }, 'Editor links unavailable: Markdown link extraction failed.');
        };
        const onWorkerError = (): void =>
            finish({ kind: 'failed' }, 'Editor links unavailable: Markdown link worker failed.');
        const onMessageError = (): void =>
            finish({ kind: 'failed' }, 'Editor links unavailable: Markdown link worker reply could not be decoded.');
        const onAbort = (): void => finish({ kind: 'cancelled' });
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onWorkerError);
        worker.addEventListener('messageerror', onMessageError);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) {
            onAbort();
            return;
        }
        try {
            worker.postMessage({ text } satisfies EditorLinkWorkerRequest);
        } catch {
            finish({ kind: 'failed' }, 'Editor links unavailable: Markdown link request could not be sent.');
        }
    });
}
