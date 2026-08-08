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
} from './logic/store/notificationsSlice';
import { store, useAppDispatch, useAppSelector } from './logic/store';
import {
  setEditorPaneVisible,
  setPreviewPaneVisible,
  setViewArrangement,
} from './logic/store/docViewCommands';
import {
  bootstrapAppModelProjection,
  type AppModelBootstrapResult,
} from './logic/store/appModelProjection';
import type {
  ActiveBuffer,
  ClassifiedError,
  ConflictPreview,
  DocumentMetadata,
  DocumentTransitionResult,
  TabTransitionResult,
  WriteResult,
  ViewArrangement,
} from './logic/store/appModelTypes';
import { setWorkspaceVisible } from './logic/store/uiLayoutCommands';
import {
  appModelAdapter,
  documentConflictAdapter,
  documentWriteAdapter,
} from './logic/adapter';
import { useEditorSettings } from './logic/settings/editorSettings';
import { bootstrapSettingsProjection } from './logic/store/settingsProjection';
import { NotificationToast, ToastProvider } from './ui/primitives/Toast';
import NotificationBanner from './ui/primitives/Banner';
import AppShell from './ui/widgets/AppShell';
import AboutDialog from './ui/widgets/AboutDialog';
import AppearanceControls from './ui/widgets/AppearanceControls';
import ShellMenuRow from './ui/widgets/ShellMenuRow';
import type { SettingsMenuProps } from './ui/widgets/SettingsMenu';
import { EditorSessionProvider } from './ui/widgets/editorSession';
import StartupFailure from './ui/widgets/StartupFailure';
import ShortcutsDialog from './ui/widgets/ShortcutsDialog';
import NormalizationPrompt from './ui/widgets/NormalizationPrompt';
import ExternalChangePrompt, {
  type ExternalChangeDecision,
} from './ui/widgets/ExternalChangePrompt';
import { ModalStateProvider } from './ui/widgets/modalState';

let activeRetry: Promise<AppModelBootstrapResult> | undefined;

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
  onSave: () => Promise<unknown>;
  onSaveAs: () => Promise<unknown>;
  documentId?: string;
  sessionDocumentId?: string;
  writable?: boolean;
  onShortcuts: () => void;
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
      onSave={menuState.onSave}
      onSaveAs={menuState.onSaveAs}
      documentId={menuState.documentId}
      sessionDocumentId={menuState.sessionDocumentId}
      writable={menuState.writable}
      onShortcuts={menuState.onShortcuts}
      settingsMenuProps={{
        ...settingsMenuProps,
        editorSettings: editorSettings.settings,
        onEditorSettingsChange: (patch): void => {
          void editorSettings.update(patch).catch((): void => undefined);
        },
      }}
      viewMenuProps={
        activeDocument === undefined
          ? undefined
          : {
              arrangement: activeDocument.view.arrangement as ViewArrangement,
              editorVisible: activeDocument.view.editorVisible,
              lineNumbers: editorSettings.settings.lineNumbers,
              previewVisible: activeDocument.view.previewVisible,
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
              onWorkspaceVisibilityChange: (visible): void => {
                void dispatch(setWorkspaceVisible(visible));
              },
            }
      }
    />
  );
};

