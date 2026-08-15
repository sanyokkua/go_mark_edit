import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Provider } from 'react-redux';

import { t } from './i18n';

import {
  dismissNotification,
  notifyCondition,
  notifyError,
  notifyToast,
  resetNotifications,
  type NotificationRemediation,
  type NotificationRemediationIntent,
} from './logic/store/notificationsSlice';
import { store, useAppDispatch, useAppSelector } from './logic/store';
import { reportClassifiedError } from './logic/store/classifiedNotification';
import {
  setEditorPaneVisible,
  setPreviewPaneVisible,
  setViewArrangement,
} from './logic/store/docViewCommands';
import {
  bootstrapAppModelProjection,
  type AppModelBootstrapResult,
} from './logic/store/appModelProjection';
import { hydrateProjection } from './logic/store/appModelProjectionActions';
import type {
  ActiveBuffer,
  ClassifiedError,
  CloseChoice,
  ClosePlanDecision,
  ConflictPreview,
  ClosePlanKind,
  ClosePlanResult,
  ClosePlanSummary,
  DocumentMetadata,
  DocumentTransitionResult,
  RecoverySurface,
  TabTransitionResult,
  WriteResult,
  ViewArrangement,
} from './logic/store/appModelTypes';
import { setWorkspaceVisible } from './logic/store/uiLayoutCommands';
import {
  appModelAdapter,
  closePlanAdapter,
  documentConflictAdapter,
  documentWriteAdapter,
  nativeLifecycleAdapter,
} from './logic/adapter';
import { parseError } from './logic/utils/parseError';
import { useEditorSettings } from './logic/settings/editorSettings';
import { bootstrapSettingsProjection } from './logic/store/settingsProjection';
import {
  NotificationToast,
  ParityToastSurface,
  ToastProvider,
} from './ui/primitives/Toast';
import NotificationBanner from './ui/primitives/Banner';
import LiveRegion from './ui/primitives/LiveRegion';
import AppShell from './ui/widgets/AppShell';
import AboutDialog from './ui/widgets/AboutDialog';
import AppearanceControls from './ui/widgets/AppearanceControls';
import ShellMenuRow from './ui/widgets/ShellMenuRow';
import {
  ApplicationMenuRequestContext,
  type ApplicationMenuTarget,
} from './ui/widgets/applicationMenuRequest';
import type { SettingsMenuProps } from './ui/widgets/SettingsMenu';
import { EditorSessionProvider } from './ui/widgets/editorSession';
import StartupFailure from './ui/widgets/StartupFailure';
import ShortcutsDialog from './ui/widgets/ShortcutsDialog';
import NormalizationPrompt from './ui/widgets/NormalizationPrompt';
import ExternalChangePrompt, {
  type ExternalChangeDecision,
} from './ui/widgets/ExternalChangePrompt';
import ClosePrompt from './ui/widgets/ClosePrompt';
import { ModalStateProvider } from './ui/widgets/modalState';
import ModalShell from './ui/primitives/ModalShell';

let activeRetry: Promise<AppModelBootstrapResult> | undefined;

/**
 * Actions whose invoker already reported its own failure.
 *
 * `onSave`/`onSaveAs` return the `WriteResult`, so a refused write matched both
 * the write path's reporter and the menu's `onActionResult` arm and was reported
 * twice. Before T117 both reports rendered the same generic copy, so the only
 * symptom was a `×2` on a single failure — indistinguishable from the contract's
 * dedup count, which means a failure that genuinely repeated. It became visible
 * when the second, intent-less report started erasing the Retry control the
 * first had earned, because `refreshDuplicate` copies the incoming remediation
 * wholesale.
 *
 * The dispatcher cannot infer this: it is a pure function with no store access
 * and no knowledge of which invoker reports. Naming the ids here keeps that
 * knowledge where the two reporters actually meet.
 */
const selfReportingActionIds: ReadonlySet<string> = new Set([
  'save',
  'save-as',
]);

