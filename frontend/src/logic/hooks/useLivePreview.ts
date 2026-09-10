import { useEffect, useRef, useState } from 'react';

import { appModelAdapter } from '../adapter';
import type { AcceptedBuffer } from '../adapter/appModelAdapter';
import type { ActiveBuffer, OpenResult } from '../store/appModelTypes';

export interface LivePreviewAdapter {
  subscribeAcceptedBuffers: (
    listener: (buffer: AcceptedBuffer) => void,
  ) => () => void;
  openPreviewLink?: (documentId: string, href: string) => Promise<OpenResult>;
  openExternalLink?: (href: string) => void;
  resolvePreviewImage?: (documentId: string, source: string) => string;
}

interface PreviewSnapshot {
  content: string;
  documentId: string;
  revision: number;
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
    size +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return size;
}

export function useLivePreviewSnapshot(
  activeBuffer: ActiveBuffer,
  adapter: LivePreviewAdapter = appModelAdapter,
): LivePreviewSnapshot {
  const acceptedGenerationRef = useRef(0);
  const [acceptedSnapshot, setAcceptedSnapshot] = useState<PreviewSnapshot>(
    () => ({
      documentId: activeBuffer.documentId,
      content: activeBuffer.content,
      revision: activeBuffer.documentRevision ?? 0,
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
          revision: buffer.generation,
        });
      },
    );

    return (): void => {
      disposed = true;
      unsubscribe();
    };
  }, [activeBuffer.documentId, adapter]);

  const current =
    acceptedSnapshot.documentId === activeBuffer.documentId
      ? acceptedSnapshot
      : {
          documentId: activeBuffer.documentId,
          content: activeBuffer.content,
          revision: activeBuffer.documentRevision ?? 0,
        };

  return {
    ...current,
    byteLength: byteLength(current.content),
  };
}

export function useLivePreview(
  activeBuffer: ActiveBuffer,
  adapter: LivePreviewAdapter = appModelAdapter,
): string {
  return useLivePreviewSnapshot(activeBuffer, adapter).content;
}
