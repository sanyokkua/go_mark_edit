import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../i18n';
import {
  actionsForSurface,
  getAction,
  type ActionId,
  type ActionEntry,
} from '../../logic/actions/actionRegistry';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import type { ActionResult } from '../../logic/actions/actionDispatcher';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import {
  applyFormatEdit,
  formatActionIds,
} from '../../logic/format/formatting';
import type { EditorSelection } from '../components/CodeEditor';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';
import { useEditorSettings } from '../../logic/settings/editorSettings';
import styles from './EditorContextMenu.module.css';

export interface EditorContextMenuProps extends PropsWithChildren {
  onAction?: (actionId: ActionId) => void;
  onActionResult?: (result: ActionResult) => void;
}

const contextActions = actionsForSurface('context');

const EditorContextMenu: React.FC<EditorContextMenuProps> = ({
  children,
  onAction,
  onActionResult,
}: EditorContextMenuProps): React.JSX.Element => {
  const commands = useContext(DocumentCommandContext);
  const activeBuffer = useContext(EditorSessionContext);
  const { markdownSettings } = useEditorSettings();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const selectionSnapshotRef = useRef<EditorSelection | null>(null);
  const pointerRef = useRef<{ left: number; top: number } | null>(null);
  const [point, setPoint] = useState<{ left: number; top: number } | null>(
    null,
  );

  const positionMenu = useCallback((): void => {
    const pointer = pointerRef.current;
    if (pointer === null || menuRef.current === null) return;

    const margin = 8;
    const bounds = menuRef.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(margin, pointer.left),
      Math.max(margin, window.innerWidth - bounds.width - margin),
    );
    const below = pointer.top;
    const above = pointer.top - bounds.height - margin;
    const top =
      below + bounds.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, above);
    setPoint((current): { left: number; top: number } | null =>
      current?.left === left && current.top === top ? current : { left, top },
    );
  }, []);

  useLayoutEffect((): (() => void) | undefined => {
    if (point === null) return undefined;
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return (): void => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [point, positionMenu]);

  useEffect((): (() => void) => {
    const dismiss = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setPoint(null);
      openerRef.current?.focus();
    };
    document.addEventListener('pointerdown', dismiss);
    return (): void => document.removeEventListener('pointerdown', dismiss);
  }, []);

  useEffect((): void => {
    if (point !== null) menuRef.current?.focus();
  }, [point]);

  useEffect((): (() => void) => {
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || point === null) return;
      event.preventDefault();
      setPoint(null);
      openerRef.current?.focus();
    };
    document.addEventListener('keydown', dismissOnEscape);
    return (): void => document.removeEventListener('keydown', dismissOnEscape);
  }, [point]);

  const activate = (actionId: ActionId): void => {
    onAction?.(actionId);
    const action = getAction(actionId);
    const formatActionId = formatActionIds[actionId];
    const capturedCommands =
      commands === null || selectionSnapshotRef.current === null
        ? commands
        : {
            ...commands,
            getSelection: (): ReturnType<typeof commands.getSelection> => ({
              status: 'available',
              value: selectionSnapshotRef.current,
            }),
          };
    const invoke =
      action.nativeRole === 'clipboard'
        ? async (): Promise<
            { status: 'unavailable'; reason: 'unsupported' } | undefined
          > => {
            if (actionId === 'paste-plain') {
              if (
                capturedCommands === null ||
                typeof navigator.clipboard?.readText !== 'function'
              ) {
                return { status: 'unavailable', reason: 'unsupported' };
              }
              const currentSelection = capturedCommands.getSelection();
              if (
                currentSelection.status !== 'available' ||
                currentSelection.value === null
              ) {
                return { status: 'unavailable', reason: 'unsupported' };
              }
              let text: string;
              try {
                text = await navigator.clipboard.readText();
              } catch {
                return { status: 'unavailable', reason: 'unsupported' };
              }
              return capturedCommands.replaceRange(currentSelection.value, text)
                .status === 'available'
                ? undefined
                : { status: 'unavailable', reason: 'unsupported' };
            }
            if (typeof document.execCommand !== 'function') {
              return { status: 'unavailable', reason: 'unsupported' };
            }
            return document.execCommand(actionId)
              ? undefined
              : { status: 'unavailable', reason: 'unsupported' };
          }
        : (): unknown =>
            formatActionId === undefined || capturedCommands === null
              ? undefined
              : applyFormatEdit(capturedCommands, {
                  actionId: formatActionId,
                  source: '',
                  selection: {
                    start: { lineNumber: 1, column: 1 },
                    end: { lineNumber: 1, column: 1 },
                  },
                  markers: {
                    bulletMarker:
                      markdownSettings.bulletMarker === '*' ||
                      markdownSettings.bulletMarker === '+'
                        ? markdownSettings.bulletMarker
                        : '-',
                    emphasisMarker:
                      markdownSettings.emphasisMarker === '_' ? '_' : '*',
                    headingStyle: 'atx',
                  },
                });
    void dispatchAction(actionId, {
      documentId: activeBuffer?.documentId,
      editorFocused: commands !== null && activeBuffer !== null,
      invoke,
      sessionDocumentId: activeBuffer?.documentId,
      writable: activeBuffer !== null,
    }).then((result): void => {
      onActionResult?.(result);
    });
    setPoint(null);
    openerRef.current?.focus();
  };

  return (
    <div
      className={styles.host}
      onContextMenu={(event): void => {
        event.preventDefault();
        const selection = commands?.getSelection();
        selectionSnapshotRef.current =
          selection?.status === 'available' ? selection.value : null;
        openerRef.current = event.target as HTMLElement;
        pointerRef.current = { left: event.clientX, top: event.clientY };
        setPoint(pointerRef.current);
      }}
    >
      {children}
      {point === null
        ? null
        : createPortal(
            <div
              ref={menuRef}
              aria-label={t('editor.contextMenu')}
              className={styles.menu}
              data-viewport-popup="context-menu"
              role="menu"
              style={{ left: point.left, top: point.top }}
              tabIndex={-1}
              onContextMenu={(event): void => event.preventDefault()}
            >
              {contextActions.map((item: ActionEntry) =>
                item.separatorBefore?.includes('context') === true ? (
                  <div key={`separator-before-${item.id}`}>
                    <div aria-hidden="true" className={styles.separator} />
                    <button
                      aria-keyshortcuts={
                        item.shortcut === undefined
                          ? undefined
                          : formatShortcut(item.shortcut, currentPlatform())
                      }
                      className={styles.item}
                      data-action-id={item.id}
                      disabled={item.availability.kind === 'deferred'}
                      role="menuitem"
                      type="button"
                      onClick={(): void => activate(item.id)}
                    >
                      {t(item.surfaceLabelKeys?.context ?? item.labelKey)}
                    </button>
                  </div>
                ) : (
                  <button
                    aria-keyshortcuts={
                      item.shortcut === undefined
                        ? undefined
                        : formatShortcut(item.shortcut, currentPlatform())
                    }
                    className={styles.item}
                    data-action-id={item.id}
                    disabled={item.availability.kind === 'deferred'}
                    key={item.id}
                    role="menuitem"
                    type="button"
                    onClick={(): void => activate(item.id)}
                  >
                    {t(item.surfaceLabelKeys?.context ?? item.labelKey)}
                  </button>
                ),
              )}
            </div>,
            document.body,
          )}
    </div>
  );
};

export default EditorContextMenu;
