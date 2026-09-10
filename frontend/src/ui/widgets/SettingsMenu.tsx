import { useCallback, useState, type RefObject } from 'react';

import { t } from '../../i18n';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import {
  getAction,
  getActionAvailability,
  type ActionId,
} from '../../logic/actions/actionRegistry';
import {
  currentPlatform,
  formatShortcut,
} from '../../logic/actions/shortcutRegistry';
import type {
  EditorSettings,
  FileSettings,
  MarkdownSettings,
} from '../../logic/adapter';
import type { AppearanceChoice, Theme } from '../../logic/theme/theme';
import MenuItem from '../components/MenuItem';
import Popup, {
  PopupGroupLabel,
  PopupSeparator,
  PopupTrigger,
} from '../components/Popup';
import popupStyles from '../components/Popup/Popup.module.css';
import Segmented, { type SegmentedOption } from '../primitives/Segmented';
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
  anchorElement?: HTMLElement | null;
  editorSettings?: EditorSettings;
  onEditorSettingsChange?: (patch: Partial<EditorSettings>) => void;
  fileSettings?: FileSettings;
  onFileSettingsChange?: (patch: Partial<FileSettings>) => void;
  markdownSettings?: MarkdownSettings;
  onMarkdownSettingsChange?: (patch: Partial<MarkdownSettings>) => void;
}

/*
 * The same derivation `ShellMenuRow.shortcutForMenuItem` uses, so every menu in
 * the shell advertises the accelerator from one source — the action registry.
 */
function settingsAccelerator(): string {
  const binding = getAction('settings').shortcut;
  return binding === undefined
    ? ''
    : formatShortcut(binding, currentPlatform());
}

const themeOptions: readonly SegmentedOption<Theme>[] = [
  { label: t('appearance.theme.glass'), value: 'glass' },
  { label: t('appearance.theme.material'), value: 'material' },
  { label: t('appearance.theme.minimal'), value: 'minimal' },
];

/**
 * The compact popup reproduces the binding mockup's `#m-settings` label text,
 * which differs from the full Settings dialog wording for the same choices.
 * Both come from the catalogue; neither is written into the component.
 */
