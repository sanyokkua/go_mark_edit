import { useState } from 'react';

import { t } from '../../i18n';
import type { AppearanceChoice, Theme } from '../../logic/theme/theme';
import Segmented, { type SegmentedOption } from '../primitives/Segmented';
import styles from './SettingsMenu.module.css';

export interface SettingsMenuProps {
  mode: AppearanceChoice;
  onModeChange: (mode: AppearanceChoice) => void;
  onOpenAppearance: () => void;
  onThemeChange: (theme: Theme) => void;
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

const SettingsMenu: React.FC<SettingsMenuProps> = ({
  mode,
  onModeChange,
  onOpenAppearance,
  onThemeChange,
  theme,
}: SettingsMenuProps): React.JSX.Element => {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.menu}>
      <button
        className={styles.trigger}
        type="button"
        onClick={(): void => {
          setOpen(!open);
        }}
      >
        {t('settings.menu.trigger')}
      </button>
      {open ? (
        <div
          aria-label={t('settings.menu.label')}
          className={styles.content}
          role="menu"
        >
          <Segmented
            aria-label={t('appearance.theme.label')}
            options={themeOptions}
            value={theme}
            onValueChange={onThemeChange}
          />
          <Segmented
            aria-label={t('appearance.mode.label')}
            options={modeOptions}
            value={mode}
            onValueChange={onModeChange}
          />
          <button
            className={styles.item}
            role="menuitem"
            type="button"
            onClick={(): void => {
              setOpen(false);
              onOpenAppearance();
            }}
          >
            {t('settings.menu.appearance')}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default SettingsMenu;
