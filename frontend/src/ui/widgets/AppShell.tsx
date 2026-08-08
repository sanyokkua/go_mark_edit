import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { t } from '../../i18n';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import { setWorkspaceWidth } from '../../logic/store/uiLayoutCommands';
import styles from './AppShell.module.css';

import EditorView from './EditorView';

const AppShell: React.FC = (): React.JSX.Element => {
  const dispatch = useAppDispatch();
  const workspaceVisible = useAppSelector(
    (state) => state.ui.layout.sidebarVisible ?? true,
  );
  const hasActiveDocument = useAppSelector(
    (state) =>
      state.documents.activeDocumentId !== null &&
      state.documents.activeDocumentId !== '',
  );
  const acknowledgedWorkspaceWidth = useAppSelector(
    (state) => state.ui.layout.sidebarWidth ?? 256,
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
      data-workspace-visible={String(workspaceVisible)}
      style={shellStyle}
    >
      <aside
        aria-label={t('shell.workspace')}
        className={styles.workspace}
        hidden={!workspaceVisible}
      />
      {workspaceVisible ? (
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
        <EditorView />
      </main>
    </div>
  );
};

export default AppShell;
