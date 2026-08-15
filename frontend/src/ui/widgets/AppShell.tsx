import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { t } from '../../i18n';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import {
  WORKSPACE_BINDING_WIDTH,
  setWorkspaceWidth,
} from '../../logic/store/uiLayoutCommands';
import { useEditorSettings } from '../../logic/settings/editorSettings';
import type {
  ClosePlanKind,
  DocumentTransitionResult,
  TabTransitionResult,
} from '../../logic/store/appModelTypes';
import styles from './AppShell.module.css';

import EditorView from './EditorView';
import { useMinimumWindow } from './minimumWindow';
import StatusBar from '../components/StatusBar';
import DocumentTabs from './DocumentTabs';
import Launcher from './Launcher';

export interface AppShellProps {
  onNewDocument?: (expectedTabSetRevision: number) => Promise<unknown>;
  onOpenDocument?: (expectedTabSetRevision: number) => Promise<unknown>;
  onActivateDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
  ) => Promise<DocumentTransitionResult>;
  onCloseDocument?: (
    documentId: string,
    expectedTabSetRevision: number,
    kind?: ClosePlanKind,
    targetDocumentIds?: string[],
  ) => Promise<TabTransitionResult>;
  onOpenRecentFile?: (
    path: string,
    expectedTabSetRevision: number,
  ) => Promise<unknown>;
}

