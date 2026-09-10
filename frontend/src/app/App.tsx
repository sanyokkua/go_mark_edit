import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Provider } from 'react-redux';

import { t } from '../i18n';

import {
  dismissNotification,
  notifyError,
  resetNotifications,
  type NotificationRemediation,
} from '../logic/store/notificationsSlice';
import { store, useAppDispatch, useAppSelector } from '../logic/store';
import { reportClassifiedError } from '../logic/store/classifiedNotification';
import type { AppModelBootstrapResult } from '../logic/store/appModelProjection';
import { hydrateProjection } from '../logic/store/appModelProjectionActions';
import type {
  ActiveBuffer,
  ClassifiedError,
  CloseChoice,
  ClosePlanDecision,
  ConflictPreview,
  ClosePlanKind,
  ClosePlanResult,
  ClosePlanSummary,
  ConflictResult,
  DocumentMetadata,
  RecoverySurface,
  TabTransitionResult,
} from '../logic/store/appModelTypes';
import {
  appModelAdapter,
  closePlanAdapter,
  commandAdapter,
  documentConflictAdapter,
  documentWriteAdapter,
  nativeLifecycleAdapter,
} from '../logic/adapter';
import { parseError } from '../logic/utils/parseError';
import Button from '../ui/primitives/Button';
import LiveRegion from '../ui/primitives/LiveRegion';
import Notifications, {
  type NotificationNotice,
} from '../ui/components/Notifications';
import AppShell from '../ui/widgets/AppShell';
import AboutDialog from '../ui/widgets/dialogs/AboutDialog';
import {
  AppearanceControlsContent,
  AppearanceSettingsProvider,
} from '../ui/widgets/AppearanceControls';
import ApplicationMenubar, {
  type ApplicationMenuState,
} from '../ui/widgets/Menubar/ApplicationMenubar';
import {
  ApplicationMenuRequestContext,
  type ApplicationMenuTarget,
} from '../ui/widgets/applicationMenuRequest';
import {
  EditorSessionProvider,
  useGuardedActivation,
} from '../ui/widgets/editorSession';
import {
  TabRemediationContext,
  type TabRemediationExecutor,
} from '../ui/widgets/tabRemediation';
import StartupFailure from '../ui/widgets/StartupFailure/StartupFailure';
import ShortcutsDialog from '../ui/widgets/dialogs/ShortcutsDialog';
import NormalizationPrompt from '../ui/widgets/dialogs/NormalizationPrompt';
import ExternalChangePrompt, {
  type ExternalChangeDecision,
} from '../ui/widgets/dialogs/ExternalChangePrompt';
import ClosePrompt from '../ui/widgets/dialogs/ClosePrompt';
import { tabLabelsFor } from '../ui/widgets/tabLabel';
import { onApplicationForeground } from '../ui/widgets/foregroundFocus';
import { ModalStateProvider } from '../ui/widgets/modalState';
import ModalShell from '../ui/components/ModalShell';
import { useBootstrap } from './useBootstrap';
import {
  useCommands,
  type EntryCommandOutcome,
  type ExternalConflictRequest,
  type NormalizationRequest,
} from './useCommands';
import { useShutdown, type ShutdownController } from './useShutdown';

function closePlanDecisions(
  plan: ClosePlanSummary,
  tokenOverride?: { documentId: string; decisionToken: string },
): ClosePlanDecision[] {
  return plan.targets
    .filter((target) => target.dirty && target.choice !== undefined)
    .map((target) => ({
      choice: target.choice as CloseChoice,
      decisionToken:
        target.documentId === tokenOverride?.documentId
          ? tokenOverride.decisionToken
          : target.normalizationToken,
      documentId: target.documentId,
    }));
}

