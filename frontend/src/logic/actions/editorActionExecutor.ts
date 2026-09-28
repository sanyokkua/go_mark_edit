import type { ClipboardPort } from '../adapter/clipboard';
import { formatMarkers, runFormatAction } from '../format/formatting';
import type { DocumentCommandAPI, DocumentCommandResult } from '../hooks/useDocumentCommands';
import type { EditorPosition, EditorSelection } from '../../ui/components/CodeEditor';

import { dispatchAction, type ActionResult } from './actionDispatcher';
import type { ActionId, ProjectedActionState } from './actionRegistry';

export interface EditorActionExecutorContext {
    clipboard: ClipboardPort;
    commands: DocumentCommandAPI | null;
    documentId: string | null;
    markdownSettings: {
        bulletMarker: string;
        emphasisMarker: string;
        headingStyle: string;
    };
    modalOpen: boolean;
    projectedState?: ProjectedActionState;
    writable: boolean;
}

/** A popup snapshot remains tied to the Monaco session that opened it. */
export interface EditorActionSnapshot {
    commands: DocumentCommandAPI | null;
    documentId: string | null;
    selection: EditorSelection | null;
}

export interface EditorActionExecutor {
    capture: () => EditorActionSnapshot;
    execute: (actionId: ActionId, snapshot?: EditorActionSnapshot) => Promise<ActionResult>;
}

type EditorActionInvocation = { status: 'available' } | { status: 'document-mismatch' } | ClipboardFailure;
type ClipboardFailure = { reason: 'unsupported'; status: 'unavailable' };

const clipboardActionIds: ReadonlySet<ActionId> = new Set(['cut', 'copy', 'paste', 'paste-plain']);

const unavailableClipboard = (): ClipboardFailure => ({ reason: 'unsupported', status: 'unavailable' });

function lineStartOffset(source: string, lineNumber: number): number {
    let start = 0;
    for (let line = 1; line < lineNumber; line += 1) {
        const newline = source.indexOf('\n', start);
        if (newline === -1) return source.length;
        start = newline + 1;
    }
    return start;
}

function lineEndOffset(source: string, lineNumber: number): number {
    const start = lineStartOffset(source, lineNumber);
    const newline = source.indexOf('\n', start);
    return newline === -1 ? source.length : newline;
}

function offsetAt(source: string, position: EditorPosition): number {
    const start = lineStartOffset(source, position.lineNumber);
    return Math.min(start + position.column - 1, lineEndOffset(source, position.lineNumber));
}

function positionAt(source: string, offset: number): EditorPosition {
    const safeOffset = Math.max(0, Math.min(source.length, offset));
    let lineNumber = 1;
    let lineStart = 0;
    let newline = source.indexOf('\n');
    while (newline !== -1 && newline < safeOffset) {
        lineNumber += 1;
        lineStart = newline + 1;
        newline = source.indexOf('\n', newline + 1);
    }
    return { lineNumber, column: safeOffset - lineStart + 1 };
}

function normalizedSelection(source: string, selection: EditorSelection): EditorSelection {
    const start = offsetAt(source, selection.start);
    const end = offsetAt(source, selection.end);
    return {
        start: positionAt(source, Math.min(start, end)),
        end: positionAt(source, Math.max(start, end)),
    };
}

function selectedText(source: string, selection: EditorSelection): string {
    const start = offsetAt(source, selection.start);
    const end = offsetAt(source, selection.end);
    return source.substring(Math.min(start, end), Math.max(start, end));
}

function selectionAfterText(start: EditorPosition, text: string): EditorSelection {
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline === -1) {
        const caret = { lineNumber: start.lineNumber, column: start.column + text.length };
        return { start: caret, end: caret };
    }

    let newlineCount = 0;
    for (let index = 0; index < text.length; index += 1) {
        if (text.charAt(index) === '\n') newlineCount += 1;
    }
    const caret = {
        lineNumber: start.lineNumber + newlineCount,
        column: text.length - lastNewline,
    };
    return { start: caret, end: caret };
}

function resultFromCommand(result: DocumentCommandResult<unknown>): EditorActionInvocation {
    if (result.status === 'available') return { status: 'available' };
    if (result.status === 'document-mismatch') return result;
    return unavailableClipboard();
}

async function runClipboardAction(
    actionId: ActionId,
    commands: DocumentCommandAPI | null,
    selection: EditorSelection | null,
    clipboard: ClipboardPort,
): Promise<EditorActionInvocation> {
    if (commands === null || selection === null) return unavailableClipboard();
    const content = commands.getContent();
    if (content.status !== 'available') return resultFromCommand(content);

    const capturedSelection = normalizedSelection(content.value, selection);
    const selected = selectedText(content.value, capturedSelection);
    try {
        switch (actionId) {
            case 'copy':
                return (await clipboard.writeText(selected)) ? { status: 'available' } : unavailableClipboard();
            case 'cut': {
                if (!(await clipboard.writeText(selected))) return unavailableClipboard();
                return resultFromCommand(
                    commands.replaceRange(capturedSelection, '', {
                        start: capturedSelection.start,
                        end: capturedSelection.start,
                    }),
                );
            }
            case 'paste':
            case 'paste-plain': {
                const text = await clipboard.readText();
                return resultFromCommand(
                    commands.replaceRange(capturedSelection, text, selectionAfterText(capturedSelection.start, text)),
                );
            }
            default:
                return unavailableClipboard();
        }
    } catch {
        return unavailableClipboard();
    }
}

function capturedSelectionCommands(
    commands: DocumentCommandAPI | null,
    selection: EditorSelection | null,
): DocumentCommandAPI | null {
    if (commands === null) return null;
    return {
        ...commands,
        getSelection: (): DocumentCommandResult<EditorSelection | null> => ({
            status: 'available',
            value: selection,
        }),
    };
}

function focusAfterSuccess(commands: DocumentCommandAPI | null): void {
    commands?.focus();
}

/**
 * The sole editor action owner. Every editor UI surface uses this executor so
 * availability, Monaco edits, clipboard access, selection snapshots and focus
 * restoration cannot drift apart.
 */
export function createEditorActionExecutor(context: EditorActionExecutorContext): EditorActionExecutor {
    const capture = (): EditorActionSnapshot => {
        const selection = context.commands?.getSelection();
        return {
            commands: context.commands,
            documentId: context.documentId,
            selection: selection?.status === 'available' ? selection.value : null,
        };
    };

    const execute = async (actionId: ActionId, suppliedSnapshot?: EditorActionSnapshot): Promise<ActionResult> => {
        const snapshot = suppliedSnapshot ?? capture();
        const result = await dispatchAction(actionId, {
            documentId: snapshot.documentId ?? undefined,
            editorFocused: snapshot.commands !== null && context.documentId !== null,
            invoke: (): Promise<EditorActionInvocation> | DocumentCommandResult<unknown> =>
                clipboardActionIds.has(actionId)
                    ? runClipboardAction(actionId, snapshot.commands, snapshot.selection, context.clipboard)
                    : runFormatAction({
                          actionId,
                          commands: capturedSelectionCommands(snapshot.commands, snapshot.selection),
                          markers: formatMarkers(context.markdownSettings),
                          selection: snapshot.selection,
                      }),
            modalOpen: context.modalOpen,
            projectedState: context.projectedState,
            sessionDocumentId: context.documentId ?? undefined,
            writable: context.writable,
        });
        if (result.status === 'mutated') focusAfterSuccess(snapshot.commands);
        return result;
    };

    return { capture, execute };
}
