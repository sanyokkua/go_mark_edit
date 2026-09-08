import { createContext, useContext } from 'react';

export const ModalStateContext = createContext(false);

export function useModalState(): boolean {
  return useContext(ModalStateContext);
}
