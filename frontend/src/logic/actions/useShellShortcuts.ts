import { useEffect } from 'react';

import { dispatchAction, type ActionDispatchContext, type ActionResult } from './actionDispatcher';
import { getActionAvailability, type ActionId } from './actionRegistry';
import { dispatchShellAction, type ShellAction } from './shellActions';
import { currentPlatform, shortcutForKeyEvent } from './shortcutRegistry';
import { isEditorTextInput } from './editorTextInput';

export interface ShortcutAction {
    id: ActionId;
    invoke: () => Promise<unknown> | unknown;
    isAvailable: () => boolean;
    shortcut?: string;
    shortcutAliases?: readonly string[];
    dispatchContext?: Omit<ActionDispatchContext, 'invoke'>;
    /*
     * The keystroke path reports refusals just like the click surface. It hands
     * its result to `onActionResult`; without this the two would disagree about
     * the result to `onActionResult` so a refused command is visible for both
     * the accelerators themselves.
     */
    onResult?: (result: ActionResult) => void;
}

export type ShellShortcutAction = ShellAction | ShortcutAction;

function isShellAction(action: ShellShortcutAction): action is ShellAction {
    return 'scope' in action;
}

export function useShellShortcuts(actions: readonly ShellShortcutAction[]): void {
    useEffect((): (() => void) => {
        const dispatchKeyDown = (event: KeyboardEvent, capturing: boolean): void => {
            if (event.defaultPrevented) {
                return;
            }
            const platform = currentPlatform();
            const eventBinding = shortcutForKeyEvent(event, platform);
            const action = actions.find(
                (candidate) =>
                    candidate.shortcut === event.key ||
                    (eventBinding !== undefined &&
                        (candidate.shortcut === eventBinding ||
                            (!isShellAction(candidate) && candidate.shortcutAliases?.includes(eventBinding) === true))),
            );
            if (action?.id === 'export-pdf' && !capturing) {
                // The webview's own print must never run, whether or not Export is available.
                event.preventDefault();
            }
            if (action === undefined || !action.isAvailable()) {
                return;
            }
            const availability = getActionAvailability(
                action.id,
                isShellAction(action) ? action.availabilityContext : action.dispatchContext,
            );
            if (availability.kind !== 'available') {
                return;
            }
            event.preventDefault();
            if (isEditorTextInput(event.target)) event.stopPropagation();
            if (isShellAction(action)) {
                void dispatchShellAction(action);
                return;
            }
            void dispatchAction(action.id, {
                ...action.dispatchContext,
                invoke: action.invoke,
            }).then((result): void => action.onResult?.(result));
        };
        const captureEditor = (event: KeyboardEvent): void => {
            if (isEditorTextInput(event.target)) dispatchKeyDown(event, true);
        };
        const onKeyDown = (event: KeyboardEvent): void => dispatchKeyDown(event, false);
        globalThis.addEventListener('keydown', captureEditor, true);
        globalThis.addEventListener('keydown', onKeyDown);
        return (): void => {
            globalThis.removeEventListener('keydown', captureEditor, true);
            globalThis.removeEventListener('keydown', onKeyDown);
        };
    }, [actions]);
}
