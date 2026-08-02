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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onTrigger?: () => void;
  showTrigger?: boolean;
  triggerLabel?: string;
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
  open: controlledOpen,
  onOpenChange,
  onTrigger,
  showTrigger = true,
  triggerLabel = t('settings.menu.trigger'),
}: SettingsMenuProps): React.JSX.Element => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean): void => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className={styles.menu} data-settings-menu-root>
      {showTrigger ? (
        <button
          className={styles.trigger}
          data-settings-opener
          type="button"
          onClick={(): void => {
            if (onTrigger === undefined) {
              setOpen(!open);
            } else {
              onTrigger();
            }
          }}
        >
          {triggerLabel}
        </button>
      ) : null}
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
