import {
  Fragment,
  useContext,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PropsWithChildren,
} from 'react';

import { t } from '../../i18n';
import {
  actionsForSurface,
  getAction,
  getActionAvailability,
  type ActionId,
  type ActionEntry,
} from '../../logic/actions/actionRegistry';
import {
  dispatchAction,
  type ActionResult,
} from '../../logic/actions/actionDispatcher';
import { useEditingProjection } from '../../logic/hooks/useEditingProjection';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import { formatMarkers, runFormatAction } from '../../logic/format/formatting';
import type { EditorSelection } from '../components/CodeEditor';
import MenuItem from '../components/MenuItem';
import Popup, { PopupSeparator } from '../components/Popup';
import { useEditorSettings } from '../../logic/settings/editorSettings';
import { DocumentCommandContext, EditorSessionContext } from './editorSession';
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
  const editingProjection = useEditingProjection(activeBuffer?.documentId);
  const itemUnavailable = (item: {
    id: Parameters<typeof getActionAvailability>[0];
    availability: { kind: string };
  }): boolean =>
    item.availability.kind === 'deferred' ||
    (editingProjection !== undefined &&
      getActionAvailability(item.id, { projectedState: editingProjection })
        .kind === 'unavailable');
  const { markdownSettings } = useEditorSettings();
  const openerRef = useRef<HTMLElement | null>(null);
  const selectionSnapshotRef = useRef<EditorSelection | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  const openFromTarget = (
    target: EventTarget | null,
    nextPoint: { x: number; y: number },
  ): void => {
    const selection = commands?.getSelection();
    selectionSnapshotRef.current =
      selection?.status === 'available' ? selection.value : null;
    openerRef.current = target instanceof HTMLElement ? target : null;
    setPoint(nextPoint);
  };

  const openFromKeyboard = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void => {
    if (
      event.key !== 'ContextMenu' &&
      !(event.key === 'F10' && event.shiftKey)
    ) {
      return;
    }
    event.preventDefault();
    const target =
      event.target instanceof HTMLElement ? event.target : event.currentTarget;
    const bounds = target.getBoundingClientRect();
    openFromTarget(target, {
      x: bounds.left + Math.min(bounds.width / 2, 16),
      y: bounds.top + Math.min(bounds.height / 2, 16),
    });
  };

  const activate = (actionId: ActionId): void => {
    onAction?.(actionId);
    const action = getAction(actionId);
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
            runFormatAction({
              actionId,
              commands: capturedCommands,
              markers: formatMarkers(markdownSettings),
              selection:
                selectionSnapshotRef.current === null
                  ? undefined
                  : selectionSnapshotRef.current,
            });
    void dispatchAction(actionId, {
      documentId: activeBuffer?.documentId,
      editorFocused: commands !== null && activeBuffer !== null,
      projectedState: editingProjection,
      invoke,
      sessionDocumentId: activeBuffer?.documentId,
      writable: activeBuffer !== null,
    }).then((result): void => {
      onActionResult?.(result);
    });
    setPoint(null);
  };

  return (
    <div
      className={styles.host}
      onContextMenu={(event): void => {
        event.preventDefault();
        openFromTarget(event.target, { x: event.clientX, y: event.clientY });
      }}
      onKeyDown={openFromKeyboard}
    >
      {children}
      <Popup
        anchor={{ point: point ?? { x: 0, y: 0 } }}
        aria-label={t('editor.contextMenu')}
        data-viewport-popup="context-menu"
        initialFocus="first"
        open={point !== null}
        returnFocusTo={openerRef}
        role="menu"
        size="menu"
        onContextMenu={(event): void => event.preventDefault()}
        onOpenChange={(open): void => {
          if (!open) setPoint(null);
        }}
      >
        {contextActions.map((item: ActionEntry) => {
          const accelerator =
            item.shortcut === undefined
              ? undefined
              : formatShortcut(item.shortcut, currentPlatform());
          const menuItem = (
            <MenuItem
              accelerator={accelerator}
              aria-keyshortcuts={accelerator}
              data-action-id={item.id}
              disabled={itemUnavailable(item)}
              label={t(item.surfaceLabelKeys?.context ?? item.labelKey)}
              onSelect={(): void => activate(item.id)}
            />
          );
          return item.separatorBefore?.includes('context') === true ? (
            <Fragment key={'separator-before-' + item.id}>
              <PopupSeparator />
              {menuItem}
            </Fragment>
          ) : (
            <Fragment key={item.id}>{menuItem}</Fragment>
          );
        })}
      </Popup>
    </div>
  );
};

export default EditorContextMenu;
