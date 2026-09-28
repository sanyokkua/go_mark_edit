import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import { clipboardPort, type ClipboardPort } from '../../logic/adapter';
import {
    createEditorActionExecutor,
    type EditorActionExecutor,
    type EditorActionSnapshot,
} from '../../logic/actions/editorActionExecutor';
import { actionsForSurface, type ActionId } from '../../logic/actions/actionRegistry';
import { currentPlatform, shortcutForKeyEvent } from '../../logic/actions/shortcutRegistry';
import { formatActionIds } from '../../logic/format/formatting';
import { useEditingProjection } from '../../logic/hooks/useEditingProjection';
import { useEditorSettings } from '../../logic/settings/editorSettings';

import { useModalState } from './modalStateContext';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';

export const EditorClipboardPortContext = createContext<ClipboardPort>(clipboardPort);

export interface UseEditorActionExecutorOptions {
    registerShortcuts?: boolean;
}

const deferredEditorShortcutIds: ReadonlySet<ActionId> = new Set(['format', 'compact', 'lint']);

function isEditorFormattingShortcut(actionId: ActionId): boolean {
    return formatActionIds[actionId] !== undefined || deferredEditorShortcutIds.has(actionId);
}

/**
 * Binds the central editor-action executor to the current Monaco session.
 * Widgets provide UI only; this hook owns the shared keyboard path as well.
 */
export function useEditorActionExecutor(
    options: UseEditorActionExecutorOptions = {},
): Pick<EditorActionExecutor, 'capture' | 'execute'> {
    const activeBuffer = useContext(EditorSessionContext);
    const commands = useContext(DocumentCommandContext);
    const clipboard = useContext(EditorClipboardPortContext);
    const projectedState = useEditingProjection(activeBuffer?.documentId);
    const modalOpen = useModalState();
    const { markdownSettings } = useEditorSettings();
    const executor = useMemo(
        (): EditorActionExecutor =>
            createEditorActionExecutor({
                clipboard,
                commands,
                documentId: activeBuffer?.documentId ?? null,
                markdownSettings,
                modalOpen,
                projectedState,
                writable: activeBuffer !== null,
            }),
        [activeBuffer, clipboard, commands, markdownSettings, modalOpen, projectedState],
    );
    const execute = useCallback(
        (actionId: ActionId, snapshot?: EditorActionSnapshot) => executor.execute(actionId, snapshot),
        [executor],
    );

    useEffect((): (() => void) | undefined => {
        if (options.registerShortcuts !== true) return undefined;

        const onKeyDown = (event: KeyboardEvent): void => {
            if (modalOpen || commands === null) return;
            if (document.activeElement?.closest('[data-editor-surface]') === null) return;
            const binding = shortcutForKeyEvent(event, currentPlatform());
            if (binding === undefined) return;
            const action = actionsForSurface('shortcuts').find(
                (candidate) => candidate.shortcut === binding && isEditorFormattingShortcut(candidate.id),
            );
            if (action === undefined) return;
            event.preventDefault();
            void executor.execute(action.id);
        };

        window.addEventListener('keydown', onKeyDown);
        return (): void => window.removeEventListener('keydown', onKeyDown);
    }, [commands, executor, modalOpen, options.registerShortcuts]);

    return { capture: executor.capture, execute };
}
