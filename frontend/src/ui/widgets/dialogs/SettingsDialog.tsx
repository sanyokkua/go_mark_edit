import { t } from '../../../i18n';
import type { AppearanceChoice, Theme } from '../../../logic/theme/theme';
import ModalShell from '../../components/ModalShell';
import Button from '../../primitives/Button';
import Segmented, { type SegmentedOption } from '../../primitives/Segmented';
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
  if (!open) {
    return null;
  }

  return (
    <ModalShell
      dismiss="backdrop"
      onRequestClose={(): void => onOpenChange(false)}
      open
      returnFocusTo={returnFocusTo}
      title={t('shell.settings')}
      width="32rem"
    >
      <header>
        <p>{t('appearance.help')}</p>
      </header>
      <section aria-labelledby="settings-appearance-title">
        <h2 id="settings-appearance-title">{t('appearance.title')}</h2>
        <div className={styles.label}>
          <span>{t('appearance.theme.label')}</span>
          <Segmented
            ariaLabel={t('appearance.theme.label')}
            options={themeOptions}
            value={theme}
            onChange={onThemeChange}
          />
        </div>
        <div className={styles.label}>
          <span>{t('appearance.mode.label')}</span>
          <Segmented
            ariaLabel={t('appearance.mode.label')}
            options={modeOptions}
            value={mode}
            onChange={onModeChange}
          />
        </div>
      </section>
      <footer className={styles.actions}>
        <Button
          className={styles.secondary}
          variant="secondary"
          onClick={onReset}
        >
          {t('appearance.reset')}
        </Button>
        <Button
          className={styles.primary}
          variant="primary"
          onClick={(): void => onOpenChange(false)}
        >
          {t('appearance.close')}
        </Button>
      </footer>
    </ModalShell>
  );
};

export default SettingsDialog;
