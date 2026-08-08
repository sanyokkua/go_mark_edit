import { getAction, type ActionId } from './actionRegistry';

export type ActionResult =
  | { status: 'mutated'; actionId: ActionId; documentId?: string }
  | {
      status: 'unavailable';
      actionId: ActionId;
      reason:
        'no-document' | 'no-editor' | 'deferred' | 'modal' | 'unsupported';
    }
  | {
      status: 'document-mismatch';
      actionId: ActionId;
      expectedDocumentId: string;
      currentSessionIdentity: string;
    };

export interface ActionDispatchContext {
  invoke?: () => Promise<unknown> | unknown;
  applicationFocused?: boolean;
  windowFocused?: boolean;
  modalOpen?: boolean;
  editorFocused?: boolean;
  documentId?: string;
  sessionDocumentId?: string;
  writable?: boolean;
  tabCommand?: boolean;
  targetDocumentId?: string;
  targetIndex?: number;
  expectedTabSetRevision?: number;
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
    context.writable !== true &&
    context.tabCommand !== true
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
        invocation.reason === 'unsupported')
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
