import { extractEditorLinks } from './editorLinks';
import type { EditorLinkWorkerReply, EditorLinkWorkerRequest } from './editorLinkWorkerProtocol';

self.addEventListener('message', (event: MessageEvent<EditorLinkWorkerRequest>) => {
    let reply: EditorLinkWorkerReply;
    try {
        reply = { type: 'links', links: extractEditorLinks(event.data.text) };
    } catch {
        reply = { type: 'failed' };
    }
    self.postMessage(reply);
});
