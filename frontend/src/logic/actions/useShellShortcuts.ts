import { useEffect } from 'react';

import { dispatchShellAction, type ShellAction } from './shellActions';
import { currentPlatform, shortcutForKeyEvent } from './shortcutRegistry';

export function useShellShortcuts(actions: readonly ShellAction[]): void {
  useEffect((): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const platform = currentPlatform();
      const eventBinding = shortcutForKeyEvent(event, platform);
      const action = actions.find(
        (candidate) =>
          candidate.shortcut === event.key ||
          (eventBinding !== undefined && candidate.shortcut === eventBinding),
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
