import { createAsyncThunk } from '@reduxjs/toolkit';

import { appModelAdapter } from '../adapter';
import type { WireError } from '../utils/parseError';
import { parseError } from '../utils/parseError';
import type { RootState } from './index';
import type {
  DocViewInput,
  DocumentView,
  ViewArrangement,
} from './appModelTypes';

function docViewInputForArrangement(
  view: DocumentView,
  arrangement: ViewArrangement,
): DocViewInput {
  return {
    editorVisible: arrangement !== 'preview',
    previewVisible: arrangement !== 'editor',
    cursor: { ...view.cursor },
    selection: {
      start: { ...view.selection.start },
      end: { ...view.selection.end },
    },
    scroll: { ...view.scroll },
  };
}

function arrangementIntent(arrangement: ViewArrangement): {
  editorVisible: boolean;
  previewVisible: boolean;
} {
  return {
    editorVisible: arrangement !== 'preview',
    previewVisible: arrangement !== 'editor',
  };
}

function docViewInputForPaneVisibility(
  view: DocumentView,
  editorVisible: boolean,
  previewVisible: boolean,
): DocViewInput {
  return {
    editorVisible,
    previewVisible,
    cursor: { ...view.cursor },
    selection: {
      start: { ...view.selection.start },
      end: { ...view.selection.end },
    },
    scroll: { ...view.scroll },
  };
}

function missingDocument(): WireError {
  return {
    code: 'not_found',
    title: 'Document not found',
    message: 'The active document is no longer available.',
    retryable: false,
  };
}

async function flushBeforeHidingEditor(documentId: string): Promise<void> {
  await appModelAdapter.flushBuffer(documentId);
  await appModelAdapter.flushDocView(documentId);
}

export const setViewArrangement = createAsyncThunk<
  void,
  ViewArrangement,
  { state: RootState; rejectValue: WireError }
>('documents/setViewArrangement', async (arrangement, thunkApi) => {
  const state = thunkApi.getState();
  const documentId = state.documents.activeDocumentId;
  const document = state.documents.byId[documentId];

  if (document === undefined) {
    return thunkApi.rejectWithValue(missingDocument());
  }

  try {
    if (arrangement === 'preview') {
      await flushBeforeHidingEditor(documentId);
    }
    await appModelAdapter.setDocView(
      documentId,
      arrangementIntent(arrangement),
      docViewInputForArrangement(document.view, arrangement),
    );
  } catch (error) {
    return thunkApi.rejectWithValue(parseError(error));
  }
});

export const setEditorPaneVisible = createAsyncThunk<
  void,
  boolean,
  { state: RootState; rejectValue: WireError }
>('documents/setEditorPaneVisible', async (editorVisible, thunkApi) => {
  const state = thunkApi.getState();
  const documentId = state.documents.activeDocumentId;
  const document = state.documents.byId[documentId];

  if (document === undefined) {
    return thunkApi.rejectWithValue(missingDocument());
  }
  if (!editorVisible && !document.view.previewVisible) {
    return;
  }

  try {
    if (!editorVisible) {
      await flushBeforeHidingEditor(documentId);
    }
    await appModelAdapter.setDocView(
      documentId,
      { editorVisible, previewVisible: document.view.previewVisible },
      docViewInputForPaneVisibility(
        document.view,
        editorVisible,
        document.view.previewVisible,
      ),
    );
  } catch (error) {
    return thunkApi.rejectWithValue(parseError(error));
  }
});

export const setPreviewPaneVisible = createAsyncThunk<
  void,
  boolean,
  { state: RootState; rejectValue: WireError }
>('documents/setPreviewPaneVisible', async (previewVisible, thunkApi) => {
  const state = thunkApi.getState();
  const documentId = state.documents.activeDocumentId;
  const document = state.documents.byId[documentId];

  if (document === undefined) {
    return thunkApi.rejectWithValue(missingDocument());
  }
  if (!previewVisible && !document.view.editorVisible) {
    return;
  }

  try {
    await appModelAdapter.setDocView(
      documentId,
      { editorVisible: document.view.editorVisible, previewVisible },
      docViewInputForPaneVisibility(
        document.view,
        document.view.editorVisible,
        previewVisible,
      ),
    );
  } catch (error) {
    return thunkApi.rejectWithValue(parseError(error));
  }
});
