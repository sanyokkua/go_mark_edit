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

export const setViewArrangement = createAsyncThunk<
  void,
  ViewArrangement,
  { state: RootState; rejectValue: WireError }
>('documents/setViewArrangement', async (arrangement, thunkApi) => {
  const state = thunkApi.getState();
  const documentId = state.documents.activeDocumentId;
  const document = state.documents.byId[documentId];

  if (document === undefined) {
    return thunkApi.rejectWithValue({
      code: 'not_found',
      title: 'Document not found',
      message: 'The active document is no longer available.',
      retryable: false,
    });
  }

  try {
    await appModelAdapter.setDocView(
      documentId,
      docViewInputForArrangement(document.view, arrangement),
    );
  } catch (error) {
    return thunkApi.rejectWithValue(parseError(error));
  }
});
