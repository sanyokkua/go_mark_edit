import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../i18n';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import { type ActionId } from '../../logic/actions/actionRegistry';
import type {
  EditorSettings,
  FileSettings,
  MarkdownSettings,
} from '../../logic/adapter';
import type { AppearanceChoice, Theme } from '../../logic/theme/theme';
import menu from '../primitives/MenuSurface.module.css';
import MenuTrigger from '../primitives/MenuTrigger';
import styles from './SettingsMenu.module.css';

export interface SettingsMenuProps {
  defaultOpenMode?: 'reading' | 'editor';
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
  editorSettings?: EditorSettings;
  onEditorSettingsChange?: (patch: Partial<EditorSettings>) => void;
  fileSettings?: FileSettings;
  onFileSettingsChange?: (patch: Partial<FileSettings>) => void;
  markdownSettings?: MarkdownSettings;
  onMarkdownSettingsChange?: (patch: Partial<MarkdownSettings>) => void;
}

const themeOptions: readonly { label: string; value: Theme }[] = [
  { label: t('appearance.theme.glass'), value: 'glass' },
  { label: t('appearance.theme.material'), value: 'material' },
  { label: t('appearance.theme.minimal'), value: 'minimal' },
];

/**
 * The compact popup reproduces the binding mockup's `#m-settings` label text,
 * which differs from the full Settings dialog wording for the same choices.
 * Both come from the catalogue; neither is written into the component.
 */
const modeOptions: readonly {
  label: string;
  value: AppearanceChoice;
}[] = [
  { label: t('settings.menu.appearance.auto'), value: 'auto' },
  { label: t('settings.menu.appearance.light'), value: 'light' },
  { label: t('settings.menu.appearance.dark'), value: 'dark' },
];

const openModeOptions: readonly {
  label: string;
  value: 'reading' | 'editor';
}[] = [
  { label: t('settings.openMode.reading'), value: 'reading' },
  { label: t('settings.openMode.editor'), value: 'editor' },
];

const markdownStandardOptions = [
  { label: t('settings.menu.markdown.minimal'), value: 'minimal' },
  { label: t('settings.menu.markdown.gfm'), value: 'gfm' },
  { label: t('settings.menu.markdown.full'), value: 'full' },
] as const;

const saveToggleLabels = {
  autosave: t('settings.autosave'),
  formatOnSave: t('settings.formatOnSave'),
  lintOnSave: t('settings.lintOnSave'),
} as const;

interface CompactSettingsContentProps {
  defaultOpenMode?: 'reading' | 'editor';
  fileSettings?: FileSettings;
  markdownSettings?: MarkdownSettings;
  mode: AppearanceChoice;
  onFileSettingsChange?: (patch: Partial<FileSettings>) => void;
  onMarkdownSettingsChange?: (patch: Partial<MarkdownSettings>) => void;
  onModeChange: (mode: AppearanceChoice) => void;
  onOpenAppearance: () => void;
  onThemeChange: (theme: Theme) => void;
  theme: Theme;
}