const AppContents: React.FC = (): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.notifications.items);
  const banners = useAppSelector((state) => state.notifications.banners);
  const activeDocument = useAppSelector((state) =>
    state.documents.activeDocumentId === null
      ? undefined
      : state.documents.byId[state.documents.activeDocumentId],
  );
  const [activeBuffer, setActiveBuffer] = useState<ActiveBuffer | null>(null);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>('loading');
  const [isRetrying, setIsRetrying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [version, setVersion] = useState('');
  const bootstrapGeneration = useRef(0);
  const onNewDocument = useCallback(
    async (expectedTabSetRevision: number): Promise<unknown> => {
      const result = await appModelAdapter.newDocument?.(
        expectedTabSetRevision,
      );
      if (result?.data !== undefined) {
        setActiveBuffer(result.data);
      }
      return result;
    },
    [],
  );
  const onOpenDocument = useCallback(
    async (expectedTabSetRevision: number): Promise<unknown> => {
      const result = await appModelAdapter.openDocument?.(
        expectedTabSetRevision,
      );
      if (result?.activeBuffer !== undefined) {
        setActiveBuffer(result.activeBuffer);
      }
      return result;
    },
    [],
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
  const onCloseDocument = useCallback(
    async (
      documentId: string,
      expectedTabSetRevision: number,
    ): Promise<TabTransitionResult> => {
      if (activeBuffer?.documentId === documentId) {
        await appModelAdapter.flushActiveSession?.(documentId);
      }
      const result = await appModelAdapter.closeDocument?.(
        documentId,
        expectedTabSetRevision,
      );
      if (result === undefined) {
        return {
          status: 'refused',
          orderedDocumentIds: [],
        };
      }
      if (result.activeBuffer !== undefined)
        setActiveBuffer(result.activeBuffer);
      else if (
        result.activeDocumentId === undefined ||
        result.activeDocumentId === ''
      ) {
        setActiveBuffer(null);
      }
      return result;
    },
    [activeBuffer?.documentId],
  );
  const reportWriteError = useCallback(
    (error: ClassifiedError | undefined, documentId: string): void => {
      const category = error?.category ?? 'io-failure';
      const code =
        category === 'not-found'
          ? 'not_found'
          : category === 'permission-denied'
            ? 'permission'
            : category === 'unsupported-input'
              ? 'unsupported'
              : category === 'conflict'
                ? 'io'
                : 'io';
      const subject = error?.dedupKey ?? documentId;
      dispatch(
        notifyError(
          {
            code,
            title: error?.safeSubject ?? 'File operation failed',
            message:
              error?.message ?? 'The file operation could not be completed.',
            retryable: error?.remediation === 'Retry',
            details: { subject },
          },
          subject,
        ),
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
          dispatch(
            notifyCondition({
              code: 'recovery',
              message: recovered.message,
              severity: 'warning',
              subject: documentId,
              title: t('recovery.title'),
            }),
          );
        } else if (recovered.activeBuffer !== null) {
          setActiveBuffer(recovered.activeBuffer);
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
        reportWriteError(result.error, documentId);
      }
      return result;
    },
    [activeDocument, dispatch, reportWriteError],
  );
  const beginWrite = useCallback(
    async (kind: 'save' | 'save-as'): Promise<unknown> => {
      const documentId = activeDocument?.documentId ?? activeBuffer?.documentId;
      if (documentId === undefined) return undefined;
      if (
        activeDocument?.status === 'read-only' ||
        activeDocument?.capability === 'read-only' ||
        activeDocument?.detached === true
      ) {
        reportWriteError(
          {
            category: 'permission-denied',
            message: t('save.readOnly'),
            remediation: '',
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
            message: 'The active document changed before Save could start.',
            remediation: 'Retry',
            documentId,
            dedupKey: `active-document:${documentId}`,
          },
          documentId,
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
  // prettier-ignore
  const modalOpen = settingsOpen || aboutOpen || shortcutsOpen || normalization !== null || externalConflict !== null;
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
      onSave,
      onSaveAs,
      documentId: activeDocument?.documentId,
      sessionDocumentId: activeBuffer?.documentId,
      writable:
        activeDocument !== undefined &&
        activeDocument.status !== 'read-only' &&
        activeDocument.capability !== 'read-only' &&
        activeDocument.detached !== true,
      onShortcuts: (): void => setShortcutsOpen(true),
    }),
    [
      activeBuffer?.documentId,
      activeDocument,
      onNewDocument,
      onOpenDocument,
      onSave,
      onSaveAs,
      modalOpen,
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

  return (
    <ToastProvider>
      <ModalStateProvider modalOpen={modalOpen}>
        <EditorSessionProvider activeBuffer={activeBuffer}>
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
                  <AppShell
                    onNewDocument={onNewDocument}
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
            <ExternalChangePrompt
              onDecision={onExternalConflictDecision}
              open={bootstrapStatus === 'ready' && externalConflict !== null}
              preview={externalConflict?.preview}
              valid={externalConflictValid}
            />
            {bootstrapStatus === 'ready'
              ? notifications.map((notification) => (
                  <NotificationToast
                    key={`${notification.id}:${notification.refreshGeneration}`}
                    notification={notification}
                    onDismiss={(id: number): void => {
                      dispatch(dismissNotification(id));
                    }}
                  />
                ))
              : null}
          </div>
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
