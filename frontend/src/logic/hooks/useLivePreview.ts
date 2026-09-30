import { useEffect, useRef, useState } from 'react';

import { appModelAdapter } from '../adapter';
import type { AcceptedBuffer } from '../adapter/appModelAdapter';
import type { ActiveBuffer, OpenResult } from '../store/appModelTypes';

export interface LivePreviewAdapter {
    subscribeAcceptedBuffers: (listener: (buffer: AcceptedBuffer) => void) => () => void;
    openPreviewLink?: (documentId: string, href: string) => Promise<OpenResult>;
    openExternalLink?: (href: string) => void;
    resolvePreviewImage?: (documentId: string, source: string) => string;
}

interface PreviewSnapshot {
    content: string;
    documentId: string;
    revision: number;
}

interface PreviewState {
    accepted: PreviewSnapshot;
    source: PreviewSnapshot;
}

export interface LivePreviewSnapshot {
    byteLength: number;
    content: string;
    documentId: string;
    revision: number;
}

function byteLength(content: string): number {
    let size = 0;
    for (const character of content) {
        const codePoint = character.codePointAt(0) ?? 0;
        size += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    }
    return size;
}

export function useLivePreviewSnapshot(
    activeBuffer: ActiveBuffer,
    adapter: LivePreviewAdapter = appModelAdapter,
): LivePreviewSnapshot {
    const sourceRevision = activeBuffer.documentRevision ?? 0;
    const acceptedGenerationRef = useRef(0);
    const [previewState, setPreviewState] = useState<PreviewState>(() => {
        const source = {
            documentId: activeBuffer.documentId,
            content: activeBuffer.content,
            revision: sourceRevision,
        };
        return { accepted: source, source };
    });

    const sourceChanged =
        previewState.source.documentId !== activeBuffer.documentId ||
        previewState.source.content !== activeBuffer.content ||
        previewState.source.revision !== sourceRevision;
    // Reset accepted edits for each authoritative installation, including A → B → A.
    if (sourceChanged) {
        const source = {
            documentId: activeBuffer.documentId,
            content: activeBuffer.content,
            revision: sourceRevision,
        };
        setPreviewState({ accepted: source, source });
    }

    useEffect((): (() => void) => {
        const documentId = activeBuffer.documentId;
        const sourceContent = activeBuffer.content;
        acceptedGenerationRef.current = 0;
        let disposed = false;

        const unsubscribe = adapter.subscribeAcceptedBuffers((buffer: AcceptedBuffer): void => {
            if (disposed || buffer.documentId !== documentId || buffer.generation <= acceptedGenerationRef.current) {
                return;
            }

            acceptedGenerationRef.current = buffer.generation;
            setPreviewState((current) =>
                current.source.documentId === documentId &&
                current.source.content === sourceContent &&
                current.source.revision === sourceRevision
                    ? {
                          ...current,
                          accepted: {
                              documentId: buffer.documentId,
                              content: buffer.content,
                              revision: buffer.generation,
                          },
                      }
                    : current,
            );
        });

        return (): void => {
            disposed = true;
            unsubscribe();
        };
    }, [activeBuffer.content, activeBuffer.documentId, adapter, sourceRevision]);

    const current = !sourceChanged
        ? previewState.accepted
        : {
              documentId: activeBuffer.documentId,
              content: activeBuffer.content,
              revision: sourceRevision,
          };

    return {
        ...current,
        byteLength: byteLength(current.content),
    };
}

export function useLivePreview(activeBuffer: ActiveBuffer, adapter: LivePreviewAdapter = appModelAdapter): string {
    return useLivePreviewSnapshot(activeBuffer, adapter).content;
}