const CompactSettingsContent: React.FC<CompactSettingsContentProps> = ({
  defaultOpenMode = 'editor',
  fileSettings,
  markdownSettings,
  mode,
  onFileSettingsChange,
  onMarkdownSettingsChange,
  onModeChange,
  onOpenAppearance,
  onThemeChange,
  theme,
}: CompactSettingsContentProps): React.JSX.Element => {
  const tick = (selected: boolean): React.JSX.Element => (
    <span
      aria-hidden="true"
      className={`${menu.tick} ${selected ? '' : menu.tickOff}`}
    >
      ✓
    </span>
  );

  const toggle = (
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    disabled = false,
  ): React.JSX.Element => (
    <div
      aria-disabled={disabled}
      className={menu.row}
      data-settings-row={label}
    >
      <span>{label}</span>
      <span
        className={menu.toggle}
        data-checked={checked}
        data-settings-toggle={label}
      >
        <input
          aria-label={label}
          checked={checked}
          className={styles.toggleInput}
          disabled={disabled}
          type="checkbox"
          onChange={(event): void => onChange(event.target.checked)}
        />
      </span>
    </div>
  );

  return (
    <div className={styles.settingsBody} data-settings-content>
      <div className={menu.groupLabel}>{t('settings.menu.theme')}</div>
      <div
        aria-label={t('settings.menu.theme')}
        className={styles.swatches}
        role="radiogroup"
      >
        {themeOptions.map((option) => (
          <i
            key={option.value}
            aria-checked={theme === option.value}
            aria-label={option.label}
            className={`${styles.swatch} ${theme === option.value ? styles.swatchSelected : ''}`}
            data-theme={option.value}
            role="radio"
            tabIndex={theme === option.value ? 0 : -1}
            onKeyDown={(event): void => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onThemeChange(option.value);
              }
            }}
            onClick={(): void => onThemeChange(option.value)}
          />
        ))}
      </div>
      <div className={menu.groupLabel}>{t('appearance.mode.label')}</div>
      <div
        aria-label={t('appearance.mode.label')}
        className={styles.options}
        role="radiogroup"
      >
        {modeOptions.map((option) => (
          <div
            key={option.value}
            aria-checked={mode === option.value}
            className={menu.row}
            role="radio"
            tabIndex={0}
            onClick={(): void => onModeChange(option.value)}
            onKeyDown={(event): void => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onModeChange(option.value);
              }
            }}
          >
            <span>{option.label}</span>
            {tick(mode === option.value)}
          </div>
        ))}
      </div>
      <div className={menu.separator} />
      <div className={menu.groupLabel}>{t('settings.openMode')}</div>
      {openModeOptions.map((option) => (
        <div
          aria-disabled="true"
          className={`${menu.row} ${menu.stateRow}`}
          key={option.value}
          role="menuitem"
        >
          <span>{option.label}</span>
          {tick(defaultOpenMode === option.value)}
        </div>
      ))}
      <div className={menu.separator} />
      <div className={menu.groupLabel}>{t('settings.menu.markdown')}</div>
      {markdownStandardOptions.map((option) => (
        <div
          aria-disabled="true"
          className={`${menu.row} ${menu.stateRow}`}
          key={option.value}
          role="menuitem"
        >
          <span>{option.label}</span>
          {tick((markdownSettings?.standard ?? 'gfm') === option.value)}
        </div>
      ))}
      <div className={menu.separator} />
      {toggle(
        saveToggleLabels.autosave,
        fileSettings?.autosave ?? true,
        (checked): void => onFileSettingsChange?.({ autosave: checked }),
        onFileSettingsChange === undefined,
      )}
      {toggle(
        saveToggleLabels.formatOnSave,
        markdownSettings?.formatOnSave ?? false,
        (checked): void =>
          onMarkdownSettingsChange?.({ formatOnSave: checked }),
        onMarkdownSettingsChange === undefined,
      )}
      {toggle(
        saveToggleLabels.lintOnSave,
        markdownSettings?.lintOnSave ?? true,
        (checked): void => onMarkdownSettingsChange?.({ lintOnSave: checked }),
        onMarkdownSettingsChange === undefined,
      )}
      <div className={menu.separator} />
      <div
        className={menu.row}
        role="menuitem"
        tabIndex={0}
        onClick={onOpenAppearance}
        onKeyDown={(event): void => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpenAppearance();
          }
        }}
      >
        <span>{t('settings.menu.allSettings')}</span>
        <span className={styles.shortcut}>
          {t('settings.menu.allSettings.accelerator')}
        </span>
      </div>
    </div>
  );
};

