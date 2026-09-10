import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { t } from '../i18n';
import { appModelAdapter, documentWriteAdapter } from '../logic/adapter';
import type { AppDispatch } from '../logic/store';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import type {
  ActiveBuffer,
  ClassifiedError,
  ConflictPreview,
  DocumentMetadata,
  DocumentTransitionResult,
  RecoverySurface,
  WriteResult,
} from '../logic/store/appModelTypes';
import {
  notifyCondition,
  notifyToast,
  type NotificationRemediationIntent,
} from '../logic/store/notificationsSlice';
import { flushOutgoingDocument } from '../ui/widgets/outgoingFlush';
import type { GuardedActivation } from '../ui/widgets/editorSession';

export interface NormalizationRequest {
  documentId: string;
  filename: string;
  kind: 'save' | 'save-as';
  contentRevision: number;
  decisionToken: string;
  proposedEnding: 'lf' | 'crlf';
}

export interface ExternalConflictRequest {
  documentId: string;
  filename: string;
  kind: 'save' | 'save-as';
  preview: ConflictPreview;
}

export interface EntryCommandOutcome {
  error?: ClassifiedError;
}

export interface UseCommandsOptions {
  activeBuffer: ActiveBuffer | null;
  activeDocument?: DocumentMetadata;
  activation: GuardedActivation;
  dispatch: AppDispatch;
  documentsById: Readonly<Record<string, DocumentMetadata>>;
  replaceActiveBuffer: (buffer: ActiveBuffer | null) => void;
  setExternalConflict: Dispatch<SetStateAction<ExternalConflictRequest | null>>;
  setNormalization: Dispatch<SetStateAction<NormalizationRequest | null>>;
  setRecoverySurface: Dispatch<SetStateAction<RecoverySurface | null>>;
}

export interface UseCommandsResult {
  beginWrite: (
    kind: 'save' | 'save-as',
    targetDocumentId?: string,
  ) => Promise<WriteResult | undefined>;
  finishWrite: (
    kind: 'save' | 'save-as',
    documentId: string,
    contentRevision: number,
    decisionToken: string,
    filename: string,
  ) => Promise<WriteResult>;
  onActivateDocument: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  onNewDocument: (
    expectedTabSetRevision: number,
  ) => Promise<EntryCommandOutcome | undefined>;
  onOpenDocument: (
    expectedTabSetRevision: number,
  ) => Promise<EntryCommandOutcome | undefined>;
  onOpenRecentFile: (
    path: string,
    expectedTabSetRevision: number,
  ) => Promise<EntryCommandOutcome | undefined>;
  onReopenLastFile: (
    expectedTabSetRevision: number,
  ) => Promise<EntryCommandOutcome | undefined>;
  onSave: () => Promise<WriteResult | undefined>;
  onSaveAs: () => Promise<WriteResult | undefined>;
  reportWriteError: (
    error: ClassifiedError | undefined,
    documentId: string,
    intent?: NotificationRemediationIntent,
  ) => void;
}

function safeFilename(
  document: DocumentMetadata | undefined,
  targetPath?: string,
): string {
  const source =
    targetPath ?? document?.displayName ?? document?.path ?? document?.title;
  if (source === undefined || source.length === 0) return 'Untitled.md';
  const basename = source.replaceAll('\\', '/').split('/').pop() ?? source;
  const safe = basename.replace(/[\p{Cc}\p{Cf}]/gu, '');
  return safe.length === 0 ? 'Untitled.md' : safe;
}

function writeLineEndingLabel(outcome: { lineEndingOutcome: string }): string {
  switch (outcome.lineEndingOutcome) {
    case 'preserved-crlf':
    case 'normalized-crlf':
      return t('status.lineEnding.crlf');
    default:
      return t('status.lineEnding.lf');
  }
}

/**
 * Owns the application commands that cross the bridge from the composition
 * root: entry commands, activation, writes, and their classified failures.
 * Widgets receive these callbacks as capabilities; they do not reach into the
 * adapter or decide how a write acknowledgement is installed.
 */