const AppShell: React.FC<AppShellProps> = ({
  onNewDocument,
  onOpenDocument,
  onActivateDocument,
  onCloseDocument,
  onOpenRecentFile,
}: AppShellProps): React.JSX.Element => {
  const parityRoute =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case');
  const parityCase =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('parity-case')
      : null;
  const parityFamily = parityCase?.startsWith('primary:toolbar-overflow:')
    ? 'toolbar-overflow'
    : undefined;
  const dispatch = useAppDispatch();
  const { fileSettings, markdownSettings } = useEditorSettings();
  const workspaceVisible = useAppSelector(
    (state) => state.ui.layout.sidebarVisible ?? true,
  );
  /*
   * At the native minimum window there is no room for a workspace column, so
   * the panel and its divider are not rendered at all. Two other shapes were
   * tried and reverted: overriding `workspaceVisible` here splits the source of
   * truth, because App.tsx hands the raw preference to the View menu's toggle
   * and the two then disagree; dispatching a hide on mount writes a persisted
   * preference, so one narrow launch would hide the workspace on every later
   * wide one. Not rendering owns no second "is it open" state and writes
   * nothing — `data-workspace-visible` below still reports the stored
   * preference, which keeps governing the wide layout untouched.
   */
  const minimumWindow = useMinimumWindow();
  const hasActiveDocument = useAppSelector(
    (state) =>
      state.documents.activeDocumentId !== null &&
      state.documents.activeDocumentId !== '',
  );
  const activeDocument = useAppSelector((state) =>
    hasActiveDocument && state.documents.activeDocumentId !== null
      ? state.documents.byId[state.documents.activeDocumentId]
      : undefined,
  );
  const [liveCursor, setLiveCursor] = useState({
    lineNumber: activeDocument?.view.cursor.line ?? 1,
    column: activeDocument?.view.cursor.column ?? 1,
  });
  const recentFiles = useAppSelector(
    (state) => state.documents.recentFiles ?? [],
  );
  const showLauncher =
    onNewDocument !== undefined ||
    onOpenDocument !== undefined ||
    recentFiles.length > 0;
  const showParityEmptyChrome = parityRoute && !hasActiveDocument;

  useLayoutEffect((): (() => void) | undefined => {
    if (!showParityEmptyChrome || window.innerWidth > 376) return undefined;
    const keepParityEmptyRouteAtTop = (): void => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    keepParityEmptyRouteAtTop();
    window.addEventListener('scroll', keepParityEmptyRouteAtTop, {
      passive: true,
    });
    return (): void => {
      window.removeEventListener('scroll', keepParityEmptyRouteAtTop);
    };
  }, [showParityEmptyChrome]);

  const tabSetRevision = useAppSelector(
    (state) => state.documents.tabSetRevision,
  );
  const acknowledgedWorkspaceWidth = useAppSelector(
    (state) => state.ui.layout.sidebarWidth ?? WORKSPACE_BINDING_WIDTH,
  );
  const latestLayoutFailure = useAppSelector((state) => {
    const layoutFailures = [
      ...state.notifications.items,
      ...state.notifications.queuedErrors,
    ].filter(
      (notification) =>
        notification.error?.details?.operation === 'update layout',
    );
    const latest = layoutFailures.at(-1);
    return latest === undefined
      ? undefined
      : `${latest.id}:${latest.refreshGeneration}`;
  });
  const [pendingWorkspaceWidth, setPendingWorkspaceWidth] = useState<
    number | undefined
  >(undefined);
  const pendingWorkspaceWidthRef = useRef<number | undefined>(undefined);
  const handledLayoutFailureRef = useRef<string | undefined>(undefined);
  const workspaceWidth =
    pendingWorkspaceWidth === acknowledgedWorkspaceWidth
      ? acknowledgedWorkspaceWidth
      : (pendingWorkspaceWidth ?? acknowledgedWorkspaceWidth);
  const drag = useRef<{
    pointerId: number;
    startWidth: number;
    startX: number;
  } | null>(null);

  const requestWorkspaceWidth = useCallback(
    (width: number): void => {
      const nextWidth = Math.max(0, Math.round(width));
      pendingWorkspaceWidthRef.current = nextWidth;
      setPendingWorkspaceWidth(nextWidth);
      void dispatch(setWorkspaceWidth(nextWidth))
        .unwrap()
        .catch((): void => {
          setPendingWorkspaceWidth((pending) =>
            pending === nextWidth ? undefined : pending,
          );
          if (pendingWorkspaceWidthRef.current === nextWidth) {
            pendingWorkspaceWidthRef.current = undefined;
          }
        });
    },
    [dispatch],
  );

  /*
   * A hidden workspace has no in-flight width intent. Without this, the last
   * optimistic value from the drag that collapsed it — 0, or whatever the
   * pointer passed through on the way — outranks the acknowledged width when it
   * is shown again, and the restored binding width would never render.
   */
  useEffect((): void => {
    if (workspaceVisible) {
      return;
    }
    /*
     * The divider unmounts with the workspace, but the drag listens on the
     * window: without releasing it here a pointer still held down after
     * collapsing to zero keeps issuing the same hide command on every move.
     */
    drag.current = null;
    if (pendingWorkspaceWidthRef.current === undefined) {
      return;
    }
    pendingWorkspaceWidthRef.current = undefined;
    setPendingWorkspaceWidth(undefined);
  }, [workspaceVisible]);

  useEffect((): void => {
    if (
      latestLayoutFailure === undefined ||
      latestLayoutFailure === handledLayoutFailureRef.current
    ) {
      return;
    }
    handledLayoutFailureRef.current = latestLayoutFailure;
    if (pendingWorkspaceWidthRef.current !== undefined) {
      pendingWorkspaceWidthRef.current = undefined;
      setPendingWorkspaceWidth(undefined);
    }
  }, [latestLayoutFailure]);

  useEffect((): (() => void) => {
    const onPointerMove = (event: PointerEvent): void => {
      const activeDrag = drag.current;
      if (
        activeDrag === null ||
        (event.pointerId !== 0 && event.pointerId !== activeDrag.pointerId)
      ) {
        return;
      }
      requestWorkspaceWidth(
        activeDrag.startWidth + event.clientX - activeDrag.startX,
      );
    };
    const onPointerUp = (event: PointerEvent): void => {
      if (
        drag.current !== null &&
        (event.pointerId === 0 || event.pointerId === drag.current.pointerId)
      ) {
        drag.current = null;
      }
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return (): void => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [requestWorkspaceWidth]);

  const shellStyle = {
    '--shell-left-width': `${workspaceWidth}px`,
  } as CSSProperties;

  return (
    <div
      className={styles.shell}
      data-testid="application-shell"
      data-document-state={hasActiveDocument ? 'active' : 'empty'}
      data-parity-family={parityFamily}
      data-parity-shell={parityRoute ? 'true' : undefined}
      data-workspace-visible={String(workspaceVisible)}
      style={shellStyle}
    >
      {minimumWindow ? null : (
        <aside
          aria-label={t('shell.workspace')}
          className={styles.workspace}
          hidden={!workspaceVisible}
        />
      )}
      {workspaceVisible && !minimumWindow ? (
        <div
          aria-label={t('shell.workspace.resize')}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuenow={workspaceWidth}
          className={styles.divider}
          role="separator"
          tabIndex={0}
          onKeyDown={(event): void => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              requestWorkspaceWidth(
                (pendingWorkspaceWidthRef.current ?? workspaceWidth) - 16,
              );
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              requestWorkspaceWidth(
                (pendingWorkspaceWidthRef.current ?? workspaceWidth) + 16,
              );
            }
          }}
          onPointerDown={(event): void => {
            drag.current = {
              pointerId: event.pointerId,
              startWidth: workspaceWidth,
              startX: event.clientX,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
        />
      ) : null}
      <main aria-label={t('shell.document')} className={styles.document}>
        {showParityEmptyChrome ? (
          <DocumentTabs onNewDocument={onNewDocument} />
        ) : null}
        {!hasActiveDocument && showLauncher ? (
          <Launcher
            recentFiles={recentFiles}
            onNewDocument={
              onNewDocument === undefined
                ? undefined
                : (): Promise<unknown> => onNewDocument(tabSetRevision)
            }
            onOpenDocument={
              onOpenDocument === undefined
                ? undefined
                : (): Promise<unknown> => onOpenDocument(tabSetRevision)
            }
            onOpenRecentFile={
              onOpenRecentFile === undefined
                ? undefined
                : (path): Promise<unknown> =>
                    onOpenRecentFile(path, tabSetRevision)
            }
          />
        ) : null}
        <EditorView
          onNewDocument={onNewDocument}
          onActivateDocument={onActivateDocument}
          onCloseDocument={onCloseDocument}
          onLiveCursorChange={setLiveCursor}
        />
        {hasActiveDocument && activeDocument !== undefined ? (
          <StatusBar
            cursor={liveCursor}
            encoding={activeDocument.encoding}
            lineEnding={activeDocument.lineEnding}
            status={activeDocument.status}
            capability={activeDocument.capability}
            writeInFlight={activeDocument.writeInFlight}
            wordCount={activeDocument.wordCount}
            autosave={fileSettings.autosave}
            markdownStandard={markdownSettings.standard}
          />
        ) : showParityEmptyChrome ? (
          <StatusBar
            cursor={{ lineNumber: 1, column: 1 }}
            encoding="utf-8"
            lineEnding="lf"
            status="not-saved"
            wordCount={0}
            autosave={fileSettings.autosave}
            markdownStandard={markdownSettings.standard}
          />
        ) : null}
      </main>
    </div>
  );
};

export default AppShell;
