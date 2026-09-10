import { useState, type CSSProperties, type RefObject } from 'react';

import { t } from '../../i18n';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import {
  getAction,
  getActionAvailability,
  type ActionId,
} from '../../logic/actions/actionRegistry';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import type { ViewArrangement } from '../../logic/store/appModelTypes';
import MenuItem from '../components/MenuItem';
import Popup, { PopupSeparator, PopupTrigger } from '../components/Popup';
import popupStyles from '../components/Popup/Popup.module.css';

export interface ViewMenuProps {
  editorVisible: boolean;
  onEditorVisibilityChange: (visible: boolean) => void;
  onPreviewVisibilityChange: (visible: boolean) => void;
  onWorkspaceVisibilityChange?: (visible: boolean) => void;
  previewVisible: boolean;
  workspaceVisible?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modalOpen?: boolean;
  modal?: boolean;
  onTrigger?: () => void;
  onTriggerPointerDown?: (trigger: HTMLButtonElement) => void;
  anchorRef?: RefObject<HTMLElement | null>;
  anchorElement?: HTMLElement | null;
  anchorStyle?: CSSProperties;
  showTrigger?: boolean;
  triggerLabel?: string;
  arrangement?: ViewArrangement;
  onArrangementChange?: (arrangement: ViewArrangement) => void;
  /*
   * The menu is always present, because a menu that disappears gives the user
   * nothing to read. With no document open the rows whose values come from the
   * active document are drawn unavailable instead.
   */
  documentOpen?: boolean;
  lineNumbers?: boolean;
  onLineNumbersChange?: (enabled: boolean) => void;
  wordWrap?: boolean;
  onWordWrapChange?: (enabled: boolean) => void;
  onFullscreen?: () => void;
}

