import {
  getAction,
  getActionAvailability,
  type ActionAvailabilityContext,
  type ActionId,
  type ActionUnavailableReason,
} from './actionRegistry';

export type ActionResult =
  | { status: 'mutated'; actionId: ActionId; documentId?: string }
  | {
      status: 'unavailable';
      actionId: ActionId;
      reason: ActionUnavailableReason | 'no-editor';
    }
  | {
      status: 'document-mismatch';
      actionId: ActionId;
      expectedDocumentId: string;
      currentSessionIdentity: string;
    };

export interface ActionDispatchContext extends ActionAvailabilityContext {
  invoke?: () => Promise<unknown> | unknown;
  applicationFocused?: boolean;
  windowFocused?: boolean;
  editorFocused?: boolean;
  sessionDocumentId?: string;
  expectedTabSetRevision?: number;
}

const tabActionIds: ReadonlySet<ActionId> = new Set([
  'close-tab',
  'close-others',
  'close-right',
  'move-tab-left',
  'move-tab-right',
  'copy-path',
  'reveal-in-file-manager',
]);

function projectedDocumentIsWritable(context: ActionDispatchContext): boolean {
  const projected = context.projectedState ?? context.projection;
  const documentId =
    context.targetDocumentId ??
    context.documentId ??
    projected?.activeDocumentId ??
    undefined;
  return (
    documentId !== undefined &&
    projected?.documents?.[documentId]?.capability === 'writable'
  );
}

export async function dispatchAction(
  actionId: ActionId,
  context: ActionDispatchContext = {},
): Promise<ActionResult> {
  const action = getAction(actionId);
  if (action.availability.kind === 'deferred') {
    return { status: 'unavailable', actionId, reason: 'deferred' };
  }
  if (context.modalOpen === true) {
    return { status: 'unavailable', actionId, reason: 'modal' };
  }
  if (context.commandBarrier === true || context.barrierBlocked === true) {
    return { status: 'unavailable', actionId, reason: 'barrier' };
  }
  if (action.scope === 'application' && context.applicationFocused !== true) {
    return { status: 'unavailable', actionId, reason: 'unsupported' };
  }
  if (action.scope === 'window' && context.windowFocused !== true) {
    return { status: 'unavailable', actionId, reason: 'unsupported' };
  }
  if (action.scope === 'editor' && context.editorFocused !== true) {
    return { status: 'unavailable', actionId, reason: 'no-editor' };
  }
  if (
    action.scope === 'document' &&
    !tabActionIds.has(actionId) &&
    context.writable !== true &&
    !projectedDocumentIsWritable(context)
  ) {
    return { status: 'unavailable', actionId, reason: 'no-document' };
  }
  if (
    context.documentId !== undefined &&
    context.sessionDocumentId !== undefined &&
    context.documentId !== context.sessionDocumentId
  ) {
    return {
      status: 'document-mismatch',
      actionId,
      expectedDocumentId: context.documentId,
      currentSessionIdentity: context.sessionDocumentId,
    };
  }
  const availability = getActionAvailability(actionId, context);
  if (availability.kind === 'unavailable') {
    return { status: 'unavailable', actionId, reason: availability.reason };
  }
  if (context.invoke === undefined) {
    return { status: 'unavailable', actionId, reason: 'unsupported' };
  }
  const invocation = await context.invoke();
  if (
    typeof invocation === 'object' &&
    invocation !== null &&
    'status' in invocation &&
    invocation.status === 'document-mismatch'
  ) {
    return {
      status: 'document-mismatch',
      actionId,
      expectedDocumentId: context.documentId ?? '',
      currentSessionIdentity: context.sessionDocumentId ?? '',
    };
  }
  if (
    typeof invocation === 'object' &&
    invocation !== null &&
    'status' in invocation &&
    invocation.status === 'unavailable'
  ) {
    const invocationReason =
      'reason' in invocation &&
      (invocation.reason === 'no-document' ||
        invocation.reason === 'no-editor' ||
        invocation.reason === 'deferred' ||
        invocation.reason === 'modal' ||
        invocation.reason === 'unsupported' ||
        invocation.reason === 'barrier' ||
        invocation.reason === 'limit' ||
        invocation.reason === 'edge' ||
        invocation.reason === 'no-recent')
        ? invocation.reason
        : undefined;
    return {
      status: 'unavailable',
      actionId,
      reason:
        invocationReason ??
        (action.scope === 'editor' ? 'no-editor' : 'unsupported'),
    };
  }
  return { status: 'mutated', actionId, documentId: context.documentId };
}