const modeOptions: readonly SegmentedOption<AppearanceChoice>[] = [
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
      className={`${popupStyles.tick} ${selected ? '' : popupStyles.tickOff}`}
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
    getActionAvailability(id).kind !== 'available';

  /*
   * T155: two independent reasons a Settings row is not operable, and both must
   * be stated at every row.
   *
   * The registry is the authority on whether the action exists to be performed
   * at all — reading wiring alone is the defect above, and the Autosave row
   * carried no registry term whatsoever, so a future `laterDeferred` on
   * `autosave` would have shipped an operable toggle. But an available action
   * with no writer wired is equally inoperable, and drawing a control that
   * calls nothing is the defect T116 exists to remove. A row is operable only
   * when the registry allows it *and* something is there to receive the change.
   *
   * `writer` is omitted by the open-mode and Markdown-standard lists, which
   * genuinely have none: `AppearanceControls.persist` accepts only `mode` and
   * `theme` patches and passes `defaultOpenMode` through untouched, and nothing
   * anywhere writes `markdown.standard`. Those rows report a value chosen
   * elsewhere, which is what the shared Popup `.stateRow` modifier draws.
   */
  const rowUnavailable = (id: ActionId, writer?: unknown): boolean =>
    settingUnavailable(id) || writer === undefined;

  const availabilityOf = (id: ActionId): string =>
    getAction(id).availability.kind;

  const toggle = (
    actionId: ActionId,
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    disabled = false,
    /*
     * The MenuItem role matches the open-mode and Markdown rows above. Without
     * it these rows were plain divs inside `role="menu"`, so they were not
     * exposed as menu children at all and assistive technology never announced
     * them as part of the menu.
     */
  ): React.JSX.Element => (
    <MenuItem
      checked={checked}
      className={popupStyles.row}
      data-availability={availabilityOf(actionId)}
      data-settings-row={label}
      disabled={disabled}
      label={label}
      trailing={
        <label
          className={popupStyles.toggle}
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
      }
    />
  );

  return (
    <div className={styles.settingsBody} data-settings-content>
      <PopupGroupLabel>{t('settings.menu.theme')}</PopupGroupLabel>
      <Segmented
        ariaLabel={t('settings.menu.theme')}
        className={styles.swatches}
        onChange={onThemeChange}
        optionClassName={styles.swatch}
        options={themeOptions}
        value={theme}
      />
      <PopupGroupLabel>{t('appearance.mode.label')}</PopupGroupLabel>
      <Segmented
        ariaLabel={t('appearance.mode.label')}
        className={styles.options}
        onChange={onModeChange}
        optionClassName={popupStyles.row}
        options={modeOptions}
        value={mode}
      />
      <PopupSeparator />
      <PopupGroupLabel>{t('settings.openMode')}</PopupGroupLabel>
      {openModeOptions.map((option) => (
        <MenuItem
          className={`${popupStyles.row} ${popupStyles.stateRow}`}
          data-availability={availabilityOf('default-open-mode')}
          data-settings-row={option.label}
          disabled={rowUnavailable('default-open-mode')}
          key={option.value}
          label={option.label}
          trailing={tick(defaultOpenMode === option.value)}
        />
      ))}
      <PopupSeparator />
      <PopupGroupLabel>{t('settings.menu.markdown')}</PopupGroupLabel>
      {markdownStandardOptions.map((option) => (
        <MenuItem
          className={`${popupStyles.row} ${popupStyles.stateRow}`}
          data-availability={availabilityOf('markdown-standard')}
          data-settings-row={option.label}
          disabled={rowUnavailable('markdown-standard')}
          key={option.value}
          label={option.label}
          trailing={tick(
            (markdownSettings?.standard ?? 'gfm') === option.value,
          )}
        />
      ))}
      <PopupSeparator />
      {toggle(
        'autosave',
        saveToggleLabels.autosave,
        fileSettings?.autosave ?? true,
        (checked): void => onFileSettingsChange?.({ autosave: checked }),
        rowUnavailable('autosave', onFileSettingsChange),
      )}
      {toggle(
        'format-on-save',
        saveToggleLabels.formatOnSave,
        markdownSettings?.formatOnSave ?? false,
        (checked): void =>
          onMarkdownSettingsChange?.({ formatOnSave: checked }),
        rowUnavailable('format-on-save', onMarkdownSettingsChange),
      )}
      {toggle(
        'lint-on-save',
        saveToggleLabels.lintOnSave,
        markdownSettings?.lintOnSave ?? true,
        (checked): void => onMarkdownSettingsChange?.({ lintOnSave: checked }),
        rowUnavailable('lint-on-save', onMarkdownSettingsChange),
      )}
      <PopupSeparator />
      <MenuItem
        accelerator={settingsAccelerator()}
        label={t('settings.menu.allSettings')}
        onSelect={onOpenAppearance}
      />
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
  anchorElement,
  fileSettings,
  onFileSettingsChange,
  markdownSettings,
  onMarkdownSettingsChange,
}: SettingsMenuProps): React.JSX.Element => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [triggerElement, setTriggerElement] =
    useState<HTMLButtonElement | null>(null);
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

  const openAllSettings = (): void => {
    const opener = anchorElement ?? anchorRef?.current ?? triggerElement;
    setOpen(false);
    dispatchSettingsAction('appearance', () => onOpenAppearance(opener));
  };

  const anchor = { trigger: anchorElement ?? triggerElement };

  return (
    <div className={styles.menu} data-settings-menu-root>
      {showTrigger ? (
        <PopupTrigger
          ref={setTriggerElement}
          data-settings-opener
          expanded={open}
          onClick={(): void => {
            if (onTrigger === undefined) {
              setOpen(!open);
            } else {
              onTrigger();
            }
          }}
          onOpen={(): void => {
            if (onTrigger === undefined) {
              setOpen(true);
            } else {
              onTrigger();
            }
          }}
        >
          {triggerLabel}
        </PopupTrigger>
      ) : null}
      <Popup
        anchor={anchor}
        aria-label={t('settings.menu.label')}
        data-viewport-popup="settings-menu"
        initialFocus="first"
        open={open}
        returnFocusTo={anchor.trigger}
        role="menu"
        size="wide"
        onOpenChange={setOpen}
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
            dispatchSettingsAction('appearance', () => onThemeChange(nextTheme))
          }
          theme={theme}
        />
      </Popup>
    </div>
  );
};

export default SettingsMenu;
