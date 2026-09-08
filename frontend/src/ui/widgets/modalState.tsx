import { type PropsWithChildren } from 'react';

import { ModalStateContext } from './modalStateContext';

export function ModalStateProvider({
  children,
  modalOpen,
}: PropsWithChildren<{ modalOpen: boolean }>): React.JSX.Element {
  return (
    <ModalStateContext.Provider value={modalOpen}>
      {children}
    </ModalStateContext.Provider>
  );
}
