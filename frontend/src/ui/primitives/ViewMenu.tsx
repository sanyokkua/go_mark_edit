import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { CSSProperties } from 'react';

import { t } from '../../i18n';
import { getAction, type ActionId } from '../../logic/actions/actionRegistry';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import type { ViewArrangement } from '../../logic/store/appModelTypes';
import styles from './ViewMenu.module.css';

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
  const trigger = (
    <button
      className={styles.trigger}
      data-view-trigger
      type="button"
      onClick={(event): void => {
        if (onTrigger === undefined) return;
        event.preventDefault();
        onTrigger();
      }}
      onPointerDown={(event): void => {
        onTriggerPointerDown?.(event.currentTarget);
        if (onTrigger !== undefined) event.preventDefault();
      }}
      onKeyDown={(event): void => {
        if (
          onTrigger !== undefined &&
          (event.key === 'ArrowDown' ||
            event.key === 'Enter' ||
            event.key === ' ')
        ) {
          event.preventDefault();
          onTrigger();
        }
      }}
    >
      {triggerLabel}
    </button>
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
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          aria-label={t('view.menu.label')}
          aria-labelledby={showTrigger ? undefined : ''}
          className={styles.content}
          collisionPadding={8}
          data-viewport-popup="view-menu"
          sideOffset={-6}
        >
          {arrangement === undefined || onArrangementChange === undefined ? (
            <>
              <DropdownMenu.CheckboxItem
                checked={editorVisible}
                className={styles.item}
                disabled={editorToggleDisabled}
                onCheckedChange={(visible): void =>
                  dispatchWindowAction('editor', () =>
                    onEditorVisibilityChange(visible),
                  )
                }
              >
                {t('view.menu.showEditor')}
              </DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={previewVisible}
                className={styles.item}
                disabled={previewToggleDisabled}
                onCheckedChange={(visible): void =>
                  dispatchWindowAction('preview', () =>
                    onPreviewVisibilityChange(visible),
                  )
                }
              >
                {t('view.menu.showPreview')}
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
                  className={styles.item}
                  key={value}
                  value={value}
                >
                  {t(getAction(value).labelKey)}
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          )}
          {workspaceVisible === undefined ||
          onWorkspaceVisibilityChange === undefined ? null : (
            <DropdownMenu.CheckboxItem
              checked={workspaceVisible}
              className={styles.item}
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
            className={styles.item}
            data-action-id={assistantAction.id}
            data-availability={assistantAction.availability.kind}
            disabled={assistantAction.availability.kind === 'deferred'}
            title={
              assistantAction.availability.kind === 'deferred'
                ? t('action.unavailable')
                : undefined
            }
          >
            {t(assistantAction.labelKey)}
          </DropdownMenu.Item>
          {lineNumbers === undefined ||
          onLineNumbersChange === undefined ? null : (
            <DropdownMenu.CheckboxItem
              checked={lineNumbers}
              className={styles.item}
              onCheckedChange={(enabled): void =>
                dispatchWindowAction('line-numbers', () =>
                  onLineNumbersChange(enabled),
                )
              }
            >
              {t(getAction('line-numbers').labelKey)}
            </DropdownMenu.CheckboxItem>
          )}
          {wordWrap === undefined || onWordWrapChange === undefined ? null : (
            <DropdownMenu.CheckboxItem
              checked={wordWrap}
              className={styles.item}
              onCheckedChange={(enabled): void =>
                dispatchWindowAction('word-wrap', () =>
                  onWordWrapChange(enabled),
                )
              }
            >
              {t(getAction('word-wrap').labelKey)}
            </DropdownMenu.CheckboxItem>
          )}
          <DropdownMenu.Item className={styles.item} disabled>
            {t(getAction('distraction-free-reading').labelKey)}
          </DropdownMenu.Item>
          {onFullscreen === undefined ? null : (
            <DropdownMenu.Item
              className={styles.item}
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
