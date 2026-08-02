import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import { t } from '../../i18n';
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
  showTrigger?: boolean;
  triggerLabel?: string;
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
  showTrigger = true,
  triggerLabel = t('view.menu.trigger'),
}: ViewMenuProps): React.JSX.Element => {
  const editorToggleDisabled = editorVisible && !previewVisible;
  const previewToggleDisabled = previewVisible && !editorVisible;

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      {showTrigger ? (
        <DropdownMenu.Trigger asChild>
          <button className={styles.trigger} type="button">
            {triggerLabel}
          </button>
        </DropdownMenu.Trigger>
      ) : null}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          aria-label={t('view.menu.label')}
          className={styles.content}
        >
          <DropdownMenu.CheckboxItem
            checked={editorVisible}
            className={styles.item}
            disabled={editorToggleDisabled}
            onCheckedChange={onEditorVisibilityChange}
          >
            {t('view.menu.showEditor')}
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.CheckboxItem
            checked={previewVisible}
            className={styles.item}
            disabled={previewToggleDisabled}
            onCheckedChange={onPreviewVisibilityChange}
          >
            {t('view.menu.showPreview')}
          </DropdownMenu.CheckboxItem>
          {workspaceVisible === undefined ||
          onWorkspaceVisibilityChange === undefined ? null : (
            <DropdownMenu.CheckboxItem
              checked={workspaceVisible}
              className={styles.item}
              onCheckedChange={onWorkspaceVisibilityChange}
            >
              {t('view.menu.showWorkspace')}
            </DropdownMenu.CheckboxItem>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default ViewMenu;