const ViewMenu: React.FC<ViewMenuProps> = ({
  editorVisible,
  onEditorVisibilityChange,
  onPreviewVisibilityChange,
  onWorkspaceVisibilityChange,
  previewVisible,
  workspaceVisible,
  open: controlledOpen,
  onOpenChange,
  modalOpen = false,
  onTrigger,
  onTriggerPointerDown,
  anchorRef,
  anchorElement,
  anchorStyle,
  showTrigger = true,
  triggerLabel = t('view.menu.trigger'),
  arrangement,
  onArrangementChange,
  documentOpen = true,
  lineNumbers,
  onLineNumbersChange,
  wordWrap,
  onWordWrapChange,
  onFullscreen,
}: ViewMenuProps): React.JSX.Element => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [triggerElement, setTriggerElement] =
    useState<HTMLButtonElement | null>(null);
  const [hiddenAnchor, setHiddenAnchor] = useState<HTMLSpanElement | null>(
    null,
  );
  const open = controlledOpen ?? internalOpen;

  const setOpen = (next: boolean): void => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  const dispatchWindowAction = (
    actionId: ActionId,
    invoke: () => void,
  ): void => {
    void dispatchAction(actionId, {
      invoke,
      modalOpen,
      windowFocused: true,
    });
  };
  const editorToggleDisabled = editorVisible && !previewVisible;
  const previewToggleDisabled = previewVisible && !editorVisible;
  const assistantAction = getAction('toggle-assistant');
  const assistantAvailability = getActionAvailability(assistantAction.id, {
    modalOpen,
  });
  const availabilityOf = (id: ActionId): boolean =>
    getActionAvailability(id, { modalOpen }).kind === 'available';

  const acceleratorFor = (id: ActionId): string | undefined => {
    const { shortcut } = getAction(id);
    return shortcut === undefined
      ? undefined
      : formatShortcut(shortcut, currentPlatform());
  };

  const tick = (selected: boolean): React.JSX.Element => (
    <span
      aria-hidden="true"
      className={popupStyles.tick + (selected ? '' : ' ' + popupStyles.tickOff)}
    >
      ✓
    </span>
  );

  const toggle = (checked: boolean): React.JSX.Element => (
    <span
      aria-hidden="true"
      className={popupStyles.toggle}
      data-checked={checked}
    />
  );

  const popupAnchor = {
    trigger: showTrigger ? triggerElement : (anchorElement ?? hiddenAnchor),
  };

  return (
    <>
      {showTrigger ? (
        <PopupTrigger
          ref={setTriggerElement}
          data-view-trigger
          expanded={open}
          onClick={(event): void => {
            if (onTrigger === undefined) {
              setOpen(!open);
              return;
            }
            event.preventDefault();
            onTrigger();
          }}
          onOpen={(): void => {
            if (onTrigger === undefined) {
              setOpen(true);
            } else {
              onTrigger();
            }
          }}
          onPointerDown={(event): void => {
            onTriggerPointerDown?.(event.currentTarget);
            if (onTrigger !== undefined) event.preventDefault();
          }}
        >
          {triggerLabel}
        </PopupTrigger>
      ) : null}
      {!showTrigger && anchorRef === undefined && anchorStyle !== undefined ? (
        <span ref={setHiddenAnchor} aria-hidden="true" style={anchorStyle} />
      ) : null}
      <Popup
        anchor={popupAnchor}
        aria-label={t('view.menu.label')}
        data-viewport-popup="view-menu"
        initialFocus="first"
        open={open}
        returnFocusTo={popupAnchor.trigger}
        role="menu"
        size="menu"
        onOpenChange={setOpen}
      >
        {workspaceVisible === undefined ||
        onWorkspaceVisibilityChange === undefined ? null : (
          <MenuItem
            checked={workspaceVisible}
            accelerator={acceleratorFor('toggle-sidebar')}
            label={
              arrangement === undefined
                ? t('view.menu.showWorkspace')
                : t(getAction('toggle-sidebar').labelKey)
            }
            onSelect={(): void =>
              dispatchWindowAction('toggle-sidebar', () =>
                onWorkspaceVisibilityChange(!workspaceVisible),
              )
            }
          />
        )}
        <MenuItem
          data-action-id={assistantAction.id}
          data-availability={assistantAvailability.kind}
          accelerator={acceleratorFor(assistantAction.id)}
          disabled={assistantAvailability.kind !== 'available'}
          label={t(assistantAction.labelKey)}
          title={
            assistantAvailability.kind !== 'available'
              ? t('action.unavailable')
              : undefined
          }
        />
        {arrangement === undefined || onArrangementChange === undefined ? (
          <>
            <MenuItem
              checked={editorVisible}
              disabled={editorToggleDisabled}
              label={t('view.menu.showEditor')}
              trailing={tick(editorVisible)}
              onSelect={(): void =>
                dispatchWindowAction('editor', () =>
                  onEditorVisibilityChange(!editorVisible),
                )
              }
            />
            <MenuItem
              checked={previewVisible}
              disabled={previewToggleDisabled}
              label={t('view.menu.showPreview')}
              trailing={tick(previewVisible)}
              onSelect={(): void =>
                dispatchWindowAction('preview', () =>
                  onPreviewVisibilityChange(!previewVisible),
                )
              }
            />
          </>
        ) : (
          <div aria-label={t('editor.arrangement')} role="group">
            {(['editor', 'split', 'preview'] as const).map((value) => (
              <MenuItem
                checked={arrangement === value}
                data-availability={documentOpen ? 'enabled' : 'unavailable'}
                disabled={!documentOpen}
                key={value}
                label={t(getAction(value).labelKey)}
                radio
                title={documentOpen ? undefined : t('view.menu.noDocument')}
                trailing={tick(arrangement === value)}
                onSelect={(): void => {
                  if (!documentOpen) return;
                  dispatchWindowAction(value, () => onArrangementChange(value));
                  setOpen(false);
                }}
              />
            ))}
          </div>
        )}
        <PopupSeparator />
        {lineNumbers === undefined ||
        onLineNumbersChange === undefined ? null : (
          <MenuItem
            checked={lineNumbers}
            label={t(getAction('line-numbers').labelKey)}
            trailing={toggle(lineNumbers)}
            onSelect={(): void =>
              dispatchWindowAction('line-numbers', () =>
                onLineNumbersChange(!lineNumbers),
              )
            }
          />
        )}
        {wordWrap === undefined || onWordWrapChange === undefined ? null : (
          <MenuItem
            checked={wordWrap}
            label={t(getAction('word-wrap').labelKey)}
            trailing={toggle(wordWrap)}
            onSelect={(): void =>
              dispatchWindowAction('word-wrap', () =>
                onWordWrapChange(!wordWrap),
              )
            }
          />
        )}
        <PopupSeparator />
        <MenuItem
          accelerator={acceleratorFor('distraction-free-reading')}
          disabled={!availabilityOf('distraction-free-reading')}
          label={t(getAction('distraction-free-reading').labelKey)}
        />
        {onFullscreen === undefined ? null : (
          <MenuItem
            accelerator={acceleratorFor('fullscreen')}
            label={t(getAction('fullscreen').labelKey)}
            onSelect={(): void =>
              dispatchWindowAction('fullscreen', onFullscreen)
            }
          />
        )}
      </Popup>
    </>
  );
};

export default ViewMenu;
