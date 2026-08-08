import { createSlice } from '@reduxjs/toolkit';

import {
  applyStatePatch,
  hydrateProjection,
  resetProjection,
} from './appModelProjectionActions';
import type { DocumentMetadata } from './appModelTypes';

export interface DocumentsState {
  revision: number;
  tabSetRevision: number;
  orderedIds: string[];
  byId: Record<string, DocumentMetadata>;
  activeDocumentId: string | null;
}

const initialState: DocumentsState = {
  revision: -1,
  tabSetRevision: -1,
  orderedIds: [],
  byId: {},
  activeDocumentId: '',
};

function normalizeDocumentMetadata(
  document: DocumentMetadata,
): DocumentMetadata {
  return {
    documentId: document.documentId,
    title: document.title,
    path: document.path,
    dirty: document.dirty,
    encoding: document.encoding,
    lineEnding: document.lineEnding,
    wordCount: document.wordCount,
    displayName: document.displayName,
    parentName: document.parentName,
    contentRevision: document.contentRevision,
    capability: document.capability,
    sizeClass: document.sizeClass,
    detached: document.detached,
    view: {
      arrangement: document.view.arrangement,
      editorVisible: document.view.editorVisible,
      previewVisible: document.view.previewVisible,
      cursor: {
        line: document.view.cursor.line,
        column: document.view.cursor.column,
      },
      selection: {
        start: {
          line: document.view.selection.start.line,
          column: document.view.selection.start.column,
        },
        end: {
          line: document.view.selection.end.line,
          column: document.view.selection.end.column,
        },
      },
      scroll: {
        editor: document.view.scroll.editor,
        preview: document.view.scroll.preview,
      },
    },
  };
}

function normalizeDocuments(
  documents: Record<string, DocumentMetadata>,
): Record<string, DocumentMetadata> {
  return Object.fromEntries(
    Object.entries(documents).map(([documentId, document]) => [
      documentId,
      normalizeDocumentMetadata(document),
    ]),
  );
}

const documentsSlice = createSlice({
  name: 'documents',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(hydrateProjection, (state, action): void => {
        if (action.payload.revision <= state.revision) {
          return;
        }

        state.revision = action.payload.revision;
        state.tabSetRevision =
          action.payload.tabSetRevision ?? action.payload.revision;
        state.orderedIds =
          action.payload.orderedDocumentIds ??
          Object.keys(action.payload.documents);
        state.byId = normalizeDocuments(action.payload.documents);
        state.activeDocumentId = action.payload.activeDocumentId;
        if (action.payload.activeDocument !== undefined) {
          state.activeDocumentId = action.payload.activeDocument;
        }
      })
      .addCase(applyStatePatch, (state, action): void => {
        const patch = action.payload;
        if (patch.revision <= state.revision) {
          return;
        }

        state.revision = patch.revision;
        if (patch.tabSetRevision !== undefined) {
          state.tabSetRevision = patch.tabSetRevision;
        }
        if (patch.orderedDocumentIds !== undefined) {
          state.orderedIds = [...patch.orderedDocumentIds];
        }
        if (patch.documents !== undefined) {
          for (const documentId of patch.documents.remove ?? []) {
            delete state.byId[documentId];
          }
          Object.assign(
            state.byId,
            normalizeDocuments(patch.documents.upsert ?? {}),
          );
        }
        if (patch.activeDocumentId !== undefined) {
          state.activeDocumentId = patch.activeDocumentId;
        }
        if (patch.activeDocument !== undefined) {
          state.activeDocumentId = patch.activeDocument.present
            ? (patch.activeDocument.documentId ?? null)
            : null;
        }
      })
      .addCase(resetProjection, (): DocumentsState => initialState);
  },
});

export const documentsReducer = documentsSlice.reducer;
