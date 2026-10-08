import type { LivePreviewAdapter } from '../../logic/hooks/useLivePreview';
import { classifyImageSource } from '../../logic/markdown/imagePolicy';

/**
 * The URL a Markdown image is shown from: only a local image of a known document
 * resolves; remote and refused sources get none, so the renderer shows its placeholder.
 */
export function resolvePreviewImageSource(
    source: string,
    documentId: string | undefined,
    documentPath: string | undefined,
    linkAdapter: Pick<LivePreviewAdapter, 'resolvePreviewImage'> | undefined,
): string | undefined {
    const classified = classifyImageSource(source, documentPath);
    if (classified.kind !== 'local' || documentId === undefined) {
        return undefined;
    }
    return linkAdapter?.resolvePreviewImage?.(documentId, classified.source);
}
