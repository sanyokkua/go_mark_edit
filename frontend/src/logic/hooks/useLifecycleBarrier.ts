/** Identity of the editor activation that owns a pending lifecycle flush. */
export interface LifecycleSessionIdentity<TActivationToken> {
  documentId: string;
  activationToken: TActivationToken;
}

/** A single, identity-bound capture of the latest editor content and view. */
export interface LifecycleCapture<
  TContent,
  TView,
  TActivationToken,
> extends LifecycleSessionIdentity<TActivationToken> {
  content: TContent;
  view: TView;
}

/** Reads the latest active-session state at the instant a lifecycle command starts. */
export type LifecycleCaptureProvider<TContent, TView, TActivationToken> = () =>
  | LifecycleCapture<TContent, TView, TActivationToken>
  | Promise<LifecycleCapture<TContent, TView, TActivationToken>>;

/** Adapter queues and drains used by the lifecycle barrier. */
export interface LifecycleBarrierOptions<TContent, TView> {
  flushBuffer: (documentId: string) => Promise<void>;
  flushDocView: (documentId: string) => Promise<void>;
  queueBuffer?: (documentId: string, content: TContent) => void | Promise<void>;
  queueDocView?: (documentId: string, view: TView) => void | Promise<void>;
}

/**
 * Flushes one captured activation as a single awaited operation.
 * Queue callbacks run before either drain; buffer and then view drains run in order.
 */
export interface LifecycleBarrier<TContent, TView, TActivationToken> {
  flushActiveSession(
    expectedDocumentId: string,
    expectedActivationToken: TActivationToken,
    capture: LifecycleCaptureProvider<TContent, TView, TActivationToken>,
  ): Promise<LifecycleCapture<TContent, TView, TActivationToken>>;
}

/** Failure raised when the capture no longer belongs to the requested session. */
export type LifecycleBarrierErrorCode =
  'document-mismatch' | 'activation-mismatch';

/** Structured identity failure so callers can abort without changing active state. */
export class LifecycleBarrierError extends Error {
  readonly code: LifecycleBarrierErrorCode;
  readonly expectedDocumentId: string;
  readonly expectedActivationToken: unknown;
  readonly actualDocumentId: string;
  readonly actualActivationToken: unknown;

  constructor(
    code: LifecycleBarrierErrorCode,
    expected: LifecycleSessionIdentity<unknown>,
    actual: LifecycleSessionIdentity<unknown>,
  ) {
    super(
      code === 'document-mismatch'
        ? 'The active document changed while its lifecycle state was being flushed.'
        : 'The active editor activation changed while its lifecycle state was being flushed.',
    );
    this.name = 'LifecycleBarrierError';
    this.code = code;
    this.expectedDocumentId = expected.documentId;
    this.expectedActivationToken = expected.activationToken;
    this.actualDocumentId = actual.documentId;
    this.actualActivationToken = actual.activationToken;
  }
}

function validateCapture<TContent, TView, TActivationToken>(
  expectedDocumentId: string,
  expectedActivationToken: TActivationToken,
  capture: LifecycleCapture<TContent, TView, TActivationToken>,
): void {
  const expected: LifecycleSessionIdentity<unknown> = {
    documentId: expectedDocumentId,
    activationToken: expectedActivationToken,
  };
  const actual: LifecycleSessionIdentity<unknown> = {
    documentId: capture.documentId,
    activationToken: capture.activationToken,
  };

  if (capture.documentId !== expectedDocumentId) {
    throw new LifecycleBarrierError('document-mismatch', expected, actual);
  }
  if (!Object.is(capture.activationToken, expectedActivationToken)) {
    throw new LifecycleBarrierError('activation-mismatch', expected, actual);
  }
}

/** Creates an identity-bound lifecycle barrier for one editor adapter. */
export function createLifecycleBarrier<
  TContent = string,
  TView = unknown,
  TActivationToken = unknown,
>(
  options: LifecycleBarrierOptions<TContent, TView>,
): LifecycleBarrier<TContent, TView, TActivationToken> {
  return {
    async flushActiveSession(
      expectedDocumentId: string,
      expectedActivationToken: TActivationToken,
      capture: LifecycleCaptureProvider<TContent, TView, TActivationToken>,
    ): Promise<LifecycleCapture<TContent, TView, TActivationToken>> {
      const snapshot = await capture();
      validateCapture(expectedDocumentId, expectedActivationToken, snapshot);

      if (options.queueBuffer !== undefined) {
        await options.queueBuffer(expectedDocumentId, snapshot.content);
      }
      if (options.queueDocView !== undefined) {
        await options.queueDocView(expectedDocumentId, snapshot.view);
      }

      await options.flushBuffer(expectedDocumentId);
      await options.flushDocView(expectedDocumentId);

      return snapshot;
    },
  };
}
