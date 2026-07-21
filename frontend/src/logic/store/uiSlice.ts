import { createSlice } from '@reduxjs/toolkit';

import {
  applyStatePatch,
  hydrateProjection,
  resetProjection,
} from './appModelProjectionActions';
import type { UILayout } from './appModelTypes';

export interface UIState {
  revision: number;
  layout: UILayout;
}

const initialState: UIState = {
  revision: -1,
  layout: {},
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(hydrateProjection, (state, action): void => {
        if (action.payload.revision <= state.revision) {
          return;
        }

        state.revision = action.payload.revision;
        state.layout = action.payload.ui;
      })
      .addCase(applyStatePatch, (state, action): void => {
        const patch = action.payload;
        if (patch.revision <= state.revision) {
          return;
        }

        state.revision = patch.revision;
        if (patch.ui !== undefined) {
          state.layout = { ...state.layout, ...patch.ui };
        }
      })
      .addCase(resetProjection, (): UIState => initialState);
  },
});

export const uiReducer = uiSlice.reducer;
