import { useEffect, useRef } from 'react';

import { t } from '../../i18n';
import {
  actionsForSurface,
  type ActionEntry,
} from '../../logic/actions/actionRegistry';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import Button from '../primitives/Button';
import styles from './ShortcutsDialog.module.css';
import Icon from '../primitives/Icon';

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function focusable(dialog: HTMLElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

const ShortcutsDialog: React.FC<ShortcutsDialogProps> = ({
  open,
  onOpenChange,
}: ShortcutsDialogProps): React.JSX.Element | null => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const entries = actionsForSurface('shortcuts');

  useEffect((): void | (() => void) => {
    if (!open) {
      openerRef.current?.focus();
      openerRef.current = null;
      return undefined;
    }

    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== 'Tab' || dialogRef.current === null) return;
      const elements = focusable(dialogRef.current);
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => document.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  const platform = currentPlatform();
  return (
    <>
      <div
        aria-hidden="true"
        className={styles.overlay}
        onPointerDown={(): void => onOpenChange(false)}
      />
      <section
        ref={dialogRef}
        aria-label={t('editor.shortcuts')}
        aria-modal="true"
        className={styles.dialog}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2>{t('editor.shortcuts')}</h2>
          <Button
            aria-label={t('appearance.close')}
            className={styles.close}
            variant="quiet"
            onClick={(): void => onOpenChange(false)}
          >
            <Icon name="close" size={15} />
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
      </section>
    </>
  );
};

export default ShortcutsDialog;
