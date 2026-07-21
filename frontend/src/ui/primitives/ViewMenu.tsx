import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import { t } from '../../i18n';
import styles from './ViewMenu.module.css';

export interface ViewMenuProps {
  editorVisible: boolean;
  onEditorVisibilityChange: (visible: boolean) => void;
  onPreviewVisibilityChange: (visible: boolean) => void;
  previewVisible: boolean;
}

const ViewMenu: React.FC<ViewMenuProps> = ({
  editorVisible,
  onEditorVisibilityChange,
  onPreviewVisibilityChange,
  previewVisible,
}: ViewMenuProps): React.JSX.Element => {
  const editorToggleDisabled = editorVisible && !previewVisible;
  const previewToggleDisabled = previewVisible && !editorVisible;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className={styles.trigger} type="button">
          {t('view.menu.trigger')}
        </button>
      </DropdownMenu.Trigger>
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default ViewMenu;
