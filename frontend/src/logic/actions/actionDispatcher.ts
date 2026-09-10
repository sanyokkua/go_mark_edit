import type { ClassifiedError } from '../store/appModelTypes';

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
      status: 'committed';
      actionId: ActionId;
      documentId?: string;
      value?: unknown;
    }
  | { status: 'cancelled'; actionId: ActionId; documentId?: string }
  | {
      status: 'prompt';
      actionId: ActionId;
      documentId?: string;
      value?: unknown;
    }
  | {
      status: 'conflict';
      actionId: ActionId;
      documentId?: string;
      value?: unknown;
    }
  /*
   * T109: the backend's own refusal, carried rather than flattened. Every
   * carrier type in `appModelTypes.ts` — WriteResult, OpenResult,
   * TabTransitionResult, ConflictResult, PathCommandResult — pairs a `refused`
   * status with an optional ClassifiedError, and the dispatcher used to match
   * only the literal 'unavailable', so a refusal fell through and was reported
   * as a mutation that happened. The error travels on the result so that a
   * caller holding a dispatch can report it; the dispatcher itself has no store
   * access and must stay a pure function.
   */
  | {
      status: 'refused';
      actionId: ActionId;
      documentId?: string;
      error?: ClassifiedError;
    }
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

type InvocationRecord = Record<string, unknown> & { status?: unknown };

function invocationRecord(value: unknown): InvocationRecord | undefined {
  return typeof value === 'object' && value !== null
    ? (value as InvocationRecord)
    : undefined;
}

function actionResultFromInvocation(
  actionId: ActionId,
  documentId: string | undefined,
  sessionDocumentId: string | undefined,
  invocation: unknown,
): ActionResult {
  const record = invocationRecord(invocation);
  if (record === undefined) {
    return { status: 'mutated', actionId, documentId };
  }
  const status = record?.status;
  if (status === 'document-mismatch') {
    return {
      status: 'document-mismatch',
      actionId,
      expectedDocumentId: documentId ?? '',
      currentSessionIdentity: sessionDocumentId ?? '',
    };
  }
  if (status === 'unavailable') {
    const reason =
      record.reason === 'no-document' ||
      record.reason === 'no-editor' ||
      record.reason === 'deferred' ||
      record.reason === 'modal' ||
      record.reason === 'unsupported' ||
      record.reason === 'barrier' ||
      record.reason === 'limit' ||
      record.reason === 'edge' ||
      record.reason === 'no-recent'
        ? record.reason
        : undefined;
    return {
      status: 'unavailable',
      actionId,
      reason: reason ?? 'unsupported',
    };
  }
  if (status === 'refused') {
    return {
      status: 'refused',
      actionId,
      documentId,
      error: record.error as ClassifiedError | undefined,
    };
  }
  if (status === 'committed') {
    return { status: 'committed', actionId, documentId, value: record.data };
  }
  if (status === 'cancelled') {
    return { status: 'cancelled', actionId, documentId };
  }
  if (status === 'needs-normalization' || status === 'prompt') {
    return { status: 'prompt', actionId, documentId, value: invocation };
  }
  if (status === 'conflict') {
    return { status: 'conflict', actionId, documentId, value: invocation };
  }

  // These statuses describe a successful command in one of the public adapter
  // result families. A callback with no status is also a successful mutation;
  // an object carrying an unknown status is not, because silently presenting a
  // future refusal as a mutation is worse than refusing the command locally.
  if (
    invocation === undefined ||
    status === undefined ||
    status === 'mutated' ||
    status === 'available' ||
    status === 'opened' ||
    status === 'focused' ||
    status === 'activated' ||
    status === 'reordered' ||
    status === 'closed' ||
    status === 'noop' ||
    status === 'copied' ||
    status === 'revealed'
  ) {
    return { status: 'mutated', actionId, documentId };
  }
  return { status: 'unavailable', actionId, reason: 'unsupported' };
}

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
  return actionResultFromInvocation(
    actionId,
    context.documentId,
    context.sessionDocumentId,
    invocation,
  );
}
