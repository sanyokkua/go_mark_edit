/// <reference lib="webworker" />

import { extractEditorLinks } from './editorLinks';
import type { EditorLinkWorkerReply, EditorLinkWorkerRequest } from './editorLinkWorkerProtocol';

declare const self: DedicatedWorkerGlobalScope;

self.addEventListener('message', (event: MessageEvent<EditorLinkWorkerRequest>) => {
    let reply: EditorLinkWorkerReply;
    try {
        reply = { type: 'links', links: extractEditorLinks(event.data.text) };
    } catch {
        reply = { type: 'failed' };
    }
    self.postMessage(reply);
});