function safeFilename(
  document: DocumentMetadata | undefined,
  targetPath?: string,
): string {
  const source =
    targetPath ?? document?.displayName ?? document?.path ?? document?.title;
  if (source === undefined || source.length === 0) {
    return 'Untitled.md';
  }
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

function startAppModelBootstrap(
  isRetry: boolean,
): Promise<AppModelBootstrapResult> {
  if (isRetry && activeRetry !== undefined) {
    return activeRetry;
  }
  const attempt = import('./logic/adapter')
    .then(
      async ({
        applicationAdapter,
        appModelAdapter,
        settingsAdapter,
        windowAdapter,
      }) => {
        if (isRetry) {
          await applicationAdapter.retryStartup();
        }
        const [result] = await Promise.all([
          bootstrapAppModelProjection(appModelAdapter),
          bootstrapSettingsProjection(settingsAdapter),
        ]);
        if (result.status === 'ready') {
          await windowAdapter.windowReady();
        }
        return result;
      },
    )
    .catch((): AppModelBootstrapResult => ({ status: 'failed' }));
  if (!isRetry) {
    return attempt;
  }
  const retryAttempt = attempt.finally((): void => {
    activeRetry = undefined;
  });
  activeRetry = retryAttempt;
  return retryAttempt;
}

type BootstrapStatus = 'loading' | 'ready' | 'failed';

interface ApplicationMenuState {
  modalOpen: boolean;
  onAbout: () => void;
  onNewDocument: (expectedTabSetRevision: number) => Promise<unknown>;
  onOpenDocument: (expectedTabSetRevision: number) => Promise<unknown>;
  onOpenRecentFile: (
    path: string,
    expectedTabSetRevision: number,
  ) => Promise<unknown>;
  onReopenLastFile: (expectedTabSetRevision: number) => Promise<unknown>;
  onSave: () => Promise<unknown>;
  onSaveAs: () => Promise<unknown>;
  onCloseDocument: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<unknown>;
  onQuit: () => void;
  documentId?: string;
  sessionDocumentId?: string;
  writable?: boolean;
  onShortcuts: () => void;
  requestedMenu: ApplicationMenuTarget | null;
  onRequestedMenuHandled: () => void;
}

const ApplicationMenuContext = createContext<ApplicationMenuState | null>(null);

const ApplicationShellMenu: React.FC<SettingsMenuProps> = (
  settingsMenuProps,
): React.JSX.Element => {
  const menuState = useContext(ApplicationMenuContext);
  if (menuState === null) {
    throw new Error('ApplicationShellMenu requires ApplicationMenuContext');
  }
  const dispatch = useAppDispatch();
  const activeDocument = useAppSelector((state) =>
    state.documents.activeDocumentId === null
      ? undefined
      : state.documents.byId[state.documents.activeDocumentId],
  );
  const workspaceVisible = useAppSelector(
    (state) => state.ui.layout.sidebarVisible ?? true,
  );
  const tabSetRevision = useAppSelector(
    (state) => state.documents.tabSetRevision,
  );
  const recentFiles = useAppSelector(
    (state) => state.documents.recentFiles ?? [],
  );
  const canReopenLastFile = useAppSelector(
    (state) => state.documents.canReopenLastFile ?? false,
  );
  const editorSettings = useEditorSettings();

  return (
    <ShellMenuRow
      modalOpen={menuState.modalOpen}
      onAbout={menuState.onAbout}
      onNewDocument={(): Promise<unknown> =>
        menuState.onNewDocument(tabSetRevision)
      }
      onOpenDocument={(): Promise<unknown> =>
        menuState.onOpenDocument(tabSetRevision)
      }
      onOpenRecentFile={(path): Promise<unknown> =>
        menuState.onOpenRecentFile(path, tabSetRevision)
      }
      onReopenLastFile={(): Promise<unknown> =>
        menuState.onReopenLastFile(tabSetRevision)
      }
      onSave={menuState.onSave}
      onSaveAs={menuState.onSaveAs}
      /*
       * Bound to the active document here rather than in ShellMenuRow: the
       * close plan needs the tab-set revision, and the menu row sits in the
       * `.application-menu` subtree with no access to the tab state.
       */
      onCloseDocument={
        activeDocument === undefined
          ? undefined
          : (): Promise<unknown> =>
              menuState.onCloseDocument(
                activeDocument.documentId,
                tabSetRevision,
              )
      }
      onQuit={menuState.onQuit}
      /*
       * T109: the File menu's refusals reach a store dispatch here rather than
       * inside the row. A refused command used to report as `mutated` and its
       * classified error was dropped; both surfaces — the click and the
       * accelerator — now route through this one handler, which passes the
       * backend's message through verbatim exactly as the entry paths do.
       */
      /*
       * `reported` guards a double-report T117 exposed. `onSave`/`onSaveAs`
       * return the `WriteResult`, whose `status` is `refused` on a failed write,
       * so the write path reported the failure once with its intent and this arm
       * reported the identical error again without one. `refreshDuplicate`
       * copies the incoming remediation wholesale, so the second report erased
       * the Retry control the first had earned.
       *
       * It was invisible before: both reports produced the same generic copy, so
       * the only symptom was a `×2` on a single failure — which reads like the
       * contract's dedup count working, when that count means a failure that
       * genuinely repeated.
       */
      onActionResult={(result): void => {
        if (
          result.status === 'refused' &&
          !selfReportingActionIds.has(result.actionId)
        ) {
          reportClassifiedError(
            dispatch,
            result.error,
            t('notification.error.io.title'),
          );
        }
      }}
      activeDocument={activeDocument}
      documentId={menuState.documentId}
      sessionDocumentId={menuState.sessionDocumentId}
      writable={menuState.writable}
      recentFiles={recentFiles}
      canReopenLastFile={canReopenLastFile}
      onShortcuts={menuState.onShortcuts}
      requestedMenu={menuState.requestedMenu}
      onRequestedMenuHandled={menuState.onRequestedMenuHandled}
      settingsMenuProps={{
        ...settingsMenuProps,
        editorSettings: editorSettings.settings,
        onEditorSettingsChange: (patch): void => {
          void editorSettings.update(patch).catch((): void => undefined);
        },
        fileSettings: editorSettings.fileSettings,
        onFileSettingsChange: (patch): void => {
          void editorSettings.updateFile(patch).catch((): void => undefined);
        },
      }}
      /*
       * The View menu is always offered. With no document open its arrangement
       * rows are drawn unavailable — the values behind them come from the
       * active document — while the rows backed by editor settings, layout
       * state and the window adapter keep working. Removing the whole menu
       * left the user with nothing to read and no way to see what View even
       * contains.
       */
      viewMenuProps={{
        documentOpen: activeDocument !== undefined,
        arrangement: (activeDocument?.view.arrangement ??
          'split') as ViewArrangement,
        editorVisible: activeDocument?.view.editorVisible ?? true,
        lineNumbers: editorSettings.settings.lineNumbers,
        previewVisible: activeDocument?.view.previewVisible ?? true,
        onArrangementChange: (arrangement): void => {
          void dispatch(setViewArrangement(arrangement));
        },
        onEditorVisibilityChange: (visible): void => {
          void dispatch(setEditorPaneVisible(visible));
        },
        onFullscreen: (): void => {
          void import('./logic/adapter').then(({ windowAdapter }) => {
            void windowAdapter.toggleFullscreen();
          });
        },
        onLineNumbersChange: (enabled): void => {
          void editorSettings.update({ lineNumbers: enabled });
        },
        onPreviewVisibilityChange: (visible): void => {
          void dispatch(setPreviewPaneVisible(visible));
        },
        onWordWrapChange: (enabled): void => {
          void editorSettings.update({ wordWrap: enabled });
        },
        wordWrap: editorSettings.settings.wordWrap,
        workspaceVisible,
        /*
         * The backend owns workspace visibility, so this issues the
         * command and waits for the acknowledged projection rather than
         * writing the projection itself. What it must not do is discard
         * the rejection: a refused command would otherwise leave the
         * control inert with nothing reported anywhere, which is
         * indistinguishable from a dead button.
         */
        onWorkspaceVisibilityChange: (visible): void => {
          void dispatch(setWorkspaceVisible(visible))
            .unwrap()
            .catch((error: unknown): void => {
              dispatch(notifyError(parseError(error)));
            });
        },
      }}
    />
  );
};

const AppContents: React.FC = (): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.notifications.items);
  const parityToasts =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search)
      .get('parity-case')
      ?.includes(':toasts:') === true;
  const parityQuitPrompt =
    typeof window !== 'undefined' &&
    /:quit-prompt:|:quit-discard-newer:/u.test(
      new URLSearchParams(window.location.search).get('parity-case') ?? '',
    );
  const banners = useAppSelector((state) => state.notifications.banners);
  const activeDocument = useAppSelector((state) =>
    state.documents.activeDocumentId === null
      ? undefined
      : state.documents.byId[state.documents.activeDocumentId],
  );
  const [activeBuffer, setActiveBuffer] = useState<ActiveBuffer | null>(null);
  const [remediationAnnouncement, setRemediationAnnouncement] = useState('');
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>('loading');
  const [isRetrying, setIsRetrying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [requestedApplicationMenu, setRequestedApplicationMenu] =
    useState<ApplicationMenuTarget | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [normalization, setNormalization] = useState<{
    documentId: string;
    filename: string;
    kind: 'save' | 'save-as';
    contentRevision: number;
    decisionToken: string;
    proposedEnding: 'lf' | 'crlf';
  } | null>(null);
  const [externalConflict, setExternalConflict] = useState<{
    documentId: string;
    filename: string;
    kind: 'save' | 'save-as';
    preview: ConflictPreview;
  } | null>(null);
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
  const [version, setVersion] = useState('');
  const bootstrapGeneration = useRef(0);
  const nativeClosePendingRef = useRef(false);
  const recoveryQuitConfirmedRef = useRef(false);
  const recoveryQuitCancelRef = useRef<HTMLButtonElement | null>(null);
  const activeDocumentId = activeBuffer?.documentId;
  const flushActiveDocument = useCallback(async (): Promise<void> => {
    if (activeDocumentId === undefined) return;
    await appModelAdapter.flushActiveSession?.(activeDocumentId);
  }, [activeDocumentId]);
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
  const reportEntryError = useCallback(
    (error: ClassifiedError | undefined): void => {
      reportClassifiedError(dispatch, error, t('notification.error.io.title'));
    },
    [dispatch],
  );
  const onNewDocument = useCallback(
    async (expectedTabSetRevision: number): Promise<unknown> => {
      await flushActiveDocument();
      const result = await appModelAdapter.newDocument?.(
        expectedTabSetRevision,
      );
      if (result?.data !== undefined) {
        setActiveBuffer(result.data);
      }
      reportEntryError(result?.error);
      return result;
    },
    [flushActiveDocument, reportEntryError],
  );
  const onOpenDocument = useCallback(
    async (expectedTabSetRevision: number): Promise<unknown> => {
      await flushActiveDocument();
      const result = await appModelAdapter.openDocument?.(
        expectedTabSetRevision,
      );
      if (result?.activeBuffer !== undefined) {
        setActiveBuffer(result.activeBuffer);
      }
      reportEntryError(result?.error);
      return result;
    },
    [flushActiveDocument, reportEntryError],
  );
  const onOpenRecentFile = useCallback(
    async (path: string, expectedTabSetRevision: number): Promise<unknown> => {
      await flushActiveDocument();
      const result = await appModelAdapter.openRecentFile?.(
        path,
        expectedTabSetRevision,
      );
      if (result?.activeBuffer !== undefined) {
        setActiveBuffer(result.activeBuffer);
      }
      reportEntryError(result?.error);
      return result;
    },
    [flushActiveDocument, reportEntryError],
  );
  const onReopenLastFile = useCallback(
    async (expectedTabSetRevision: number): Promise<unknown> => {
      await flushActiveDocument();
      const result = await appModelAdapter.reopenLastFile?.(
        expectedTabSetRevision,
      );
      if (result?.activeBuffer !== undefined) {
        setActiveBuffer(result.activeBuffer);
      }
      reportEntryError(result?.error);
      return result;
    },
    [flushActiveDocument, reportEntryError],
  );
  const onActivateDocument = useCallback(
    async (
      documentId: string,
      expectedTabSetRevision: number,
    ): Promise<DocumentTransitionResult> => {
      const currentDocumentId = activeBuffer?.documentId;
      if (currentDocumentId !== undefined && currentDocumentId !== documentId) {
        await appModelAdapter.flushActiveSession?.(currentDocumentId);
      }
      const result = await appModelAdapter.activateDocument?.(
        documentId,
        expectedTabSetRevision,
      );
      if (result === undefined) return {};
      if (result.data !== undefined) setActiveBuffer(result.data);
      return result;
    },
    [activeBuffer?.documentId],
  );
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
          remediation: '',
          documentId,
          dedupKey: `write:${documentId}`,
        },
        t('notification.error.io.title'),
        { intent },
      );
    },
    [dispatch],
  );
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
  const reportClosePlanError = useCallback(
    (error: ClassifiedError | undefined): void => {
      reportClassifiedError(dispatch, error, t('notification.error.io.title'));
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
    nativeClosePendingRef.current = false;
    setNativeClosePending(false);
    try {
      await nativeLifecycleAdapter.cancelQuit();
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
        setActiveBuffer(result.activeBuffer);
      } else if (
        result.activeDocumentId === undefined ||
        result.activeDocumentId === ''
      ) {
        setActiveBuffer(null);
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
          await nativeLifecycleAdapter.authorizeQuit();
          nativeClosePendingRef.current = false;
          setNativeClosePending(false);
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
  const onNativeCloseRequested = useCallback(async (): Promise<void> => {
    if (nativeClosePendingRef.current) return;
    nativeClosePendingRef.current = true;
    recoveryQuitConfirmedRef.current = false;
    setNativeClosePending(true);
    if (recoverySurface !== null) {
      setRecoveryQuitConfirmOpen(true);
      return;
    }
    await prepareNativeClosePlan();
  }, [prepareNativeClosePlan, recoverySurface]);
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
          setActiveBuffer(result.activeBuffer);
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
          if (recovered.activeBuffer !== null) {
            setActiveBuffer(recovered.activeBuffer);
          }
        }
        const safeName = safeFilename(
          activeDocument,
          result.data.targetPath ?? filename,
        );
        dispatch(
          notifyToast({
            code: 'save-success',
            message: t('save.success.message', {
              encoding: t(
                `status.encoding.${activeDocument?.encoding ?? 'utf-8'}`,
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
    [activeDocument, dispatch, reportWriteError],
  );
  const beginWrite = useCallback(
    async (kind: 'save' | 'save-as'): Promise<WriteResult | undefined> => {
      const documentId = activeDocument?.documentId ?? activeBuffer?.documentId;
      if (documentId === undefined) return undefined;
      if (
        activeDocument?.status === 'read-only' ||
        // Go emits `large-read-only`/`unsafe-read-only`, never the bare
        // `read-only` this used to compare against, so the clause never fired.
        // Harmless — `status` already collapses every one of them
        // (`save_status.go:28-31`) — but it read as a capability check that
        // was not one. Mirrors Go's own predicate now.
        (activeDocument?.capability !== undefined &&
          activeDocument.capability !== 'writable') ||
        activeDocument?.detached === true
      ) {
        reportWriteError(
          {
            category: 'permission-denied',
            message: t('save.readOnly'),
            remediation: '',
            // Without a subject the title falls back to the generic "File
            // operation failed" once the message stops being overwritten.
            safeSubject: safeFilename(activeDocument),
            documentId,
            dedupKey: `read-only:${documentId}`,
          },
          documentId,
        );
        return undefined;
      }
      await appModelAdapter.flushActiveSession?.(documentId);
      const state = await appModelAdapter.getState();
      if (state.activeBuffer?.documentId !== documentId) {
        reportWriteError(
          {
            category: 'conflict',
            // Was a bare English literal. It was invisible while
            // `localizedErrorCopy` overwrote it; now that the message survives,
            // an untranslated string would reach the user (FR-FT-047).
            message: t('save.activeDocumentChanged'),
            remediation: 'Retry',
            safeSubject: safeFilename(activeDocument),
            documentId,
            dedupKey: `active-document:${documentId}`,
          },
          documentId,
          kind,
        );
        return undefined;
      }
      const revision =
        state.activeBuffer.documentRevision ??
        activeDocument?.contentRevision ??
        0;
      return finishWrite(
        kind,
        documentId,
        revision,
        '',
        safeFilename(activeDocument),
      );
    },
    [activeBuffer, activeDocument, finishWrite, reportWriteError],
  );
  const onSave = useCallback(() => beginWrite('save'), [beginWrite]);
  const onSaveAs = useCallback(() => beginWrite('save-as'), [beginWrite]);
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
  const onRemediate = useCallback(
    async (
      remediation: NotificationRemediation,
      notificationId: number,
      safeSubject: string,
    ): Promise<void> => {
      switch (remediation.intent) {
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
              { intent: 'copy-path', reveal: true },
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
        case 'save':
        case 'save-as': {
          /*
           * `beginWrite`, not `finishWrite`. `finishWrite` would reuse the exact
           * `contentRevision` and decision token the backend just refused, so it
           * would deterministically refuse again. `beginWrite` re-flushes the
           * session and re-reads the state first, which is what makes a retry
           * after a conflict or a transient IO failure able to succeed at all.
           */
          const result = await beginWrite(remediation.intent);
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
    [announceRemediation, beginWrite, dispatch],
  );
  const onQuit = useCallback((): void => {
    if (parityQuitPrompt) {
      // The browser bridge cannot authorize a native Wails quit request. Keep
      // the parity route on the same close-plan surface that the native event
      // would produce, while leaving ordinary startup on the native path.
      if (activeDocument !== undefined) {
        setClosePlan({
          id: 'parity-quit-prompt',
          kind: 'quit',
          status: 'collecting',
          tabSetRevision: 0,
          targets: [
            {
              documentId: activeDocument.documentId,
              title: activeDocument.title,
              displayName: activeDocument.displayName,
              path: activeDocument.path,
              contentRevision: activeDocument.contentRevision ?? 0,
              dirty: true,
              capability: activeDocument.capability,
              status: activeDocument.status,
            },
          ],
        });
      }
      return;
    }
    nativeLifecycleAdapter.requestQuit();
  }, [activeDocument, parityQuitPrompt]);
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
      switch (decision) {
        case 'reload':
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
        if (refreshedState.activeBuffer?.documentId === current.documentId) {
          setActiveBuffer(refreshedState.activeBuffer);
        } else if (result.activeBuffer !== undefined) {
          setActiveBuffer(result.activeBuffer);
        }
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
    [externalConflict, externalConflictValid, finishWrite, reportWriteError],
  );
  // Keep the existing modal contract explicit for menu and keyboard consumers.
  const modalOpen =
    settingsOpen ||
    aboutOpen ||
    shortcutsOpen ||
    normalization !== null ||
    externalConflict !== null ||
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
          activeDocument.capability === 'writable') &&
        activeDocument.detached !== true,
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

  const runBootstrap = useCallback(
    (isRetry: boolean): void => {
      const generation = bootstrapGeneration.current + 1;
      bootstrapGeneration.current = generation;
      if (isRetry) {
        setIsRetrying(true);
        dispatch(resetNotifications());
      }

      void startAppModelBootstrap(isRetry).then(
        (result: AppModelBootstrapResult): void => {
          if (bootstrapGeneration.current !== generation) {
            return;
          }

          setIsRetrying(false);
          if (result.status === 'ready') {
            setActiveBuffer(result.activeBuffer);
            setVersion(result.applicationVersion);
            setBootstrapStatus('ready');
            return;
          }

          setBootstrapStatus('failed');
        },
      );
    },
    [dispatch],
  );

  useEffect((): (() => void) => {
    let isCurrent = true;
    void Promise.resolve().then((): void => {
      if (isCurrent) {
        runBootstrap(false);
      }
    });

    return (): void => {
      isCurrent = false;
      bootstrapGeneration.current += 1;
    };
  }, [runBootstrap]);

  useEffect((): (() => void) | undefined => {
    if (bootstrapStatus !== 'ready') {
      return undefined;
    }

    let disposed = false;
    const reportNativeGeometry = (): void => {
      void import('./logic/adapter').then(
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

  useEffect((): (() => void) | undefined => {
    if (bootstrapStatus !== 'ready') {
      return undefined;
    }
    return nativeLifecycleAdapter.onCloseRequested((): void => {
      void onNativeCloseRequested();
    });
  }, [bootstrapStatus, onNativeCloseRequested]);

  return (
    <ToastProvider>
      <ModalStateProvider modalOpen={modalOpen}>
        <EditorSessionProvider activeBuffer={activeBuffer}>
          <ApplicationMenuRequestContext.Provider
            value={setRequestedApplicationMenu}
          >
            <div className="application-frame">
              <div className="application-menu">
                <ApplicationMenuContext.Provider value={applicationMenuState}>
                  <AppearanceControls
                    visible={bootstrapStatus === 'ready'}
                    settingsOpen={settingsOpen}
                    onSettingsOpenChange={setSettingsOpen}
                    settingsMenuRenderer={ApplicationShellMenu}
                  />
                </ApplicationMenuContext.Provider>
              </div>
              <div className="application-content">
                {bootstrapStatus === 'failed' ? (
                  <StartupFailure
                    isRetrying={isRetrying}
                    onRetry={(): void => {
                      runBootstrap(true);
                    }}
                  />
                ) : bootstrapStatus === 'ready' ? (
                  <>
                    {banners.map((notification) => (
                      <NotificationBanner
                        key={`${notification.id}:${notification.refreshGeneration}`}
                        notification={notification}
                      />
                    ))}
                    {recoverySurface !== null ? (
                      <section aria-label={t('recovery.title')} role="alert">
                        <p>{recoverySurface.message}</p>
                        <button type="button" onClick={requestRecoveryQuit}>
                          {t('recovery.quit.action')}
                        </button>
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
                onCancel={(): void => setNormalization(null)}
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
                onDecision={onCloseConflictDecision}
                open={bootstrapStatus === 'ready' && closeConflict !== null}
                preview={closeConflict?.preview}
                valid={closeConflictValid}
              />
              <ModalShell
                initialFocusRef={recoveryQuitCancelRef}
                labelledBy="recovery-quit-title"
                onBackdrop={onRecoveryQuitCancel}
                onEscape={onRecoveryQuitCancel}
                open={bootstrapStatus === 'ready' && recoveryQuitConfirmOpen}
                title={t('recovery.quit.title')}
              >
                <p>{t('recovery.quit.message')}</p>
                {recoverySurface?.message !== undefined ? (
                  <p>{recoverySurface.message}</p>
                ) : null}
                <div>
                  <button
                    ref={recoveryQuitCancelRef}
                    type="button"
                    onClick={onRecoveryQuitCancel}
                  >
                    {t('recovery.quit.cancel')}
                  </button>
                  <button type="button" onClick={onRecoveryQuitConfirm}>
                    {t('recovery.quit.confirm')}
                  </button>
                </div>
              </ModalShell>
              {bootstrapStatus === 'ready' && parityToasts ? (
                <ParityToastSurface />
              ) : bootstrapStatus === 'ready' ? (
                notifications.map((notification) => (
                  <NotificationToast
                    key={`${notification.id}:${notification.refreshGeneration}`}
                    notification={notification}
                    onDismiss={(id: number): void => {
                      dispatch(dismissNotification(id));
                    }}
                    onRemediate={(
                      remediation: NotificationRemediation,
                    ): void => {
                      void onRemediate(
                        remediation,
                        notification.id,
                        notification.title,
                      );
                    }}
                  />
                ))
              ) : null}
              <LiveRegion message={remediationAnnouncement} />
            </div>
          </ApplicationMenuRequestContext.Provider>
        </EditorSessionProvider>
      </ModalStateProvider>
    </ToastProvider>
  );
};

const App: React.FC = (): React.JSX.Element => (
  <Provider store={store}>
    <AppContents />
  </Provider>
);

export default App;
