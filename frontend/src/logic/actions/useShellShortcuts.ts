import { useEffect } from 'react';

import { dispatchShellAction, type ShellAction } from './shellActions';

export function useShellShortcuts(actions: readonly ShellAction[]): void {
  useEffect((): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const action = actions.find(
        (candidate) => candidate.shortcut === event.key,
      );
      if (action === undefined || !action.isAvailable()) {
        return;
      }
      event.preventDefault();
      void dispatchShellAction(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [actions]);
}
