import { createAsyncThunk } from '@reduxjs/toolkit';

import { appModelAdapter } from '../adapter';
import { parseError, type WireError } from '../utils/parseError';

export const setWorkspaceVisible = createAsyncThunk<
  void,
  boolean,
  { rejectValue: WireError }
>('ui/setWorkspaceVisible', async (sidebarVisible, thunkApi) => {
  try {
    await appModelAdapter.setUILayout({ sidebarVisible });
  } catch (error) {
    return thunkApi.rejectWithValue(parseError(error));
  }
});

export const setWorkspaceWidth = createAsyncThunk<
  void,
  number,
  { rejectValue: WireError }
>('ui/setWorkspaceWidth', async (sidebarWidth, thunkApi) => {
  try {
    await appModelAdapter.setUILayout({ sidebarWidth });
  } catch (error) {
    return thunkApi.rejectWithValue(parseError(error));
  }
});
