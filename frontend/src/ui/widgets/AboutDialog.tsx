import { useEffect, useRef } from 'react';

import { t } from '../../i18n';
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
  useEffect((): void | (() => void) => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => document.removeEventListener('keydown', onKeyDown);
  }, [onOpenChange, open]);
  if (!open) return null;
  return (
    <>
      <div className={styles.overlay} />
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
        <button
          className={styles.close}
          type="button"
          onClick={(): void => onOpenChange(false)}
        >
          {t('appearance.close')}
        </button>
      </section>
    </>
  );
};

export default AboutDialog;