const AppContents: React.FC = (): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.notifications.items);
  const banners = useAppSelector((state) => state.notifications.banners);
  const activeDocument = useAppSelector((state) =>
    state.documents.activeDocumentId === null
      ? undefined
      : state.documents.byId[state.documents.activeDocumentId],
  );
  /*
   * Named `replaceActiveBuffer`, not `setActiveBuffer`, and the rename is the
   * point: an *activation acknowledgement* may not be installed through it.
   * FR-FT-030 binds an acknowledgement to an identity and a revision and allows
   * it to be applied "only while both values still match the confirmed active
   * projection", so every acknowledgement goes through `activation.acknowledge`
   * below. What is left here is the buffer handoff that is not an
   * acknowledgement at all — startup, editor-state recovery, a completed close
   * plan and an external-change reload — and a handler that reaches for the old
   * name to install a command's answer now fails to compile rather than
   * quietly reintroducing the unguarded install.
   */
  const [activeBuffer, replaceActiveBuffer] = useState<ActiveBuffer | null>(
    null,
  );
  const [remediationAnnouncement, setRemediationAnnouncement] = useState('');
  const [hydratedPendingCloseId, setHydratedPendingCloseId] = useState<
    string | null
  >(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [requestedApplicationMenu, setRequestedApplicationMenu] =
    useState<ApplicationMenuTarget | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [normalization, setNormalization] =
    useState<NormalizationRequest | null>(null);
  const [externalConflict, setExternalConflict] =
    useState<ExternalConflictRequest | null>(null);
  const [tabExternalConflict, setTabExternalConflict] =
    useState<ConflictPreview | null>(null);
  const [closePlan, setClosePlan] = useState<ClosePlanSummary | null>(null);
  const [closeNormalization, setCloseNormalization] = useState<{
    planId: string;
    documentId: string;
    contentRevision: number;
    decisionToken: string;
    proposedEnding: 'lf' | 'crlf';
    filename: string;
  } | null>(null);
  const [closeConflict, setCloseConflict] = useState<{
    planId: string;
    documentId: string;
    preview: ConflictPreview;
  } | null>(null);
  const [nativeClosePending, setNativeClosePending] = useState(false);
  const [recoverySurface, setRecoverySurface] =
    useState<RecoverySurface | null>(null);
  const [recoveryQuitConfirmOpen, setRecoveryQuitConfirmOpen] = useState(false);
  const orderedDocumentIds = useAppSelector(
    (state) => state.documents.orderedIds,
  );
  const documentsById = useAppSelector((state) => state.documents.byId);
  /*
   * The documents FR-FT-016's second confirmation must name.
   *
   * "Quit and discard newer unsaved changes MUST require a second confirmation
   * naming the affected documents" — and the affected set is exactly the one
   * the same requirement keeps "modified against the committed baseline": every
   * document the projection still shows as dirty. A clean tab loses nothing, so
   * naming it would overstate what the button does.
   *
   * Reading the projection is deliberate rather than a shortcut. Rehydration is
   * the thing that failed on this path, so the last delivered snapshot is the
   * only record of what is about to be discarded; there is no fresher truth to
   * ask for, and commands are blocked, so it cannot move underneath the prompt.
   *
   * The labels are the tab labels, disambiguated the same way, so the prompt
   * names files the way the rest of the window already does — two open
   * `notes.md` read as two distinct rows rather than one repeated name.
   */
  const recoveryDiscardNames = useMemo((): string[] => {
    const ordered = orderedDocumentIds
      .map((documentId) => documentsById[documentId])
      .filter(
        (document): document is DocumentMetadata => document !== undefined,
      );
    const labels = tabLabelsFor(ordered);
    return ordered
      .filter((document) => document.dirty)
      .map(
        (document) =>
          labels.get(document.documentId)?.label ??
          document.displayName ??
          document.title,
      );
  }, [documentsById, orderedDocumentIds]);
  const [version, setVersion] = useState('');
  const nativeClosePendingRef = useRef(false);
  const nativeCloseIdRef = useRef('');
  const shutdownControllerRef = useRef<ShutdownController | undefined>(
    undefined,
  );
  const recoveryQuitConfirmedRef = useRef(false);
  const recoveryQuitCancelRef = useRef<HTMLButtonElement | null>(null);
  const activeDocumentId = activeBuffer?.documentId;
  /*
   * Foreground checks belong to the application, not to the tab widget. The
   * widget renders the projection and emits commands; this layer owns the
   * foreground external-change prompt and can therefore keep a detected buffer
   * behind the guarded editor-session reload seam.
   */
  const foregroundCheckRunning = useRef(false);
  const runForegroundChecks = useCallback((): void => {
    if (foregroundCheckRunning.current) return;
    foregroundCheckRunning.current = true;
    void (async (): Promise<void> => {
      try {
        for (const documentId of orderedDocumentIds) {
          const document = documentsById[documentId];
          if (document === undefined || document.path === '') continue;
          const result =
            await documentConflictAdapter.checkExternalChanges(documentId);
          if (
            result.status === 'detected' &&
            result.preview !== undefined &&
            documentId === activeDocumentId
          ) {
            setTabExternalConflict(result.preview);
          }
        }
      } catch {
        // A foreground sweep that cannot run leaves backend state untouched.
      } finally {
        foregroundCheckRunning.current = false;
      }
    })();
  }, [activeDocumentId, documentsById, orderedDocumentIds]);
  useEffect(
    (): (() => void) => onApplicationForeground(runForegroundChecks),
    [runForegroundChecks],
  );
  const onBootstrapReady = useCallback(
    (result: Extract<AppModelBootstrapResult, { status: 'ready' }>): void => {
      replaceActiveBuffer(result.activeBuffer);
      setVersion(result.applicationVersion);
      setHydratedPendingCloseId(result.pendingCloseId ?? null);
    },
    [],
  );
  const bootstrap = useBootstrap({ onReady: onBootstrapReady });
  const bootstrapStatus = bootstrap.status;
  const isRetrying = bootstrap.isRetrying;
  const startupFailure = bootstrap.failure;
  const bootstrapRetry = bootstrap.retry;
  const retryBootstrap = useCallback((): void => {
    setHydratedPendingCloseId(null);
    dispatch(resetNotifications());
    bootstrapRetry();
  }, [bootstrapRetry, dispatch]);
  /*
   * T128: the one install path for an active-buffer acknowledgement. Each of
   * the five acknowledging handlers claims a generation with `begin()` before
   * it issues its command and hands the answer to `acknowledge()`, which
   * applies it only once the projection confirms the identity and revision it
   * carries. Nothing here restates the guard, so a sixth handler cannot
   * reintroduce the defect by forgetting a check it never had to write.
   */
  const activation = useGuardedActivation(replaceActiveBuffer);
  const {
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
  } = useCommands({
    activeBuffer,
    activeDocument,
    activation,
    dispatch,
    documentsById,
    replaceActiveBuffer,
    setExternalConflict,
    setNormalization,
    setRecoverySurface,
  });
  /*
   * FR-FT-005 and the classified-error table both require a refused entry to
   * carry a message naming its limit, and the backend already writes one
   * ("The document exceeds the 50 MiB limit.",
   * `internal/file/document_reader.go:211`; "The window already contains 40
   * documents.", `internal/appmodel/file_lifecycle.go:184`). Each handler below
   * read only its success field, so every classified refusal on the entry paths
   * was discarded — the save path had this right at `beginWrite` and the open
   * path had no counterpart. `reportClassifiedError` is used rather than
   * `reportWriteError` because it preserves the backend's message instead of
   * substituting generic catalog copy.
   */
  /*
   * T156: the entry paths now name the command behind their `Retry`.
   *
   * Every refusal these four report on a stale tab set is `conflict` carrying
   * `Retry` — "The tab set changed; Open must be retried."
   * (`internal/appmodel/file_lifecycle.go:136,167`) — and the contract's
   * `conflict` row covers exactly that pairing since T159. The command is
   * well defined and identical for all four: re-read `tabSetRevision` from the
   * backend and re-issue the same entry command against it. Until this, no
   * intent was declared, so `remediationsFor` dropped the `Retry` Go had sent
   * and the user was told to retry with nothing to retry with.
   */
  /*
   * The write path's copy defect — T107's and T111's, third and last arrow.
   *
   * This dispatched `notifyError`, whose `prepare` runs `localizedErrorCopy` and
   * replaces title and message with generic catalogue copy keyed by code. So the
   * message Go built was discarded on every Save, Save As and conflict decision:
   * the `title`, `message` and `retryable` assembled here were all dead, and a
   * 50 MiB capacity refusal read exactly like an unrelated write failure —
   * against FR-FT-005, which requires the refusal to name the limit.
   *
   * The eight-category ternary is gone rather than repaired. It ended
   * `conflict ? 'io' : 'io'`, collapsing `conflict`, `capacity-limit` and
   * `system-command-failure` onto one code, and `classifiedErrorCode` already
   * maps all eight — rewriting it here would have duplicated that map.
   *
   * The `??` default is load-bearing and has no counterpart in T107/T111:
   * `reportClassifiedError` returns early on `undefined`, whereas `notifyError`
   * always produced a toast. Without it a refusal carrying no error would become
   * silent, which is a worse defect than the one being fixed.
   */
  /*
   * The close plan is the entry paths' defect with a third arrow (T107, T111).
   * Its refusals were reported, but through `notifyError`, whose
   * `localizedErrorCopy` replaces title and message with generic copy keyed by
   * code — and `conflict` has no catalog entry, so it collapses onto `io`. Go
   * distinguishes its refusals precisely: "The tab set changed; close must be
   * retried." (`internal/appmodel/close_plan.go:44`) and "The tab set changed
   * while autosave work drained." (`:88`), each pinned by a test in
   * `close_plan_test.go`. Both reached the user as "The file operation could
   * not be completed." `reportClassifiedError` passes `error.message` through.
   *
   * Scoped to the three close-plan arms only. `reportWriteError`'s other
   * callers — save, conflict resolution and native close — keep their copy
   * contract.
   */
  /*
   * T164. The close request currently in flight, so a refusal can be re-issued.
   *
   * A ref rather than a parameter threaded down the chain, because the request
   * genuinely outlives the call stack that started it. `onClosePlanChoice`,
   * `onCloseNormalizationDecision` and `onCloseConflictDecision` all resume a
   * plan prepared in an *earlier* stack — the user answered a prompt in between
   * — so there is no frame left to thread it through. Modelling that as a ref is
   * honest about the lifetime; passing it as an argument would mean
   * reconstructing it at each resumption point, which is exactly the "rebuild
   * the request" mistake that closes the wrong tabs.
   *
   * Set by every path that prepares a plan, and read only when reporting a
   * refusal.
   */
  const [externalEpoch, setExternalEpoch] = useState(0);
  /*
   * T191. Installs a buffer produced by a foreground external-change reload.
   *
   * The tab strip cannot install a buffer itself, because
   * `useGuardedActivation` is the single install seam and re-implementing its
   * checks elsewhere is the defect T128 removed. So the app-level prompt
   * reports the acknowledgement here and this claims a generation, offers it
   * to the guard, and advances the epoch that restarts the editor session.
   */
  const installExternalReload = useCallback(
    (acknowledgement: ActiveBuffer | undefined): void => {
      if (acknowledgement === undefined) return;
      const generation = activation.begin();
      activation.acknowledge(
        generation,
        acknowledgement,
        acknowledgement.documentId,
      );
      setExternalEpoch((epoch) => epoch + 1);
    },
    [activation],
  );
  const tabExternalConflictValid =
    tabExternalConflict === null ||
    documentsById[tabExternalConflict.documentId]?.contentRevision ===
      undefined ||
    documentsById[tabExternalConflict.documentId]?.contentRevision ===
      tabExternalConflict.contentRevision;
  const onTabExternalConflictDecision = useCallback(
    async (decision: ExternalChangeDecision): Promise<void> => {
      const preview = tabExternalConflict;
      if (preview === null) return;
      if (decision === 'keep-mine' && !tabExternalConflictValid) return;

      let result: ConflictResult;
      switch (decision) {
        case 'reload':
          result = await documentConflictAdapter.reloadFromDisk(
            preview.documentId,
            preview.contentRevision,
            preview.detectedDiskVersion,
          );
          break;
        case 'keep-mine':
          result = await documentConflictAdapter.authorizeKeepMine(
            preview.documentId,
            preview.contentRevision,
            preview.path ?? '',
            preview.detectedDiskVersion,
          );
          break;
        case 'skip':
          result = await documentConflictAdapter.skipConflict(
            preview.documentId,
            preview.contentRevision,
            preview.detectedDiskVersion,
          );
          break;
        case 'cancel':
          result = await documentConflictAdapter.cancelConflict(
            preview.documentId,
            preview.contentRevision,
            preview.detectedDiskVersion,
          );
          break;
      }

      if (result.error !== undefined) {
        reportClassifiedError(
          dispatch,
          result.error,
          'The external-change decision could not be completed.',
        );
        if (result.preview !== undefined)
          setTabExternalConflict(result.preview);
        return;
      }
      if (result.preview !== undefined) {
        setTabExternalConflict(result.preview);
        return;
      }
      if (decision === 'reload') {
        installExternalReload(result.activeBuffer);
      }
      setTabExternalConflict(null);
    },
    [
      dispatch,
      installExternalReload,
      tabExternalConflict,
      tabExternalConflictValid,
    ],
  );
  const closeRequestRef = useRef<
    { kind: ClosePlanKind; targetDocumentIds: string[] } | undefined
  >(undefined);
  /*
   * T165. The slot the tab strip fills with its own remediation executor.
   *
   * A reorder Retry has to run where the strip's state is, because FR-FT-034
   * requires the completed move to be announced and the announcement is built
   * from the disambiguated label and the strip's length. See
   * `TabRemediationContext` for why this is a ref rather than a prop, and why
   * rebuilding the labels here was rejected.
   */
  const tabRemediationRef = useRef<TabRemediationExecutor | undefined>(
    undefined,
  );
  const reportClosePlanError = useCallback(
    (error: ClassifiedError | undefined): void => {
      /*
       * Which Retry this failure earns depends on which arm asked.
       *
       * A native quit re-issues the *request* to the frame (`quit`), because
       * `cancelNativeClose` has already run and there is no pending close left
       * to re-prepare. A tab close re-prepares with its original kind and
       * targets (`close-documents`). Offering `close-documents` on the native
       * arm would close tabs when the user asked to quit; offering `quit` on the
       * tab arm would quit when the user asked to close a tab. They are not
       * interchangeable, which is why this is decided here rather than by a
       * single default.
       */
      const request = closeRequestRef.current;
      const options = nativeClosePendingRef.current
        ? ({ intent: 'quit' } as const)
        : request === undefined
          ? undefined
          : ({ intent: 'close-documents', retry: { close: request } } as const);
      reportClassifiedError(
        dispatch,
        error,
        t('notification.error.io.title'),
        options,
      );
    },
    [dispatch],
  );
  /*
   * The one caller that must NOT move onto the classified path.
   *
   * Everything else `reportWriteError` backs carries a real `ClassifiedError`
   * that Go built and sanitized. This does not: it wraps whatever the bridge
   * threw, and `parseError` falls back to `String(error)` for anything that is
   * not a `WireError` (`logic/utils/parseError.ts:65`) — raw JS or OS error text.
   * The classified error contract says a user-facing message MUST NEVER include
   * raw OS error text or a stack cause, so `localizedErrorCopy` substituting
   * generic copy is protective here rather than lossy. Keeping the `io` code
   * also keeps the strings the user already sees unchanged.
   */
  const reportNativeCloseError = useCallback(
    (error: unknown): void => {
      const parsed = parseError(error);
      dispatch(
        notifyError(
          { ...parsed, code: 'io', details: { subject: 'native-close' } },
          'native-close:io-failure',
        ),
      );
    },
    [dispatch],
  );
  const cancelNativeClose = useCallback(async (): Promise<void> => {
    if (!nativeClosePendingRef.current) return;
    const closeID = nativeCloseIdRef.current;
    try {
      if (shutdownControllerRef.current !== undefined) {
        await shutdownControllerRef.current.cancelQuit(closeID);
      } else {
        await nativeLifecycleAdapter.cancelQuit(closeID);
      }
      nativeClosePendingRef.current = false;
      setNativeClosePending(false);
      nativeCloseIdRef.current = '';
    } catch (error) {
      reportNativeCloseError(error);
    }
  }, [reportNativeCloseError]);
  const clearCloseState = useCallback((): void => {
    setClosePlan(null);
    setCloseNormalization(null);
    setCloseConflict(null);
  }, []);
  const completeClosePlan = useCallback(
    async (planId: string): Promise<TabTransitionResult> => {
      const isNativeClose = nativeClosePendingRef.current;
      let result: TabTransitionResult;
      try {
        result = await closePlanAdapter.executeClosePlan(planId);
      } catch (error) {
        if (isNativeClose) {
          reportNativeCloseError(error);
          await cancelNativeClose();
        }
        throw error;
      }
      clearCloseState();
      if (result.error !== undefined) {
        reportClosePlanError(result.error);
        if (isNativeClose) await cancelNativeClose();
      } else if (result.activeBuffer !== undefined) {
        replaceActiveBuffer(result.activeBuffer);
      } else if (
        result.activeDocumentId === undefined ||
        result.activeDocumentId === ''
      ) {
        replaceActiveBuffer(null);
      }
      if (
        result.error === undefined &&
        result.orderedDocumentIds.length === 0
      ) {
        const reconciled = await appModelAdapter.getState();
        if ((reconciled.snapshot.orderedDocumentIds ?? []).length === 0) {
          dispatch(hydrateProjection(reconciled.snapshot));
        }
      }
      if (isNativeClose && result.error === undefined) {
        try {
          const closeID = nativeCloseIdRef.current;
          const refusal =
            shutdownControllerRef.current !== undefined
              ? await shutdownControllerRef.current.authorizeQuit(closeID)
              : await nativeLifecycleAdapter.authorizeQuit(closeID);
          if (refusal === undefined) {
            shutdownControllerRef.current?.clearPendingClose(closeID);
            nativeClosePendingRef.current = false;
            setNativeClosePending(false);
            nativeCloseIdRef.current = '';
          } else {
            /*
             * A refused drain, on the classified path rather than through
             * `reportNativeCloseError`. Everything Go sends here is a
             * `ClassifiedError` it built and sanitized — the case the comment on
             * `reportNativeCloseError` excludes — so its own message survives
             * and FR-FT-027's Retry becomes a control that re-asks the frame to
             * close.
             */
            reportClassifiedError(
              dispatch,
              refusal,
              t('notification.error.io.title'),
              { intent: 'quit' },
            );
            await cancelNativeClose();
          }
        } catch (error) {
          reportNativeCloseError(error);
          await cancelNativeClose();
        }
      }
      return result;
    },
    [
      cancelNativeClose,
      clearCloseState,
      dispatch,
      reportClosePlanError,
      reportNativeCloseError,
    ],
  );
  const processClosePlanResult = useCallback(
    async (
      result: ClosePlanResult,
    ): Promise<TabTransitionResult | undefined> => {
      if (result.error !== undefined) {
        clearCloseState();
        reportClosePlanError(result.error);
        await cancelNativeClose();
        return undefined;
      }
      const summary = result.data;
      if (summary === undefined) return undefined;
      if (
        summary.status === 'cancelled' ||
        summary.status === 'failed' ||
        summary.status === 'complete'
      ) {
        clearCloseState();
        await cancelNativeClose();
        return undefined;
      }
      const normalizationTarget = summary.targets.find(
        (target) =>
          target.dirty &&
          target.choice === 'save' &&
          target.normalizationToken !== undefined,
      );
      if (summary.status === 'ready' && normalizationTarget === undefined) {
        return completeClosePlan(summary.id);
      }

      if (
        nativeClosePendingRef.current &&
        recoveryQuitConfirmedRef.current &&
        recoverySurface !== null
      ) {
        const discarded = await closePlanAdapter.resolveClosePlan(summary.id, [
          { choice: 'discard-all' },
        ]);
        if (discarded.error !== undefined) {
          clearCloseState();
          reportClosePlanError(discarded.error);
          await cancelNativeClose();
          return undefined;
        }
        if (discarded.data?.status === 'ready') {
          return completeClosePlan(discarded.data.id);
        }
        return undefined;
      }

      setClosePlan(summary);
      if (normalizationTarget !== undefined) {
        setCloseConflict(null);
        setCloseNormalization({
          planId: summary.id,
          documentId: normalizationTarget.documentId,
          contentRevision: normalizationTarget.contentRevision,
          decisionToken: normalizationTarget.normalizationToken as string,
          proposedEnding: normalizationTarget.proposedEnding ?? 'lf',
          filename:
            normalizationTarget.displayName ?? normalizationTarget.title,
        });
        return undefined;
      }
      const conflictTarget = summary.targets.find(
        (target) =>
          target.dirty &&
          target.choice === 'save' &&
          target.conflict !== undefined,
      );
      setCloseNormalization(null);
      if (
        conflictTarget !== undefined &&
        conflictTarget.conflict !== undefined
      ) {
        setCloseConflict({
          planId: summary.id,
          documentId: conflictTarget.documentId,
          preview: conflictTarget.conflict,
        });
      } else {
        setCloseConflict(null);
      }
      return undefined;
    },
    [
      cancelNativeClose,
      clearCloseState,
      completeClosePlan,
      recoverySurface,
      reportClosePlanError,
    ],
  );
  const resolvePreparedClosePlan = useCallback(
    async (
      prepared: ClosePlanResult,
    ): Promise<TabTransitionResult | undefined> => {
      if (prepared.data?.status !== 'ready') {
        return processClosePlanResult(prepared);
      }
      const resolved = await closePlanAdapter.resolveClosePlan(
        prepared.data.id,
        [],
      );
      return processClosePlanResult(resolved);
    },
    [processClosePlanResult],
  );
  const prepareNativeClosePlan = useCallback(async (): Promise<void> => {
    try {
      const state = await appModelAdapter.getState();
      if (
        recoverySurface === null &&
        state.activeBuffer?.documentId !== undefined
      ) {
        await appModelAdapter.flushActiveSession?.(
          state.activeBuffer.documentId,
        );
      }
      const targets = state.snapshot.orderedDocumentIds ?? orderedDocumentIds;
      const prepared = await closePlanAdapter.prepareClose(
        'quit',
        targets,
        state.snapshot.tabSetRevision ?? 0,
      );
      await resolvePreparedClosePlan(prepared);
    } catch (error) {
      reportNativeCloseError(error);
      await cancelNativeClose();
    }
  }, [
    cancelNativeClose,
    orderedDocumentIds,
    recoverySurface,
    reportNativeCloseError,
    resolvePreparedClosePlan,
  ]);
  const onNativeCloseRequested = useCallback(
    async (closeID: string): Promise<void> => {
      if (nativeClosePendingRef.current) return;
      nativeCloseIdRef.current = closeID;
      nativeClosePendingRef.current = true;
      recoveryQuitConfirmedRef.current = false;
      setNativeClosePending(true);
      if (recoverySurface !== null) {
        setRecoveryQuitConfirmOpen(true);
        return;
      }
      await prepareNativeClosePlan();
    },
    [prepareNativeClosePlan, recoverySurface],
  );
  const shutdownController = useShutdown({
    bootstrapStatus,
    hydratedPendingCloseId,
    onPendingChange: (closeID): void => {
      setNativeClosePending(closeID !== null);
    },
    onRequest: onNativeCloseRequested,
  });
  useEffect((): void => {
    shutdownControllerRef.current = shutdownController;
  }, [shutdownController]);
  const onRecoveryQuitConfirm = useCallback((): void => {
    if (!nativeClosePendingRef.current || recoverySurface === null) return;
    recoveryQuitConfirmedRef.current = true;
    setRecoveryQuitConfirmOpen(false);
    void prepareNativeClosePlan();
  }, [prepareNativeClosePlan, recoverySurface]);
  const onRecoveryQuitCancel = useCallback((): void => {
    setRecoveryQuitConfirmOpen(false);
    void cancelNativeClose();
  }, [cancelNativeClose]);
  const requestRecoveryQuit = useCallback((): void => {
    nativeLifecycleAdapter.requestQuit();
  }, []);
  const onClosePlanChoice = useCallback(
    async (choice: CloseChoice): Promise<void> => {
      const plan = closePlan;
      if (plan === null) return;
      const dirtyTargets = plan.targets.filter((target) => target.dirty);
      const decisions: ClosePlanDecision[] =
        plan.kind === 'single' && dirtyTargets.length === 1
          ? [
              {
                choice,
                documentId: dirtyTargets[0].documentId,
              },
            ]
          : [{ choice }];
      const result = await closePlanAdapter.resolveClosePlan(
        plan.id,
        decisions,
      );
      await processClosePlanResult(result);
    },
    [closePlan, processClosePlanResult],
  );
  const onCloseNormalizationDecision = useCallback(
    async (confirm: boolean): Promise<void> => {
      const plan = closePlan;
      const requirement = closeNormalization;
      if (plan === null || requirement === null) return;
      const decisions = confirm
        ? closePlanDecisions(plan, {
            documentId: requirement.documentId,
            decisionToken: requirement.decisionToken,
          })
        : [{ documentId: requirement.documentId, choice: 'cancel' as const }];
      const result = await closePlanAdapter.resolveClosePlan(
        requirement.planId,
        decisions,
      );
      await processClosePlanResult(result);
    },
    [closeNormalization, closePlan, processClosePlanResult],
  );
  const closeConflictValid =
    closeConflict === null ||
    closePlan?.targets.find(
      (target) => target.documentId === closeConflict.documentId,
    )?.contentRevision === closeConflict.preview.contentRevision;
  const onCloseConflictDecision = useCallback(
    async (decision: ExternalChangeDecision): Promise<void> => {
      const conflict = closeConflict;
      const plan = closePlan;
      if (conflict === null || plan === null) return;
      if (decision === 'keep-mine' && !closeConflictValid) return;
      if (decision === 'keep-mine') {
        if (activeBuffer?.documentId === conflict.documentId) {
          await appModelAdapter.flushActiveSession?.(conflict.documentId);
        }
        const result = await documentConflictAdapter.authorizeKeepMine(
          conflict.documentId,
          conflict.preview.contentRevision,
          conflict.preview.path ?? '',
          conflict.preview.detectedDiskVersion,
        );
        if (result.error !== undefined) {
          reportWriteError(result.error, conflict.documentId);
          if (result.preview !== undefined) {
            setCloseConflict({ ...conflict, preview: result.preview });
          }
          return;
        }
        if (result.decisionToken === undefined) return;
        const resolved = await closePlanAdapter.resolveClosePlan(
          conflict.planId,
          closePlanDecisions(plan, {
            documentId: conflict.documentId,
            decisionToken: result.decisionToken,
          }),
        );
        await processClosePlanResult(resolved);
        return;
      }
      if (decision === 'reload') {
        await closePlanAdapter.resolveClosePlan(plan.id, [
          { choice: 'cancel' },
        ]);
        const result = await documentConflictAdapter.reloadFromDisk(
          conflict.documentId,
          conflict.preview.contentRevision,
          conflict.preview.detectedDiskVersion,
        );
        if (result.error !== undefined) {
          reportWriteError(result.error, conflict.documentId);
          return;
        }
        if (result.activeBuffer !== undefined)
          replaceActiveBuffer(result.activeBuffer);
        clearCloseState();
        const state = await appModelAdapter.getState();
        const prepared = await closePlanAdapter.prepareClose(
          plan.kind,
          plan.targets.map((target) => target.documentId),
          state.snapshot.tabSetRevision ?? plan.tabSetRevision,
        );
        await resolvePreparedClosePlan(prepared);
        return;
      }
      const cancelled = await closePlanAdapter.resolveClosePlan(plan.id, [
        { choice: 'cancel' },
      ]);
      await processClosePlanResult(cancelled);
    },
    [
      activeBuffer?.documentId,
      clearCloseState,
      closeConflict,
      closeConflictValid,
      closePlan,
      processClosePlanResult,
      reportWriteError,
      resolvePreparedClosePlan,
    ],
  );
  const onCloseDocument = useCallback(
    async (
      documentId: string,
      expectedTabSetRevision: number,
      kind: ClosePlanKind = 'single',
      targetDocumentIds: string[] = [documentId],
    ): Promise<TabTransitionResult> => {
      const targets =
        targetDocumentIds.length > 0 ? targetDocumentIds : [documentId];
      // The only frame that holds the request. Everything below reports with a
      // plan id, which is the thing the backend refuses as stale.
      closeRequestRef.current = { kind, targetDocumentIds: targets };
      if (
        activeBuffer?.documentId !== undefined &&
        targets.includes(activeBuffer.documentId)
      ) {
        await appModelAdapter.flushActiveSession?.(activeBuffer.documentId);
      }
      const prepared = await closePlanAdapter.prepareClose(
        kind,
        targets,
        expectedTabSetRevision,
      );
      const transition = await resolvePreparedClosePlan(prepared);
      return (
        transition ?? {
          status: 'noop',
          orderedDocumentIds,
        }
      );
    },
    [activeBuffer, orderedDocumentIds, resolvePreparedClosePlan],
  );
  /*
   * FR-FT-037 wants Copy path announced in a *transient polite* live region, not
   * an assertive one, so this cannot ride the toast surface — a toast root is
   * `aria-live="assertive"`. Same clear/set/clear shape as the tab strip's own
   * announcer (`DocumentTabs.tsx:168-172`) so a repeat of the same string still
   * re-announces.
   */
  const announceRemediation = useCallback((message: string): void => {
    setRemediationAnnouncement('');
    window.setTimeout((): void => setRemediationAnnouncement(message), 0);
    window.setTimeout((): void => setRemediationAnnouncement(''), 3000);
  }, []);
  /*
   * The command behind a classified failure's remediation control.
   *
   * The control itself was unreachable until now — `Toast.tsx` rendered it only
   * when a caller passed `onRemediate`, and this render site never did, so every
   * remediation `reportClassifiedError` built was constructed and discarded.
   * Wiring it is only half the fix: a button that renders and calls nothing is
   * the same defect with a control attached. `remediation.intent` is what a
   * caller must name to earn the button, and the switch below is exhaustive, so
   * a new intent that names no command fails the build.
   */
  /*
   * Re-issue the command a `Retry` names, against a revision read fresh.
   *
   * Each arm calls the same handler the original invocation used, so the flush,
   * the active-buffer update and the re-report of a second refusal all stay in
   * one place — a retry that duplicated those would drift from the first
   * attempt, which is the shape of defect this task exists to avoid.
   */
  const retryEntryCommand = useCallback(
    async (
      remediation: NotificationRemediation,
      revision: number,
    ): Promise<EntryCommandOutcome | undefined> => {
      switch (remediation.intent) {
        case 'new-document':
          return onNewDocument(revision);
        case 'open-document':
          return onOpenDocument(revision);
        case 'open-recent':
          // `remediationsFor` refuses to offer this control without a path, so
          // the guard is a type narrowing rather than a reachable branch.
          return remediation.path === undefined
            ? undefined
            : onOpenRecentFile(remediation.path, revision);
        case 'reopen-last':
          return onReopenLastFile(revision);
        case 'activate-document':
          return remediation.documentId === undefined
            ? undefined
            : onActivateDocument(remediation.documentId, revision);
        default:
          return undefined;
      }
    },
    [
      onActivateDocument,
      onNewDocument,
      onOpenDocument,
      onOpenRecentFile,
      onReopenLastFile,
    ],
  );
  const onRemediate = useCallback(
    async (
      remediation: NotificationRemediation,
      notificationId: number,
      safeSubject: string,
    ): Promise<void> => {
      switch (remediation.intent) {
        case 'command': {
          const requestId = remediation.requestId;
          if (requestId === undefined) return;
          if (remediation.action === 'retry-command') {
            commandAdapter?.retry(requestId);
          } else if (remediation.action === 'cancel-command') {
            commandAdapter?.cancel(requestId);
          }
          return;
        }
        case 'copy-path': {
          const documentId = remediation.documentId;
          if (documentId === undefined) return;
          const result = await appModelAdapter.copyPath?.(documentId);
          if (result?.error !== undefined) {
            // A failed remediation is itself a classified failure, and it keeps
            // its own Copy path so a transient clipboard refusal stays retryable.
            reportClassifiedError(
              dispatch,
              result.error,
              t('notification.error.io.title'),
              { intent: 'copy-path' },
            );
            return;
          }
          if (result?.status !== 'copied') return;
          dispatch(dismissNotification(notificationId));
          announceRemediation(
            t('editor.tab.copiedPath', { filename: safeSubject }),
          );
          return;
        }
        case 'reveal': {
          /*
           * The Retry the contract pairs with a Reveal failure. It has to re-run
           * *Reveal*: while the toast could carry only one control this arm did
           * not exist, so the reveal caller had no honourable intent to name and
           * the mapping dropped Retry rather than hand it the copy-path command.
           */
          const documentId = remediation.documentId;
          if (documentId === undefined) return;
          const result =
            await appModelAdapter.revealInFileManager?.(documentId);
          if (result?.error !== undefined) {
            reportClassifiedError(
              dispatch,
              result.error,
              t('notification.error.io.title'),
              { intent: 'reveal' },
            );
            return;
          }
          // FR-FT-037 treats OS acceptance as success and requires no toast; the
          // failure that produced this control is resolved, so it goes.
          if (result?.status !== 'revealed') return;
          dispatch(dismissNotification(notificationId));
          return;
        }
        case 'new-document':
        case 'open-document':
        case 'open-recent':
        case 'reopen-last':
        case 'activate-document': {
          /*
           * The whole reason this arm exists: the refusal these controls
           * remediate is "The tab set changed; … must be retried", so the
           * revision that failed is by definition stale and re-sending it would
           * refuse identically — the same reasoning that makes the write arm
           * below use `beginWrite` rather than `finishWrite`. The fresh
           * revision is read from the backend rather than from the store,
           * because the store is a projection and the patch carrying the change
           * may not have arrived yet.
           */
          const state = await appModelAdapter.getState();
          const revision = state.snapshot.tabSetRevision ?? 0;
          const result = await retryEntryCommand(remediation, revision);
          if (result === undefined) return;
          if (result.error !== undefined) {
            /*
             * T170. A refused retry used to return in silence, leaving the
             * standing toast with its original message and no sign the second
             * attempt had failed too.
             *
             * Reported *here*, and only for `activate-document`. The other four
             * intents call `reportEntryError` inside their own handlers, so
             * reporting them again would duplicate. And this cannot move into
             * `onActivateDocument` either, tempting as the symmetry is: in
             * production `DocumentTabs.runActivation` calls that handler and
             * `DocumentTabs.activateDocument` then reports the same error, so a
             * self-reporting handler would report twice per tab click. That is
             * exactly the defect recorded at `notificationsSlice.ts:180-183`,
             * where a Save refused twice put the Retry button behind a `×2`
             * that read like the dedup count working. The `Retry` control is
             * the one path the strip's funnel never sees.
             */
            if (remediation.intent === 'activate-document') {
              reportClassifiedError(dispatch, result.error, t('editor.tabs'), {
                intent: 'activate-document',
                retry: { documentId: remediation.documentId },
              });
            }
            return;
          }
          dispatch(dismissNotification(notificationId));
          return;
        }
        case 'reorder-document': {
          /*
           * Delegated, not executed here. The strip owns the command and its
           * FR-FT-034 announcement together; App owns the toast. If no strip is
           * mounted the slot is empty and the toast stands — there is no tab to
           * move, so silently dismissing it would be a lie.
           */
          const state = await appModelAdapter.getState();
          const handled = await tabRemediationRef.current?.(
            remediation,
            state.snapshot.tabSetRevision ?? 0,
          );
          if (handled !== true) return;
          dispatch(dismissNotification(notificationId));
          return;
        }
        case 'close-documents': {
          /*
           * T164. Re-prepares the close the backend refused as stale, with the
           * *original* kind and targets and a revision read fresh from the
           * backend — the same reasoning as the entry arm above, and the same
           * reason the plan id is not reused: the id is precisely what was
           * refused, so `executeClosePlan` would refuse identically.
           *
           * `onCloseDocument` re-enters the whole prepare/resolve/execute
           * sequence, including the dirty-close prompt, so a document that
           * became modified while the toast stood is still protected.
           */
          const request = remediation.close;
          if (request === undefined) return;
          const state = await appModelAdapter.getState();
          const revision = state.snapshot.tabSetRevision ?? 0;
          const result = await onCloseDocument(
            request.targetDocumentIds[0] ?? '',
            revision,
            request.kind,
            request.targetDocumentIds,
          );
          /*
           * `onCloseDocument` reports its own refusal through
           * `reportClosePlanError`, which offers this control again against the
           * newer revision. Reporting here too would be the `×2` T188 removed
           * from the activation path.
           */
          if (result.error !== undefined) return;
          dispatch(dismissNotification(notificationId));
          return;
        }
        case 'quit': {
          /*
           * The Retry FR-FT-027 pairs with a drain failure. The pending close
           * was cancelled when the drain refused, so this restarts the whole
           * sequence — close request, plan, drain, permit — rather than
           * re-authorizing a request that no longer exists.
           *
           * The toast is dismissed here rather than on a result, because
           * `requestQuit` is fire-and-forget: the native frame answers by
           * emitting a fresh close request, not by returning.
           */
          dispatch(dismissNotification(notificationId));
          nativeLifecycleAdapter.requestQuit();
          return;
        }
        case 'save':
        case 'save-as': {
          /*
           * `beginWrite`, not `finishWrite`. `finishWrite` would reuse the exact
           * `contentRevision` and decision token the backend just refused, so it
           * would deterministically refuse again. `beginWrite` re-flushes the
           * session and re-reads the state first, which is what makes a retry
           * after a conflict or a transient IO failure able to succeed at all.
           */
          /*
           * The document id comes from the remediation, not from the active
           * projection: a `Save to recreate` belongs to the document its toast
           * names, which for a Copy path or Reveal failure raised from the tab
           * context menu need not be the active one. It is `undefined` for a
           * plain Save retry, where `beginWrite` falls back to the active
           * document exactly as before. T160.
           */
          const result = await beginWrite(
            remediation.intent,
            remediation.documentId,
          );
          if (result?.status !== 'committed') return;
          dispatch(dismissNotification(notificationId));
          return;
        }
        default: {
          const unhandledIntent: never = remediation.intent;
          return unhandledIntent;
        }
      }
    },
    [
      announceRemediation,
      beginWrite,
      dispatch,
      onCloseDocument,
      retryEntryCommand,
    ],
  );
  const surfaceNotices: readonly NotificationNotice[] = useMemo(
    () =>
      notifications.map((notification) => ({
        id: notification.id,
        code: notification.code,
        count: notification.count,
        kind:
          notification.code === 'command-stuck'
            ? ('stuck' as const)
            : notification.severity === 'error'
              ? ('error' as const)
              : ('warning' as const),
        message: notification.message,
        persistent: notification.persistent,
        tone: notification.severity,
        title: notification.title,
        actions: notification.remediations.map((remediation) => ({
          id: `${remediation.action}:${remediation.intent}:${remediation.documentId ?? ''}`,
          label: t(remediation.labelKey),
          onActivate: (): void => {
            void onRemediate(remediation, notification.id, notification.title);
          },
        })),
      })),
    [notifications, onRemediate],
  );
  const surfaceBanners: readonly NotificationNotice[] = useMemo(
    () =>
      banners.map((notification) => ({
        id: notification.id,
        code: notification.code,
        count: notification.count,
        kind:
          notification.severity === 'error'
            ? ('error' as const)
            : ('warning' as const),
        message: notification.message,
        title: notification.title,
        tone: notification.severity,
        actions: [],
      })),
    [banners],
  );
  const onQuit = useCallback((): void => {
    nativeLifecycleAdapter.requestQuit();
  }, []);
  const externalConflictValid =
    externalConflict === null ||
    activeDocument?.contentRevision === undefined ||
    activeDocument.contentRevision === externalConflict.preview.contentRevision;
  const onExternalConflictDecision = useCallback(
    async (decision: ExternalChangeDecision): Promise<void> => {
      const current = externalConflict;
      if (current === null) return;
      if (decision === 'keep-mine' && !externalConflictValid) return;
      await appModelAdapter.flushActiveSession?.(current.documentId);
      let result;
      /*
       * Claimed before the command is issued, exactly as the five activation
       * handlers do. FR-FT-030 covers "activating a tab **or reloading the
       * active document**", and this is the sixth handler the guard's contract
       * anticipates — reload had been installing on an identity check alone.
       * T169.
       */
      let reloadGeneration = 0;
      switch (decision) {
        case 'reload':
          reloadGeneration = activation.begin();
          result = await documentConflictAdapter.reloadFromDisk(
            current.documentId,
            current.preview.contentRevision,
            current.preview.detectedDiskVersion,
          );
          break;
        case 'keep-mine':
          result = await documentConflictAdapter.authorizeKeepMine(
            current.documentId,
            current.preview.contentRevision,
            current.preview.path ?? '',
            current.preview.detectedDiskVersion,
          );
          break;
        case 'skip':
          result = await documentConflictAdapter.skipConflict(
            current.documentId,
            current.preview.contentRevision,
            current.preview.detectedDiskVersion,
          );
          break;
        case 'cancel':
          result = await documentConflictAdapter.cancelConflict(
            current.documentId,
            current.preview.contentRevision,
            current.preview.detectedDiskVersion,
          );
          break;
      }
      if (result.error !== undefined) {
        reportWriteError(result.error, current.documentId);
        if (result.preview !== undefined) {
          setExternalConflict({ ...current, preview: result.preview });
        }
        return;
      }
      if (decision === 'reload') {
        const refreshedState = await appModelAdapter.getState();
        /*
         * The fresher of the two answers is still preferred — the backend
         * publishes the reloaded text into the projection, and re-reading picks
         * it up — but neither is installed directly any more. `acknowledge`
         * applies FR-FT-030's whole rule: the generation must still be current,
         * the acknowledgement's identity must be the document the reload named,
         * and the confirmed active projection must still agree on both identity
         * and revision. The old `else` arm installed `result.activeBuffer` with
         * no check at all, and it ran precisely when the refreshed state showed
         * a *different* active document — so a reload overtaken by a tab switch
         * wrote its text over whatever the user had switched to. T169.
         */
        const acknowledgement =
          refreshedState.activeBuffer?.documentId === current.documentId
            ? refreshedState.activeBuffer
            : result.activeBuffer;
        activation.acknowledge(
          reloadGeneration,
          acknowledgement,
          current.documentId,
        );
        /*
         * T191. Restart the editor session so the reloaded text actually
         * reaches Monaco, which is seeded once per session. Bumped here and
         * nowhere else: this is the only path that replaces the document's text
         * with something the editor did not produce.
         */
        setExternalEpoch((epoch) => epoch + 1);
        setExternalConflict(null);
        return;
      }
      if (decision === 'keep-mine' && result.decisionToken !== undefined) {
        setExternalConflict(null);
        await finishWrite(
          current.kind,
          current.documentId,
          current.preview.contentRevision,
          result.decisionToken,
          current.filename,
        );
        return;
      }
      setExternalConflict(null);
    },
    [
      activation,
      externalConflict,
      externalConflictValid,
      finishWrite,
      reportWriteError,
    ],
  );
  // Keep the existing modal contract explicit for menu and keyboard consumers.
  const modalOpen =
    settingsOpen ||
    aboutOpen ||
    shortcutsOpen ||
    normalization !== null ||
    externalConflict !== null ||
    tabExternalConflict !== null ||
    closePlan !== null ||
    closeNormalization !== null ||
    closeConflict !== null ||
    nativeClosePending ||
    recoveryQuitConfirmOpen;
  const onNormalizeConfirm = useCallback(async (): Promise<void> => {
    if (normalization === null) return;
    await finishWrite(
      normalization.kind,
      normalization.documentId,
      normalization.contentRevision,
      normalization.decisionToken,
      normalization.filename,
    );
  }, [finishWrite, normalization]);
  const applicationMenuState = useMemo<ApplicationMenuState>(
    () => ({
      modalOpen,
      onAbout: (): void => setAboutOpen(true),
      onNewDocument,
      onOpenDocument,
      onOpenRecentFile,
      onReopenLastFile,
      onSave,
      onSaveAs,
      onCloseDocument,
      onQuit,
      documentId: activeDocument?.documentId,
      sessionDocumentId: activeBuffer?.documentId,
      writable:
        activeDocument !== undefined &&
        activeDocument.status !== 'read-only' &&
        // Same correction as in `beginWrite`: the bare `read-only` literal is
        // not a value Go ever emits for `capability`.
        (activeDocument.capability === undefined ||
          activeDocument.capability === 'writable'),
      // `detached` was a fourth conjunct here and it is the *other* half of the
      // FR-FT-023 defect T160 removes. `writable` reaches `Menubar/Menubar.tsx`,
      // which draws Save and Save As unavailable, so a detached document could
      // not even dispatch the write that `beginWrite` would then have refused.
      // Recreating the file is precisely what the requirement asks Save to do,
      // so detachment must not make the command unavailable.
      onShortcuts: (): void => setShortcutsOpen(true),
      requestedMenu: requestedApplicationMenu,
      onRequestedMenuHandled: (): void => setRequestedApplicationMenu(null),
    }),
    [
      activeBuffer?.documentId,
      activeDocument,
      onCloseDocument,
      onNewDocument,
      onOpenDocument,
      onOpenRecentFile,
      onReopenLastFile,
      onSave,
      onSaveAs,
      onQuit,
      modalOpen,
      requestedApplicationMenu,
    ],
  );

  useEffect((): (() => void) | undefined => {
    if (bootstrapStatus !== 'ready') {
      return undefined;
    }

    let disposed = false;
    const reportNativeGeometry = (): void => {
      void import('../logic/adapter').then(
        async ({ appModelAdapter, windowAdapter }): Promise<void> => {
          const geometry = await windowAdapter.getNativeGeometry();
          if (disposed) {
            return;
          }
          await appModelAdapter.setUILayout({
            windowHeight: geometry.height,
            windowMaximized: geometry.maximized,
            windowWidth: geometry.width,
          });
        },
      );
    };
    window.addEventListener('resize', reportNativeGeometry);
    return (): void => {
      disposed = true;
      window.removeEventListener('resize', reportNativeGeometry);
    };
  }, [bootstrapStatus]);

  return (
    <ModalStateProvider modalOpen={modalOpen}>
      <TabRemediationContext.Provider value={tabRemediationRef}>
        <EditorSessionProvider
          activeBuffer={activeBuffer}
          externalEpoch={externalEpoch}
          onExternalReload={installExternalReload}
        >
          <ApplicationMenuRequestContext.Provider
            value={setRequestedApplicationMenu}
          >
            <div className="application-frame">
              <AppearanceSettingsProvider
                settingsOpen={settingsOpen}
                onSettingsOpenChange={setSettingsOpen}
              >
                <div className="application-menu">
                  {bootstrapStatus === 'ready' ? (
                    <ApplicationMenubar menuState={applicationMenuState} />
                  ) : null}
                </div>
                <AppearanceControlsContent
                  visible={bootstrapStatus === 'ready'}
                />
              </AppearanceSettingsProvider>
              <div className="application-content">
                <Notifications
                  banners={bootstrapStatus === 'ready' ? surfaceBanners : []}
                  notices={bootstrapStatus === 'ready' ? surfaceNotices : []}
                  onDismiss={(id: number): void => {
                    dispatch(dismissNotification(id));
                  }}
                />
                {bootstrapStatus === 'failed' ? (
                  <StartupFailure
                    failure={startupFailure}
                    isRetrying={isRetrying}
                    onQuit={nativeLifecycleAdapter.requestQuit}
                    onRetry={retryBootstrap}
                  />
                ) : bootstrapStatus === 'ready' ? (
                  <>
                    {recoverySurface !== null ? (
                      <section aria-label={t('recovery.title')} role="alert">
                        <p>{recoverySurface.message}</p>
                        <Button
                          variant="secondary"
                          onClick={requestRecoveryQuit}
                        >
                          {t('recovery.quit.action')}
                        </Button>
                      </section>
                    ) : null}
                    <AppShell
                      onNewDocument={onNewDocument}
                      onOpenDocument={onOpenDocument}
                      onOpenRecentFile={(
                        path,
                        expectedTabSetRevision,
                      ): Promise<unknown> =>
                        onOpenRecentFile(path, expectedTabSetRevision)
                      }
                      onActivateDocument={onActivateDocument}
                      onCloseDocument={onCloseDocument}
                      onExternalConflict={setTabExternalConflict}
                    />
                  </>
                ) : null}
              </div>
              <AboutDialog
                open={bootstrapStatus === 'ready' && aboutOpen}
                onOpenChange={setAboutOpen}
                version={version}
              />
              <ShortcutsDialog
                open={bootstrapStatus === 'ready' && shortcutsOpen}
                onOpenChange={setShortcutsOpen}
              />
              <NormalizationPrompt
                filename={normalization?.filename ?? ''}
                onCancel={(): void => {
                  /*
                   * FR-FT-011: the confirmation is single-use and "cancellation
                   * MUST resume nothing". Closing the prompt was resuming
                   * nothing already; what it was not doing is releasing the
                   * authorization it was raised with, so `service.normalizations`
                   * kept an entry per dismissal for the process lifetime and the
                   * next Save minted another. The token is handed back with the
                   * document it was minted against, because the release is bound
                   * to both. T168.
                   */
                  if (normalization !== null) {
                    void documentWriteAdapter.cancelNormalization(
                      normalization.documentId,
                      normalization.decisionToken,
                    );
                  }
                  setNormalization(null);
                }}
                onConfirm={onNormalizeConfirm}
                open={bootstrapStatus === 'ready' && normalization !== null}
                proposedEnding={normalization?.proposedEnding ?? 'lf'}
              />
              <ClosePrompt
                onChoice={onClosePlanChoice}
                open={
                  bootstrapStatus === 'ready' &&
                  closePlan !== null &&
                  closeNormalization === null &&
                  closeConflict === null &&
                  closePlan.status === 'collecting'
                }
                plan={closePlan ?? undefined}
              />
              <NormalizationPrompt
                filename={closeNormalization?.filename ?? ''}
                onCancel={(): void => {
                  void onCloseNormalizationDecision(false);
                }}
                onConfirm={(): void => {
                  void onCloseNormalizationDecision(true);
                }}
                open={
                  bootstrapStatus === 'ready' && closeNormalization !== null
                }
                proposedEnding={closeNormalization?.proposedEnding ?? 'lf'}
              />
              <ExternalChangePrompt
                onDecision={onExternalConflictDecision}
                open={bootstrapStatus === 'ready' && externalConflict !== null}
                preview={externalConflict?.preview}
                valid={externalConflictValid}
              />
              <ExternalChangePrompt
                onDecision={onTabExternalConflictDecision}
                open={
                  bootstrapStatus === 'ready' && tabExternalConflict !== null
                }
                preview={tabExternalConflict ?? undefined}
                valid={tabExternalConflictValid}
              />
              <ExternalChangePrompt
                onDecision={onCloseConflictDecision}
                open={bootstrapStatus === 'ready' && closeConflict !== null}
                preview={closeConflict?.preview}
                valid={closeConflictValid}
              />
              <ModalShell
                dismiss="backdrop"
                initialFocus={recoveryQuitCancelRef}
                onRequestClose={onRecoveryQuitCancel}
                open={bootstrapStatus === 'ready' && recoveryQuitConfirmOpen}
                title={t('recovery.quit.title')}
              >
                <p>{t('recovery.quit.message')}</p>
                {recoverySurface?.message !== undefined ? (
                  <p>{recoverySurface.message}</p>
                ) : null}
                {recoveryDiscardNames.length > 0 ? (
                  <ul aria-label={t('recovery.quit.documents')}>
                    {recoveryDiscardNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                ) : (
                  // Saying so is the honest answer, not silence: the user is
                  // being asked to approve a discard, and "nothing will be
                  // discarded" is information they are entitled to before
                  // pressing it.
                  <p>{t('recovery.quit.documents.none')}</p>
                )}
                <div>
                  <Button
                    ref={recoveryQuitCancelRef}
                    variant="secondary"
                    onClick={onRecoveryQuitCancel}
                  >
                    {t('recovery.quit.cancel')}
                  </Button>
                  <Button variant="primary" onClick={onRecoveryQuitConfirm}>
                    {t('recovery.quit.confirm')}
                  </Button>
                </div>
              </ModalShell>
              <LiveRegion message={remediationAnnouncement} />
            </div>
          </ApplicationMenuRequestContext.Provider>
        </EditorSessionProvider>
      </TabRemediationContext.Provider>
    </ModalStateProvider>
  );
};

const App: React.FC = (): React.JSX.Element => (
  <Provider store={store}>
    <AppContents />
  </Provider>
);

export default App;
