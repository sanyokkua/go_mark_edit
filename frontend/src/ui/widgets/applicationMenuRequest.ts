import { createContext } from 'react';

export type ApplicationMenuTarget = 'file' | 'settings' | 'view' | 'about';

export const ApplicationMenuRequestContext = createContext<
  (target: ApplicationMenuTarget) => void
>(() => undefined);
