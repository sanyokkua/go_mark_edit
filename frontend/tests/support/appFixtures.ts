import type { ConflictPreview, DocumentMetadata } from '../../src/logic/store/appModelTypes';

export function documentFixture(documentId = 'one', contentRevision = 0): DocumentMetadata {
    return {
        documentId,
        contentRevision,
        title: `${documentId}.md`,
        displayName: `${documentId}.md`,
        path: `/documents/${documentId}.md`,
        dirty: true,
        encoding: 'utf-8',
        lineEnding: 'lf',
        wordCount: 1,
        capability: 'writable',
        status: 'unsaved-changes',
        view: {
            arrangement: 'editor',
            editorVisible: true,
            previewVisible: false,
            cursor: { line: 1, column: 1 },
            selection: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
            scroll: { editor: 0, preview: 0 },
        },
    };
}

export function conflictFixture(documentId = 'one', contentRevision = 0): ConflictPreview {
    return {
        documentId,
        contentRevision,
        path: `/documents/${documentId}.md`,
        displayName: `${documentId}.md`,
        detectedDiskVersion: { exists: true, size: 5, mode: 420, modifiedUnixNano: '200' },
        readOnly: false,
        onDisk: { text: 'disk\n', byteCount: 5, lineCount: 1, truncated: false },
        yours: { text: 'mine\n', byteCount: 5, lineCount: 1, truncated: false },
    };
}
