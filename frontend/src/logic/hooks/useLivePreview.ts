import { useEffect, useRef, useState } from 'react';

import { appModelAdapter } from '../adapter';
import type { AcceptedBuffer } from '../adapter/appModelAdapter';
import type { ActiveBuffer, OpenResult } from '../store/appModelTypes';
import { utf8ByteLength } from '../utils/utf8ByteLength';

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

export function useLivePreviewSnapshot(
    activeBuffer: ActiveBuffer,
    visible: boolean,
    adapter: LivePreviewAdapter = appModelAdapter,
): LivePreviewSnapshot {
    const sourceRevision = activeBuffer.documentRevision;
    const acceptedGenerationRef = useRef(0);
    const [measurement, setMeasurement] = useState<{ content: string; byteLength: number } | null>(null);
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

    let size = measurement?.content === current.content ? measurement.byteLength : 0;
    if (visible && measurement?.content !== current.content) {
        size = utf8ByteLength(current.content);
        setMeasurement({ content: current.content, byteLength: size });
    }

    return {
        ...current,
        byteLength: size,
    };
}

export function useLivePreview(
    activeBuffer: ActiveBuffer,
    visible: boolean,
    adapter: LivePreviewAdapter = appModelAdapter,
): string {
    return useLivePreviewSnapshot(activeBuffer, visible, adapter).content;
}
