import { Suspense, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

import type { LivePreviewAdapter } from '../../logic/hooks/useLivePreview';
import { isMarkdownStandard } from '../../logic/markdown/pipeline';
import { useAppSelector } from '../../logic/store';
import { useAppearanceSettings } from './appearanceSettingsContext';
import LazyMarkdownView from './LazyMarkdownView';
import { resolvePreviewImageSource } from './previewImageSource';
import styles from './PrintDocument.module.css';

/** One export: the exact text of the document at the moment the user asked for it. */
export interface PrintRequest {
    documentId: string;
    documentPath: string;
    /** The name the print dialog suggests (the document's file name without its extension), if it has one. */
    fileName?: string;
    id: number;
    text: string;
}

export interface PrintDocumentProps {
    linkAdapter?: Pick<LivePreviewAdapter, 'resolvePreviewImage'>;
    request: PrintRequest | null;
}

/**
 * The hidden print copy: the preview renderer on a fixed text snapshot, portaled
 * next to the application root so print rules can show it alone.
 */
const PrintDocument: React.FC<PrintDocumentProps> = ({ linkAdapter, request }: PrintDocumentProps) => {
    const { appearance } = useAppearanceSettings();
    const storedStandard = useAppSelector((state) => state.settings.markdown?.standard);
    const standard = storedStandard !== undefined && isMarkdownStandard(storedStandard) ? storedStandard : undefined;
    const documentId = request?.documentId;
    const documentPath = request?.documentPath;
    const resolveImageSource = useCallback(
        (source: string): string | undefined =>
            resolvePreviewImageSource(source, documentId, documentPath, linkAdapter),
        [documentId, documentPath, linkAdapter],
    );

    // The print dialog derives its suggested file name from the page title; the
    // copy's lifetime bounds the change because no platform reports print completion.
    const fileName = request?.fileName;
    useEffect((): (() => void) | undefined => {
        if (fileName === undefined) return undefined;
        const previous = document.title;
        document.title = fileName;
        return (): void => {
            document.title = previous;
        };
    }, [fileName, request?.id]);

    if (request === null) return null;
    return createPortal(
        <div
            className={styles.printCopy}
            data-print-appearance={appearance.pdfAppearance}
            data-print-copy=""
            data-print-request={request.id}
        >
            {standard === undefined ? (
                <span data-print-pending="" />
            ) : (
                <Suspense fallback={<span data-print-pending="" />}>
                    <LazyMarkdownView
                        documentId={request.documentId}
                        documentPath={request.documentPath}
                        imageSourceResolver={resolveImageSource}
                        source={request.text}
                        standard={standard}
                    />
                </Suspense>
            )}
        </div>,
        document.body,
    );
};

export default PrintDocument;
