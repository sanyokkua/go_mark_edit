import { t } from '../../i18n';
import {
  actionsForSurface,
  type ActionEntry,
} from '../../logic/actions/actionRegistry';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import ModalShell from '../components/ModalShell';
import Button from '../primitives/Button';
import Icon from '../primitives/Icon';
import styles from './ShortcutsDialog.module.css';

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ShortcutsDialog: React.FC<ShortcutsDialogProps> = ({
  open,
  onOpenChange,
}: ShortcutsDialogProps): React.JSX.Element | null => {
  const entries = actionsForSurface('shortcuts');

  if (!open) return null;

  const platform = currentPlatform();
  return (
    <ModalShell
      dismiss="backdrop"
      onRequestClose={(): void => onOpenChange(false)}
      open
      title={t('editor.shortcuts')}
      width="38rem"
    >
      <div className={styles.header}>
        <Button
          aria-label={t('appearance.close')}
          className={styles.close}
          variant="quiet"
          onClick={(): void => onOpenChange(false)}
        >
          <Icon name="close" />
        </Button>
      </div>
      <div className={styles.list}>
        {entries.map((entry: ActionEntry) => (
          <div
            aria-disabled={entry.availability.kind === 'deferred'}
            className={styles.row}
            data-action-id={entry.id}
            data-availability={entry.availability.kind}
            key={entry.id}
          >
            <span>{t(entry.labelKey)}</span>
            <span className={styles.metadata}>
              <span>{t(`action.scope.${entry.scope}`)}</span>
              <span>
                {entry.availability.kind === 'deferred'
                  ? t('action.unavailable')
                  : t('action.available')}
              </span>
            </span>
            <kbd>
              {entry.shortcut === undefined
                ? '—'
                : formatShortcut(entry.shortcut, platform)}
            </kbd>
          </div>
        ))}
      </div>
    </ModalShell>
  );
};

export default ShortcutsDialog;
