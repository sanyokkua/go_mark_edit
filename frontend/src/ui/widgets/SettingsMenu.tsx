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
import { getAction, type ActionId } from '../../logic/actions/actionRegistry';
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

  /*
   * Availability comes from the canonical registry, not from whether a handler
   * happened to be wired. `format-on-save` and `lint-on-save` are `laterDeferred`
   * there, but this menu computed availability from `onMarkdownSettingsChange
   * === undefined` alone — and AppearanceControls does supply that handler, so
   * both rows shipped enabled while the registry said deferred.
   */
  const settingUnavailable = (id: ActionId): boolean =>
    getAction(id).availability.kind === 'deferred';

  const toggle = (
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    disabled = false,
    /*
     * `role="menuitem"` matches the open-mode and Markdown rows above. Without
     * it these rows were plain divs inside `role="menu"`, so they were not
     * exposed as menu children at all and assistive technology never announced
     * them as part of the menu.
     */
  ): React.JSX.Element => (
    <div
      aria-disabled={disabled}
      className={menu.row}
      data-settings-row={label}
      role="menuitem"
    >
      <span>{label}</span>
      {/*
        A label, not a span. The real checkbox is 1px and transparent, so the
        visible switch is what the pointer lands on — and `.toggle` declares
        `cursor: pointer`, promising it is clickable. As a span it was inert:
        the click hit the switch, never reached the input, and nothing changed.
      */}
      <label
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
      </label>
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
        settingUnavailable('format-on-save') ||
          onMarkdownSettingsChange === undefined,
      )}
      {toggle(
        saveToggleLabels.lintOnSave,
        markdownSettings?.lintOnSave ?? true,
        (checked): void => onMarkdownSettingsChange?.({ lintOnSave: checked }),
        settingUnavailable('lint-on-save') ||
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
    /*
     * Set only when the popup would otherwise run past the bottom of the
     * window. Leaving it undefined is not a detail: applying a height bound
     * makes the surface a scroll container, and Chromium drops LCD subpixel
     * antialiasing inside one, which costs ~332 deterministic pixels against
     * the immutable reference. At the 720px parity height the popup fits, so
     * this stays undefined there and the captures are unaffected.
     */
    maxBlockSize?: number;
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
      /*
       * FR-FT-052: a popup must stay at least 8 logical pixels inside the
       * viewport. The window minimum is 375x480 (`main.go:104-105`) and this
       * popup's own content is taller than 480, so at the smallest supported
       * size the save toggles and the `All settings…` row that opens the full
       * dialog fell off the bottom with no page scroll to reach them. Bound the
       * height to what is actually available instead of moving the surface: the
       * frame-relative position is the binding's (`top: 42`), and shifting it
       * would trade one defect for a parity failure.
       */
      const boundToHeight = (available: number): number | undefined =>
        content.scrollHeight > available ? available : undefined;
      if (applicationFrame !== null) {
        const frameBounds = applicationFrame.getBoundingClientRect();
        /*
         * Inside a frame the bound is the FRAME's height, not the browser
         * window's. `.application-frame` is the application window; the
         * parity harness draws it inset inside a taller page, so measuring
         * against `window.innerHeight` there would clamp a popup that fits its
         * own window perfectly well — and a clamp creates a scroll container,
         * which costs ~332 antialiasing pixels against the immutable
         * reference. Measured: at the 720px parity height the frame is 619px
         * tall, so 42 + 549 fits with room to spare and nothing is applied.
         */
        const inFrame = (top: number): number | undefined =>
          boundToHeight(frameBounds.height - margin - top);
        if (window.innerWidth > 376) {
          setPopupPosition({ left: 150, top: 42, maxBlockSize: inFrame(42) });
          return;
        }
        const narrowTop = anchorBounds.bottom - frameBounds.top;
        setPopupPosition({
          left: anchorBounds.left - frameBounds.left,
          top: narrowTop,
          maxBlockSize: inFrame(narrowTop),
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
      /* No frame: the browser viewport is the window. */
      setPopupPosition({
        left,
        top,
        maxBlockSize: boundToHeight(window.innerHeight - margin - top),
      });
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
              : {
                  left: popupPosition.left,
                  top: popupPosition.top,
                  ...(popupPosition.maxBlockSize === undefined
                    ? {}
                    : {
                        maxBlockSize: popupPosition.maxBlockSize,
                        overflowY: 'auto' as const,
                      }),
                }
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
