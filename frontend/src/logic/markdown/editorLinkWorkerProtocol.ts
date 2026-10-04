import type { EditorLink } from './editorLinks';

export interface EditorLinkWorkerRequest {
    text: string;
}

export type EditorLinkWorkerReply = { type: 'links'; links: EditorLink[] } | { type: 'failed' };

export type EditorLinkExtraction = { kind: 'links'; links: EditorLink[] } | { kind: 'failed' } | { kind: 'cancelled' };
