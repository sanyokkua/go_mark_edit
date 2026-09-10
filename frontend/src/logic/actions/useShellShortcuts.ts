import { useEffect } from 'react';

import {
  dispatchAction,
  type ActionDispatchContext,
  type ActionResult,
} from './actionDispatcher';
import { getActionAvailability, type ActionId } from './actionRegistry';
import { dispatchShellAction, type ShellAction } from './shellActions';
import { currentPlatform, shortcutForKeyEvent } from './shortcutRegistry';

export interface ShortcutAction {
  id: ActionId;
  invoke: () => Promise<unknown> | unknown;
  isAvailable: () => boolean;
  shortcut?: string;
  shortcutAliases?: readonly string[];
  dispatchContext?: Omit<ActionDispatchContext, 'invoke'>;
  /*
   * T109: the keystroke's half of reporting a refusal. The click surface hands
   * its result to `onActionResult`; without this the two would disagree about
   * whether a refused command says anything, which is the class T110 closed for
   * the accelerators themselves.
   */
  onResult?: (result: ActionResult) => void;
}

export type ShellShortcutAction = ShellAction | ShortcutAction;

function isShellAction(action: ShellShortcutAction): action is ShellAction {
  return 'scope' in action;
}

export function useShellShortcuts(
  actions: readonly ShellShortcutAction[],
): void {
  useEffect((): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const platform = currentPlatform();
      const eventBinding = shortcutForKeyEvent(event, platform);
      const action = actions.find(
        (candidate) =>
          candidate.shortcut === event.key ||
          (eventBinding !== undefined &&
            (candidate.shortcut === eventBinding ||
              (!isShellAction(candidate) &&
                candidate.shortcutAliases?.includes(eventBinding) === true))),
      );
      if (action === undefined || !action.isAvailable()) {
        return;
      }
      const availability = isShellAction(action)
        ? getActionAvailability(action.id)
        : getActionAvailability(action.id, action.dispatchContext);
      if (availability.kind !== 'available') {
        return;
      }
      event.preventDefault();
      if (isShellAction(action)) {
        void dispatchShellAction(action);
        return;
      }
      void dispatchAction(action.id, {
        ...action.dispatchContext,
        invoke: action.invoke,
      }).then((result): void => action.onResult?.(result));
    };
    window.addEventListener('keydown', onKeyDown);
    return (): void => window.removeEventListener('keydown', onKeyDown);
  }, [actions]);
}
