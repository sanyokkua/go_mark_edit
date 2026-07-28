import { t } from '../../i18n';
import Segmented, { type SegmentedOption } from '../primitives/Segmented';
import type { AppearanceChoice, Theme } from '../../logic/theme/theme';
import styles from './AppearanceDialog.module.css';

export interface AppearanceDialogProps {
  mode: AppearanceChoice;
  onModeChange: (mode: AppearanceChoice) => void;
  onOpenChange: (open: boolean) => void;
  onThemeChange: (theme: Theme) => void;
  open: boolean;
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

const AppearanceDialog: React.FC<AppearanceDialogProps> = ({
  mode,
  onModeChange,
  onOpenChange,
  onThemeChange,
  open,
  theme,
}: AppearanceDialogProps): React.JSX.Element | null => {
  if (!open) {
    return null;
  }

  return (
    <>
      <div className={styles.overlay} />
      <section
        aria-label={t('appearance.title')}
        aria-modal="true"
        className={styles.content}
        role="dialog"
      >
        <h2>{t('appearance.title')}</h2>
        <p>{t('appearance.help')}</p>
        <div className={styles.label}>
          {t('appearance.theme.label')}
          <Segmented
            aria-label={t('appearance.theme.label')}
            options={themeOptions}
            value={theme}
            onValueChange={onThemeChange}
          />
        </div>
        <div className={styles.label}>
          {t('appearance.mode.label')}
          <Segmented
            aria-label={t('appearance.mode.label')}
            options={modeOptions}
            value={mode}
            onValueChange={onModeChange}
          />
        </div>
        <button
          className={styles.close}
          type="button"
          onClick={(): void => {
            onOpenChange(false);
          }}
        >
          {t('appearance.close')}
        </button>
      </section>
    </>
  );
};

export default AppearanceDialog;