export function useCommands({
  activeBuffer,
  activeDocument,
  activation,
  dispatch,
  documentsById,
  replaceActiveBuffer,
  setExternalConflict,
  setNormalization,
  setRecoverySurface,
}: UseCommandsOptions): UseCommandsResult {
  const activeBufferDocumentId = activeBuffer?.documentId;
  const flushActiveDocument = useCallback(async (): Promise<void> => {
    if (activeBufferDocumentId === undefined) return;
    await appModelAdapter.flushActiveSession?.(activeBufferDocumentId);
  }, [activeBufferDocumentId]);

  const reportEntryError = useCallback(
    (
      error: ClassifiedError | undefined,
      intent: NotificationRemediationIntent,
      path?: string,
    ): void => {
      reportClassifiedError(dispatch, error, t('notification.error.io.title'), {
        intent,
        ...(path === undefined ? {} : { retry: { path } }),
      });
    },
    [dispatch],
  );

  const onNewDocument = useCallback(
    async (
      expectedTabSetRevision: number,
    ): Promise<EntryCommandOutcome | undefined> => {
      await flushActiveDocument();
      const generation = activation.begin();
      const result = await appModelAdapter.newDocument?.(
        expectedTabSetRevision,
      );
      activation.acknowledge(generation, result?.data);
      reportEntryError(result?.error, 'new-document');
      return result;
    },
    [activation, flushActiveDocument, reportEntryError],
  );

  const onOpenDocument = useCallback(
    async (
      expectedTabSetRevision: number,
    ): Promise<EntryCommandOutcome | undefined> => {
      await flushActiveDocument();
      const generation = activation.begin();
      const result = await appModelAdapter.openDocument?.(
        expectedTabSetRevision,
      );
      activation.acknowledge(generation, result?.activeBuffer);
      reportEntryError(result?.error, 'open-document');
      return result;
    },
    [activation, flushActiveDocument, reportEntryError],
  );

  const onOpenRecentFile = useCallback(
    async (
      path: string,
      expectedTabSetRevision: number,
    ): Promise<EntryCommandOutcome | undefined> => {
      await flushActiveDocument();
      const generation = activation.begin();
      const result = await appModelAdapter.openRecentFile?.(
        path,
        expectedTabSetRevision,
      );
      activation.acknowledge(generation, result?.activeBuffer);
      reportEntryError(result?.error, 'open-recent', path);
      return result;
    },
    [activation, flushActiveDocument, reportEntryError],
  );

  const onReopenLastFile = useCallback(
    async (
      expectedTabSetRevision: number,
    ): Promise<EntryCommandOutcome | undefined> => {
      await flushActiveDocument();
      const generation = activation.begin();
      const result = await appModelAdapter.reopenLastFile?.(
        expectedTabSetRevision,
      );
      activation.acknowledge(generation, result?.activeBuffer);
      reportEntryError(result?.error, 'reopen-last');
      return result;
    },
    [activation, flushActiveDocument, reportEntryError],
  );

  const onActivateDocument = useCallback(
    async (
      documentId: string,
      expectedTabSetRevision: number,
    ): Promise<DocumentTransitionResult> => {
      const currentDocumentId = activeBuffer?.documentId;
      const refusal = await flushOutgoingDocument(
        appModelAdapter.flushActiveSession,
        currentDocumentId === documentId ? undefined : currentDocumentId,
      );
      if (refusal !== undefined) {
        reportClassifiedError(dispatch, refusal, t('editor.tabs'), {
          intent: 'activate-document',
          retry: { documentId },
        });
        return { error: refusal };
      }
      const generation = activation.begin();
      const result = await appModelAdapter.activateDocument?.(
        documentId,
        expectedTabSetRevision,
      );
      if (result === undefined) return {};
      activation.acknowledge(generation, result.data, documentId);
      return result;
    },
    [activation, activeBuffer?.documentId, dispatch],
  );

  const reportWriteError = useCallback(
    (
      error: ClassifiedError | undefined,
      documentId: string,
      intent?: NotificationRemediationIntent,
    ): void => {
      reportClassifiedError(
        dispatch,
        error ?? {
          category: 'io-failure',
          message: t('notification.error.io.message'),
          remediations: [],
          documentId,
          dedupKey: `write:${documentId}`,
        },
        t('notification.error.io.title'),
        { intent },
      );
    },
    [dispatch],
  );

  const finishWrite = useCallback(
    async (
      kind: 'save' | 'save-as',
      documentId: string,
      contentRevision: number,
      decisionToken: string,
      filename: string,
    ): Promise<WriteResult> => {
      const result =
        kind === 'save'
          ? await documentWriteAdapter.save(
              documentId,
              contentRevision,
              decisionToken,
            )
          : await documentWriteAdapter.saveAs(
              documentId,
              contentRevision,
              decisionToken,
            );
      if (result.status === 'needs-normalization') {
        setNormalization({
          contentRevision: result.documentRevision ?? contentRevision,
          decisionToken: result.decisionToken ?? decisionToken,
          documentId,
          filename,
          kind,
          proposedEnding: result.proposedEnding ?? 'lf',
        });
        return result;
      }
      setNormalization(null);
      if (result.status === 'conflict' && result.conflict !== undefined) {
        setExternalConflict({
          documentId,
          filename,
          kind,
          preview: result.conflict,
        });
        return result;
      }
      if (result.status === 'committed' && result.data !== undefined) {
        const recovered = await appModelAdapter.reconcileCommittedWrite(
          result.data,
        );
        if ('savedOnDisk' in recovered) {
          setRecoverySurface(recovered);
          dispatch(
            notifyCondition({
              code: 'recovery',
              message: recovered.message,
              severity: 'warning',
              subject: documentId,
              title: t('recovery.title'),
            }),
          );
        } else {
          setRecoverySurface(null);
          if (result.data.resyncRequired && recovered.activeBuffer !== null) {
            replaceActiveBuffer(recovered.activeBuffer);
          }
        }
        const writtenDocument = documentsById[documentId] ?? activeDocument;
        const safeName = safeFilename(
          writtenDocument,
          result.data.targetPath ?? filename,
        );
        dispatch(
          notifyToast({
            code: 'save-success',
            message: t('save.success.message', {
              encoding: t(
                `status.encoding.${writtenDocument?.encoding ?? 'utf-8'}`,
              ),
              filename: safeName,
              lineEnding: writeLineEndingLabel(result.data),
            }),
            severity: 'success',
            subject: documentId,
            title: t('save.success.title'),
          }),
        );
      } else if (result.status === 'conflict' || result.status === 'refused') {
        reportWriteError(result.error, documentId, kind);
      }
      return result;
    },
    [
      activeDocument,
      dispatch,
      documentsById,
      reportWriteError,
      replaceActiveBuffer,
      setExternalConflict,
      setNormalization,
      setRecoverySurface,
    ],
  );

  const beginWrite = useCallback(
    async (
      kind: 'save' | 'save-as',
      targetDocumentId?: string,
    ): Promise<WriteResult | undefined> => {
      const activeDocumentId =
        activeDocument?.documentId ?? activeBuffer?.documentId;
      const documentId = targetDocumentId ?? activeDocumentId;
      if (documentId === undefined) return undefined;
      const target =
        documentId === activeDocument?.documentId
          ? activeDocument
          : (documentsById[documentId] ?? activeDocument);
      if (
        target?.status === 'read-only' ||
        (target?.capability !== undefined && target.capability !== 'writable')
      ) {
        reportWriteError(
          {
            category: 'permission-denied',
            message: t('save.readOnly'),
            remediations: [],
            safeSubject: safeFilename(target),
            documentId,
            dedupKey: `read-only:${documentId}`,
          },
          documentId,
        );
        return undefined;
      }
      if (documentId !== activeDocumentId) {
        const backgroundState = await appModelAdapter.getState();
        return finishWrite(
          kind,
          documentId,
          backgroundState.snapshot.documents[documentId]?.contentRevision ??
            target?.contentRevision ??
            0,
          '',
          safeFilename(target),
        );
      }
      await appModelAdapter.flushActiveSession?.(documentId);
      const state = await appModelAdapter.getState();
      if (state.activeBuffer?.documentId !== documentId) {
        reportWriteError(
          {
            category: 'conflict',
            message: t('save.activeDocumentChanged'),
            remediations: ['Retry'],
            safeSubject: safeFilename(target),
            documentId,
            dedupKey: `active-document:${documentId}`,
          },
          documentId,
          kind,
        );
        return undefined;
      }
      const revision =
        state.activeBuffer.documentRevision ?? target?.contentRevision ?? 0;
      return finishWrite(kind, documentId, revision, '', safeFilename(target));
    },
    [
      activeBuffer,
      activeDocument,
      documentsById,
      finishWrite,
      reportWriteError,
    ],
  );

  const onSave = useCallback(() => beginWrite('save'), [beginWrite]);
  const onSaveAs = useCallback(() => beginWrite('save-as'), [beginWrite]);

  return {
    beginWrite,
    finishWrite,
    onActivateDocument,
    onNewDocument,
    onOpenDocument,
    onOpenRecentFile,
    onReopenLastFile,
    onSave,
    onSaveAs,
    reportWriteError,
  };
}
