import { useEffect, useRef } from 'react';

import { t } from '../../i18n';
import type { AppearanceChoice, Theme } from '../../logic/theme/theme';
import Segmented, { type SegmentedOption } from '../primitives/Segmented';
import styles from './SettingsDialog.module.css';

export interface SettingsDialogProps {
  mode: AppearanceChoice;
  onModeChange: (mode: AppearanceChoice) => void;
  onOpenChange: (open: boolean) => void;
  onReset: () => void;
  onThemeChange: (theme: Theme) => void;
  open: boolean;
  returnFocusTo?: HTMLElement | null;
  theme: Theme;
}

const themeOptions: readonly SegmentedOption<Theme>[] = [
  { label: t('appearance.theme.glass'), value: 'glass' },
  { label: t('appearance.theme.material'), value: 'material' },
  { label: t('appearance.theme.minimal'), value: 'minimal' },
];

const modeOptions: readonly SegmentedOption<AppearanceChoice>[] = [
  { label: t('appearance.mode.auto'), value: 'auto' },
  { label: t('appearance.mode.light'), value: 'light' },
  { label: t('appearance.mode.dark'), value: 'dark' },
];

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'));
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  mode,
  onModeChange,
  onOpenChange,
  onReset,
  onThemeChange,
  open,
  returnFocusTo,
  theme,
}: SettingsDialogProps): React.JSX.Element | null => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect((): void | (() => void) => {
    if (!open) return;

    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      const dialog = dialogRef.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== 'Tab' || dialog === null) {
        return;
      }

      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return (): void => {
      document.removeEventListener('keydown', onKeyDown);
      const focusTarget =
        returnFocusTo?.isConnected === true
          ? returnFocusTo
          : openerRef.current?.isConnected === true
            ? openerRef.current
            : null;
      focusTarget?.focus();
    };
  }, [onOpenChange, open, returnFocusTo]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div aria-hidden="true" className={styles.overlay} />
      <section
        ref={dialogRef}
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
        className={styles.content}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h1 id="settings-dialog-title">{t('shell.settings')}</h1>
          <p>{t('appearance.help')}</p>
        </header>
        <section aria-labelledby="settings-appearance-title">
          <h2 id="settings-appearance-title">{t('appearance.title')}</h2>
          <div className={styles.label}>
            <span>{t('appearance.theme.label')}</span>
            <Segmented
              aria-label={t('appearance.theme.label')}
              options={themeOptions}
              value={theme}
              onValueChange={onThemeChange}
            />
          </div>
          <div className={styles.label}>
            <span>{t('appearance.mode.label')}</span>
            <Segmented
              aria-label={t('appearance.mode.label')}
              options={modeOptions}
              value={mode}
              onValueChange={onModeChange}
            />
          </div>
        </section>
        <footer className={styles.actions}>
          <button className={styles.secondary} type="button" onClick={onReset}>
            {t('appearance.reset')}
          </button>
          <button
            className={styles.primary}
            type="button"
            onClick={(): void => onOpenChange(false)}
          >
            {t('appearance.close')}
          </button>
        </footer>
      </section>
    </>
  );
};

export default SettingsDialog;
