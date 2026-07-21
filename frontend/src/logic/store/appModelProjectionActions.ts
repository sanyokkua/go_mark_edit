import { createAction } from '@reduxjs/toolkit';

import type { AppStatePatch, AppStateSnapshot } from './appModelTypes';

export const hydrateProjection = createAction<AppStateSnapshot>(
  'appModel/hydrateProjection',
);

export const applyStatePatch = createAction<AppStatePatch>(
  'appModel/applyStatePatch',
);

export const resetProjection = createAction('appModel/resetProjection');
