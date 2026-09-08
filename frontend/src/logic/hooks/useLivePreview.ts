import { useEffect, useRef, useState } from 'react';

import { appModelAdapter } from '../adapter';
import type { AcceptedBuffer } from '../adapter/appModelAdapter';
import type { ActiveBuffer } from '../store/appModelTypes';

export interface LivePreviewAdapter {
  subscribeAcceptedBuffers: (
    listener: (buffer: AcceptedBuffer) => void,
  ) => () => void;
}

interface PreviewSnapshot {
  content: string;
  documentId: string;
}

export function useLivePreview(
  activeBuffer: ActiveBuffer,
  adapter: LivePreviewAdapter = appModelAdapter,
): string {
  const acceptedGenerationRef = useRef(0);
  const [acceptedSnapshot, setAcceptedSnapshot] = useState<PreviewSnapshot>(
    () => ({
      documentId: activeBuffer.documentId,
      content: activeBuffer.content,
    }),
  );

  useEffect((): (() => void) => {
    const documentId = activeBuffer.documentId;
    acceptedGenerationRef.current = 0;
    let disposed = false;

    const unsubscribe = adapter.subscribeAcceptedBuffers(
      (buffer: AcceptedBuffer): void => {
        if (
          disposed ||
          buffer.documentId !== documentId ||
          buffer.generation <= acceptedGenerationRef.current
        ) {
          return;
        }

        acceptedGenerationRef.current = buffer.generation;
        setAcceptedSnapshot({
          documentId: buffer.documentId,
          content: buffer.content,
        });
      },
    );

    return (): void => {
      disposed = true;
      unsubscribe();
    };
  }, [activeBuffer.documentId, adapter]);

  return acceptedSnapshot.documentId === activeBuffer.documentId
    ? acceptedSnapshot.content
    : activeBuffer.content;
}
