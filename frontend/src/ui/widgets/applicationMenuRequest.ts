import { createContext } from 'react';

export type ApplicationMenuTarget = 'file' | 'markdown' | 'settings' | 'view' | 'about';

export const ApplicationMenuRequestContext = createContext<(target: ApplicationMenuTarget) => void>(() => undefined);
