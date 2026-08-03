import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../i18n';
import type { AppearanceChoice, Theme } from '../../logic/theme/theme';
import Segmented, { type SegmentedOption } from '../primitives/Segmented';
import styles from './SettingsMenu.module.css';

export interface SettingsMenuProps {
  mode: AppearanceChoice;
  onModeChange: (mode: AppearanceChoice) => void;
  onOpenAppearance: (opener?: HTMLElement | null) => void;
  onThemeChange: (theme: Theme) => void;
  theme: Theme;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onTrigger?: () => void;
  showTrigger?: boolean;
  triggerLabel?: string;
  anchorRef?: RefObject<HTMLElement | null>;
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
  anchorRef,
}: SettingsMenuProps): React.JSX.Element => {
  const [internalOpen, setInternalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [popupPosition, setPopupPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean): void => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  useLayoutEffect((): (() => void) | undefined => {
    if (!open) {
      return undefined;
    }

    const positionPopup = (): void => {
      const anchor = anchorRef?.current ?? triggerRef.current;
      const content = contentRef.current;
      if (anchor === null || anchor === undefined || content === null) {
        return;
      }
      const margin = 8;
      const anchorBounds = anchor.getBoundingClientRect();
      const popupBounds = content.getBoundingClientRect();
      const maximumLeft = Math.max(
        margin,
        window.innerWidth - popupBounds.width - margin,
      );
      const left = Math.min(
        Math.max(margin, anchorBounds.right - popupBounds.width),
        maximumLeft,
      );
      const below = anchorBounds.bottom + margin;
      const above = anchorBounds.top - popupBounds.height - margin;
      const top =
        below + popupBounds.height <= window.innerHeight - margin
          ? below
          : Math.max(margin, above);
      setPopupPosition({ left, top });
    };

    positionPopup();
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    return (): void => {
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
    };
  }, [anchorRef, open]);

  const popup = open
    ? createPortal(
        <div
          ref={contentRef}
          aria-label={t('settings.menu.label')}
          className={styles.content}
          role="menu"
          style={
            popupPosition === null
              ? { visibility: 'hidden' }
              : { left: popupPosition.left, top: popupPosition.top }
          }
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
              const opener = anchorRef?.current ?? triggerRef.current;
              setOpen(false);
              onOpenAppearance(opener);
            }}
          >
            {t('settings.menu.appearance')}
          </button>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={styles.menu} data-settings-menu-root>
      {showTrigger ? (
        <button
          ref={triggerRef}
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
      {popup}
    </div>
  );
};

export default SettingsMenu;
