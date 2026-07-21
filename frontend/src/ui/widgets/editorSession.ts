import { createContext } from 'react';

import type { ActiveBuffer } from '../../logic/store/appModelTypes';
import type { DocumentCommandAPI } from '../../logic/hooks/useDocumentCommands';

export const EditorSessionContext = createContext<ActiveBuffer | null>(null);

export const DocumentCommandContext = createContext<DocumentCommandAPI | null>(
  null,
);
