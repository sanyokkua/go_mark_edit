import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import { clipboardPort, type ClipboardPort } from '../../logic/adapter';
import {
    createEditorActionExecutor,
    type EditorActionExecutor,
    type EditorActionSnapshot,
} from '../../logic/actions/editorActionExecutor';
import { actionsForSurface, getActionAvailability, type ActionId } from '../../logic/actions/actionRegistry';
import { currentPlatform, shortcutForKeyEvent } from '../../logic/actions/shortcutRegistry';
import { isEditorTextInput } from '../../logic/actions/editorTextInput';
import { formatActionIds } from '../../logic/format/formatting';
import { useEditingProjection } from '../../logic/hooks/useEditingProjection';
import { useEditorShown } from '../../logic/hooks/useEditorShown';
import { useEditorSettings } from '../../logic/settings/editorSettings';
import { useOperationSlot } from '../../logic/operations/useOperationSlot';

import { useModalState } from './modalStateContext';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';
import { InsertTableRequestContext } from './insertTableRequest';
import { TidyCommandsContext } from './tidyCommandsContext';

export const EditorClipboardPortContext = createContext<ClipboardPort>(clipboardPort);

export interface UseEditorActionExecutorOptions {
    registerShortcuts?: boolean;
}

const tidyActionIds: ReadonlySet<ActionId> = new Set(['format', 'compact', 'lint']);

function isEditorFormattingShortcut(actionId: ActionId): boolean {
    return (
        actionId === 'find' ||
        actionId === 'replace' ||
        formatActionIds[actionId] !== undefined ||
        tidyActionIds.has(actionId)
    );
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
    const editorShown = useEditorShown();
    const { markdownSettings } = useEditorSettings();
    const tidyCommands = useContext(TidyCommandsContext);
    const slot = useOperationSlot();
    const requestTable = useContext(InsertTableRequestContext);
    const executor = useMemo(
        (): EditorActionExecutor =>
            createEditorActionExecutor({
                clipboard,
                commands,
                documentId: activeBuffer?.documentId ?? null,
                editorShown,
                markdownSettings,
                modalOpen,
                projectedState,
                requestTable,
                slotBusy: slot.state === 'running',
                invokeTidy:
                    tidyCommands === null
                        ? undefined
                        : (op, snapshot) =>
                              tidyCommands.run(op, {
                                  commands: snapshot.commands ?? undefined,
                                  documentId: snapshot.documentId ?? undefined,
                              }),
                writable: activeBuffer !== null,
            }),
        [
            activeBuffer,
            clipboard,
            commands,
            editorShown,
            markdownSettings,
            modalOpen,
            projectedState,
            requestTable,
            slot.state,
            tidyCommands,
        ],
    );
    const execute = useCallback(
        (actionId: ActionId, snapshot?: EditorActionSnapshot) => executor.execute(actionId, snapshot),
        [executor],
    );

    useEffect((): (() => void) | undefined => {
        if (options.registerShortcuts !== true) return undefined;

        const onKeyDown = (event: KeyboardEvent): void => {
            if (modalOpen || commands === null || activeBuffer === null) return;
            if (document.activeElement?.closest('[data-editor-surface]') === null) return;
            const binding = shortcutForKeyEvent(event, currentPlatform());
            if (binding === undefined) return;
            const action = actionsForSurface('shortcuts').find(
                (candidate) => candidate.shortcut === binding && isEditorFormattingShortcut(candidate.id),
            );
            if (action === undefined) return;
            if (
                isEditorTextInput(event.target) &&
                getActionAvailability(action.id, {
                    documentId: activeBuffer?.documentId,
                    modalOpen,
                    editorShown,
                    markdownSettingsLoaded: markdownSettings !== undefined,
                    projectedState,
                    slotBusy: slot.state === 'running',
                    writable: activeBuffer !== null,
                }).kind !== 'available'
            )
                return;
            event.preventDefault();
            if (isEditorTextInput(event.target)) event.stopPropagation();
            void executor.execute(action.id);
        };

        const captureEditor = (event: KeyboardEvent): void => {
            if (isEditorTextInput(event.target)) onKeyDown(event);
        };
        globalThis.addEventListener('keydown', captureEditor, true);
        globalThis.addEventListener('keydown', onKeyDown);
        return (): void => {
            globalThis.removeEventListener('keydown', captureEditor, true);
            globalThis.removeEventListener('keydown', onKeyDown);
        };
    }, [
        activeBuffer,
        commands,
        editorShown,
        executor,
        markdownSettings,
        modalOpen,
        options.registerShortcuts,
        projectedState,
        slot.state,
    ]);

    return { capture: executor.capture, execute };
}