const SettingsMenu: React.FC<SettingsMenuProps> = ({
  defaultOpenMode,
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
  fileSettings,
  onFileSettingsChange,
  markdownSettings,
  onMarkdownSettingsChange,
}: SettingsMenuProps): React.JSX.Element => {
  const [internalOpen, setInternalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [popupPosition, setPopupPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean): void => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const dispatchSettingsAction = (
    actionId: ActionId,
    invoke: () => void,
  ): void => {
    void dispatchAction(actionId, {
      applicationFocused: true,
      invoke,
      modalOpen: false,
    });
  };

  useLayoutEffect((): (() => void) | undefined => {
    if (!open) return undefined;

    const positionPopup = (): void => {
      const anchor = anchorRef?.current ?? triggerRef.current;
      const content = contentRef.current;
      if (anchor === null || anchor === undefined || content === null) return;
      const margin = 8;
      const anchorBounds = anchor.getBoundingClientRect();
      const popupBounds = content.getBoundingClientRect();
      const applicationFrame =
        anchor.closest<HTMLElement>('.application-frame');
      if (applicationFrame !== null) {
        if (window.innerWidth > 376) {
          setPopupPosition({ left: 150, top: 42 });
          return;
        }
        const frameBounds = applicationFrame.getBoundingClientRect();
        setPopupPosition({
          left: anchorBounds.left - frameBounds.left,
          top: anchorBounds.bottom - frameBounds.top,
        });
        return;
      }
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

  useLayoutEffect((): (() => void) | undefined => {
    if (!open) {
      openerRef.current?.focus();
      openerRef.current = null;
      return undefined;
    }

    const dismiss = (event: PointerEvent): void => {
      const target = event.target as Node;
      const anchor = anchorRef?.current ?? triggerRef.current;
      if (contentRef.current?.contains(target) || anchor?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    return (): void => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [anchorRef, open, setOpen]);

  const openAllSettings = (): void => {
    const opener = anchorRef?.current ?? triggerRef.current;
    setOpen(false);
    dispatchSettingsAction('appearance', () => onOpenAppearance(opener));
  };

  const popup = open
    ? createPortal(
        <div
          ref={contentRef}
          aria-label={t('settings.menu.label')}
          className={`${menu.surface} ${styles.anchored}`}
          data-viewport-popup="settings-menu"
          onKeyDown={(event): void => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
          }}
          role="menu"
          style={
            popupPosition === null
              ? { visibility: 'hidden' }
              : { left: popupPosition.left, top: popupPosition.top }
          }
        >
          <CompactSettingsContent
            defaultOpenMode={defaultOpenMode}
            fileSettings={fileSettings}
            markdownSettings={markdownSettings}
            mode={mode}
            onFileSettingsChange={(patch): void =>
              dispatchSettingsAction('autosave', () =>
                onFileSettingsChange?.(patch),
              )
            }
            onMarkdownSettingsChange={(patch): void =>
              dispatchSettingsAction(
                patch.formatOnSave === undefined
                  ? 'lint-on-save'
                  : 'format-on-save',
                () => onMarkdownSettingsChange?.(patch),
              )
            }
            onModeChange={(nextMode): void =>
              dispatchSettingsAction('appearance', () => onModeChange(nextMode))
            }
            onOpenAppearance={openAllSettings}
            onThemeChange={(nextTheme): void =>
              dispatchSettingsAction('appearance', () =>
                onThemeChange(nextTheme),
              )
            }
            theme={theme}
          />
        </div>,
        document.querySelector<HTMLElement>('.application-frame') ??
          document.body,
      )
    : null;

  return (
    <div className={styles.menu} data-settings-menu-root>
      {showTrigger ? (
        <MenuTrigger
          ref={triggerRef}
          data-settings-opener
          expanded={open}
          onClick={(event): void => {
            openerRef.current = event.currentTarget;
            if (onTrigger === undefined) {
              setOpen(!open);
            } else {
              onTrigger();
            }
          }}
          onOpen={(trigger): void => {
            openerRef.current = trigger;
            if (onTrigger === undefined) {
              setOpen(true);
            } else {
              onTrigger();
            }
          }}
        >
          {triggerLabel}
        </MenuTrigger>
      ) : null}
      {popup}
    </div>
  );
};

export default SettingsMenu;
