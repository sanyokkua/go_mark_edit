import { createContext } from 'react';

import type { ActiveBuffer } from '../../logic/store/appModelTypes';

export const EditorSessionContext = createContext<ActiveBuffer | null>(null);
