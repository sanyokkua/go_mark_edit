import { createContext } from 'react';

import type { EditorActionSnapshot } from '../../logic/actions/editorActionExecutor';

/** Opens the Insert table dialog for the editor session captured in the snapshot. */
export const InsertTableRequestContext = createContext<(snapshot: EditorActionSnapshot) => void>(() => undefined);
