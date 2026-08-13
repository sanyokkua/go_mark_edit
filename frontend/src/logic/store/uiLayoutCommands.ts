import { createAsyncThunk } from '@reduxjs/toolkit';

import { appModelAdapter } from '../adapter';
import { parseError, type WireError } from '../utils/parseError';
import type { RootState } from './index';

/*
 * Binding source: mockup.html `.sidebar{width:216px…}` (:254). The shell already
 * falls back to this when no width has ever been acknowledged; it lives here so
 * the fallback and the restore below cannot drift apart.
 */
export const WORKSPACE_BINDING_WIDTH = 216;

/*
 * Visibility and width are two independently persisted properties, which leaves
 * one combination that reads as a broken control: visible at zero width. The
 * spec is silent on it, and it is reachable — the divider clamps at 0 and the
 * separator advertises `aria-valuemin={0}` — so these two commands close it from
 * both ends.
 *
 * Dragging the divider to the left edge means "put the workspace away", so it
 * hides rather than leaving a pane nobody can see. Showing a workspace whose
 * acknowledged width is 0 restores the binding width, so "show it" always
 * produces something visible.
 *
 * Both stay single backend commands. The width is the one the backend
 * acknowledges, not a value the shell renders over the top of it.
 */
export const setWorkspaceVisible = createAsyncThunk<
  void,
  boolean,
  { rejectValue: WireError; state: RootState }
>('ui/setWorkspaceVisible', async (sidebarVisible, thunkApi) => {
  const acknowledgedWidth = thunkApi.getState().ui.layout.sidebarWidth;
  try {
    await appModelAdapter.setUILayout(
      sidebarVisible && acknowledgedWidth === 0
        ? { sidebarVisible, sidebarWidth: WORKSPACE_BINDING_WIDTH }
        : { sidebarVisible },
    );
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
    await appModelAdapter.setUILayout(
      sidebarWidth === 0
        ? { sidebarVisible: false, sidebarWidth }
        : { sidebarWidth },
    );
  } catch (error) {
    return thunkApi.rejectWithValue(parseError(error));
  }
});
