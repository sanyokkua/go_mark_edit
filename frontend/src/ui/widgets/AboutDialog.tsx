import { useEffect, useRef } from 'react';

import { t } from '../../i18n';
import Button from '../primitives/Button';
import styles from './AppearanceDialog.module.css';

export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
}

const AboutDialog: React.FC<AboutDialogProps> = ({
  open,
  onOpenChange,
  version,
}: AboutDialogProps): React.JSX.Element | null => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect((): void | (() => void) => {
    if (!open) {
      openerRef.current?.focus();
      openerRef.current = null;
      return;
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
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
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
  return (
    <>
      <div
        aria-hidden="true"
        className={styles.overlay}
        onPointerDown={(): void => onOpenChange(false)}
      />
      <section
        aria-label={t('about.title')}
        aria-modal="true"
        className={styles.content}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2>{t('about.title')}</h2>
        <p>{t('about.version', { version })}</p>
        <Button
          className={styles.close}
          variant="primary"
          onClick={(): void => onOpenChange(false)}
        >
          {t('appearance.close')}
        </Button>
      </section>
    </>
  );
};

export default AboutDialog;
