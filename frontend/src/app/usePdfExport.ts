import { useCallback, useEffect, useRef, useState } from 'react';

import { appModelAdapter, windowAdapter } from '../logic/adapter';
import { fileStemOf } from '../ui/widgets/tabLabel';
import type { PrintRequest } from '../ui/widgets/PrintDocument';
import type { DocumentSession } from './useDocumentSession';

const POLL_INTERVAL_MS = 100;
const WAIT_CAP_MS = 10_000;

/**
 * The copy of this request is mounted, its lazily loaded renderer has committed,
 * no diagram is still rendering and every image has finished loading (or failed).
 */
function printCopyIsReady(requestId: number): boolean {
    const copy = document.querySelector(`[data-print-copy][data-print-request="${requestId}"]`);
    return (
        copy !== null &&
        copy.querySelector('[data-print-pending], [data-mermaid-state="pending"]') === null &&
        [...copy.querySelectorAll('img')].every((image) => image.complete)
    );
}

const sleep = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });

export interface PdfExport {
    exportPdf: () => Promise<void>;
    /** The hidden print copy to mount, or null while none exists. */
    request: PrintRequest | null;
}

/**
 * Export to PDF: mounts a hidden print copy of the active document's flushed
 * text, waits until it has rendered, with diagrams drawn and images loaded (at most 10 s), then opens the print dialog.
 */
export function usePdfExport(session: Pick<DocumentSession, 'activeBuffer' | 'activeDocument'>): PdfExport {
    const [request, setRequest] = useState<PrintRequest | null>(null);
    const activeDocumentId = session.activeDocument?.documentId;
    const exportedDocumentId = session.activeBuffer?.documentId;
    const waiting = useRef(false);
    const nextId = useRef(0);
    const currentId = useRef<number | null>(null);

    // A copy never outlives the document it was made for.
    if (request !== null && request.documentId !== activeDocumentId) {
        setRequest(null);
    }

    useEffect(
        (): (() => void) => () => {
            currentId.current = null;
        },
        [],
    );

    useEffect((): void => {
        if (currentId.current !== null && request?.id !== currentId.current) currentId.current = null;
    }, [request]);

    const exportPdf = useCallback(async (): Promise<void> => {
        if (waiting.current || exportedDocumentId === undefined) return;
        waiting.current = true;
        try {
            await appModelAdapter.flushActiveSession?.(exportedDocumentId);
            const state = await appModelAdapter.getState();
            if (state.activeBuffer?.documentId !== exportedDocumentId) return;

            const id = (nextId.current += 1);
            currentId.current = id;
            const documentPath = state.snapshot.documents[exportedDocumentId]?.path ?? '';
            setRequest({
                documentId: exportedDocumentId,
                documentPath,
                fileName: fileStemOf(documentPath),
                id,
                text: state.activeBuffer.content,
            });

            const startedAt = Date.now();
            while (!printCopyIsReady(id) && Date.now() - startedAt < WAIT_CAP_MS) {
                await sleep(POLL_INTERVAL_MS);
                if (currentId.current !== id) return;
            }
            if (currentId.current !== id) return;
            await windowAdapter.printWindow();
        } catch {
            // The adapter has already shown a failure as a notification.
        } finally {
            waiting.current = false;
        }
    }, [exportedDocumentId]);

    return { exportPdf, request };
}
