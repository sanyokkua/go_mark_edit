import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { CSSProperties } from 'react';

import { t } from '../../i18n';
import { getAction, type ActionId } from '../../logic/actions/actionRegistry';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import type { ViewArrangement } from '../../logic/store/appModelTypes';
import menu from './MenuSurface.module.css';
import MenuTrigger from './MenuTrigger';
import styles from './ViewMenu.module.css';

/*
 * The binding View dropdown is absolutely positioned inside the application
 * frame at `#m-view{left:196px}` with `.dropdown{top:42px}`. Portal into that
 * frame so the popup shares the frame's containing block instead of being
 * placed by collision-aware viewport coordinates.
 */
function applicationFrame(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector<HTMLElement>('.application-frame') ?? undefined;
}

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
  open,
  onOpenChange,
  modalOpen = false,
  modal = true,
  onTrigger,
  onTriggerPointerDown,
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

  /*
   * Binding source: mockup.html `.mi .k` (:241), rendered through the same
   * `data-shortcut` attribute the File popup already uses. Deriving it from the
   * registry keeps the accelerator the menu shows and the one the keyboard
   * handler honours the same value. A deferred action carries no registry
   * shortcut, so its row simply has no accelerator.
   */
  const acceleratorFor = (id: ActionId): string | undefined => {
    const { shortcut } = getAction(id);
    return shortcut === undefined
      ? undefined
      : formatShortcut(shortcut, currentPlatform());
  };

  /* Binding source: mockup.html `.tick` (:245). The 14px box is reserved even
     when off, so a selected and an unselected row stay the same width. */
  const tick = (selected: boolean): React.JSX.Element => (
    <span
      aria-hidden="true"
      className={`${menu.tick} ${selected ? '' : menu.tickOff}`}
    >
      ✓
    </span>
  );

  /* Binding source: mockup.html `.tgl` (:248–:250). The 19px pill is what makes
     these two rows 33px tall rather than 30px, so it carries the row geometry
     and is not decoration. */
  const toggle = (checked: boolean): React.JSX.Element => (
    <span aria-hidden="true" className={menu.toggle} data-checked={checked} />
  );

  const separator = <DropdownMenu.Separator className={menu.separator} />;
  const trigger = (
    <MenuTrigger
      data-view-trigger
      expanded={open ?? false}
      onClick={(event): void => {
        if (onTrigger === undefined) return;
        event.preventDefault();
        onTrigger();
      }}
      onOpen={(): void => onTrigger?.()}
      onPointerDown={(event): void => {
        onTriggerPointerDown?.(event.currentTarget);
        if (onTrigger !== undefined) event.preventDefault();
      }}
    >
      {triggerLabel}
    </MenuTrigger>
  );

  return (
    <DropdownMenu.Root modal={modal} open={open} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      ) : null}
      {!showTrigger && anchorStyle !== undefined ? (
        <DropdownMenu.Trigger asChild>
          <span aria-hidden="true" style={anchorStyle} />
        </DropdownMenu.Trigger>
      ) : null}
      <DropdownMenu.Portal container={applicationFrame()}>
        <DropdownMenu.Content
          aria-label={t('view.menu.label')}
          aria-labelledby={showTrigger ? undefined : ''}
          className={`${menu.surface} ${anchorStyle === undefined ? styles.bindingAnchored : ''}`}
          collisionPadding={8}
          data-viewport-popup="view-menu"
        >
          {/* Binding order, mockup.html `#m-view` (:626–:633): the two window
              toggles lead, then the visibility rows, then a separator, the two
              switch rows, a second separator, and finally the two window-state
              rows. */}
          {workspaceVisible === undefined ||
          onWorkspaceVisibilityChange === undefined ? null : (
            <DropdownMenu.CheckboxItem
              checked={workspaceVisible}
              className={menu.row}
              data-shortcut={acceleratorFor('toggle-sidebar')}
              onCheckedChange={(visible): void =>
                dispatchWindowAction('toggle-sidebar', () =>
                  onWorkspaceVisibilityChange(visible),
                )
              }
            >
              {t(
                arrangement === undefined
                  ? 'view.menu.showWorkspace'
                  : getAction('toggle-sidebar').labelKey,
              )}
            </DropdownMenu.CheckboxItem>
          )}
          <DropdownMenu.Item
            className={menu.row}
            data-action-id={assistantAction.id}
            data-availability={assistantAction.availability.kind}
            data-shortcut={acceleratorFor(assistantAction.id)}
            disabled={assistantAction.availability.kind === 'deferred'}
            title={
              assistantAction.availability.kind === 'deferred'
                ? t('action.unavailable')
                : undefined
            }
          >
            {t(assistantAction.labelKey)}
          </DropdownMenu.Item>
          {arrangement === undefined || onArrangementChange === undefined ? (
            <>
              <DropdownMenu.CheckboxItem
                checked={editorVisible}
                className={menu.row}
                disabled={editorToggleDisabled}
                onCheckedChange={(visible): void =>
                  dispatchWindowAction('editor', () =>
                    onEditorVisibilityChange(visible),
                  )
                }
              >
                {t('view.menu.showEditor')}
                {tick(editorVisible)}
              </DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={previewVisible}
                className={menu.row}
                disabled={previewToggleDisabled}
                onCheckedChange={(visible): void =>
                  dispatchWindowAction('preview', () =>
                    onPreviewVisibilityChange(visible),
                  )
                }
              >
                {t('view.menu.showPreview')}
                {tick(previewVisible)}
              </DropdownMenu.CheckboxItem>
            </>
          ) : (
            <DropdownMenu.RadioGroup
              aria-label={t('editor.arrangement')}
              value={arrangement}
              onValueChange={(value): void => {
                if (
                  value === 'editor' ||
                  value === 'split' ||
                  value === 'preview'
                ) {
                  dispatchWindowAction(value, () => onArrangementChange(value));
                  onOpenChange?.(false);
                }
              }}
            >
              {(['editor', 'split', 'preview'] as const).map((value) => (
                <DropdownMenu.RadioItem
                  className={menu.row}
                  data-availability={documentOpen ? 'enabled' : 'unavailable'}
                  disabled={!documentOpen}
                  key={value}
                  title={documentOpen ? undefined : t('view.menu.noDocument')}
                  value={value}
                >
                  {t(getAction(value).labelKey)}
                  {tick(arrangement === value)}
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          )}
          {separator}
          {lineNumbers === undefined ||
          onLineNumbersChange === undefined ? null : (
            <DropdownMenu.CheckboxItem
              checked={lineNumbers}
              className={menu.row}
              onCheckedChange={(enabled): void =>
                dispatchWindowAction('line-numbers', () =>
                  onLineNumbersChange(enabled),
                )
              }
            >
              {t(getAction('line-numbers').labelKey)}
              {toggle(lineNumbers)}
            </DropdownMenu.CheckboxItem>
          )}
          {wordWrap === undefined || onWordWrapChange === undefined ? null : (
            <DropdownMenu.CheckboxItem
              checked={wordWrap}
              className={menu.row}
              onCheckedChange={(enabled): void =>
                dispatchWindowAction('word-wrap', () =>
                  onWordWrapChange(enabled),
                )
              }
            >
              {t(getAction('word-wrap').labelKey)}
              {toggle(wordWrap)}
            </DropdownMenu.CheckboxItem>
          )}
          {separator}
          <DropdownMenu.Item
            className={menu.row}
            data-shortcut={acceleratorFor('distraction-free-reading')}
            disabled
          >
            {t(getAction('distraction-free-reading').labelKey)}
          </DropdownMenu.Item>
          {onFullscreen === undefined ? null : (
            <DropdownMenu.Item
              className={menu.row}
              data-shortcut={acceleratorFor('fullscreen')}
              onSelect={(): void =>
                dispatchWindowAction('fullscreen', onFullscreen)
              }
            >
              {t(getAction('fullscreen').labelKey)}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default ViewMenu;
