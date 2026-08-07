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
import type { EditorSettings, MarkdownSettings } from '../../logic/adapter';
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
  editorSettings?: EditorSettings;
  onEditorSettingsChange?: (patch: Partial<EditorSettings>) => void;
  markdownSettings?: MarkdownSettings;
  onMarkdownSettingsChange?: (patch: Partial<MarkdownSettings>) => void;
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

const markdownStandardOptions = [
  { label: t('settings.markdown.minimal'), value: 'minimal' },
  { label: t('settings.markdown.gfm'), value: 'gfm' },
  { label: t('settings.markdown.full'), value: 'full' },
] as const;

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
  editorSettings,
  onEditorSettingsChange,
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

  const popup = open
    ? createPortal(
        <div
          ref={contentRef}
          aria-label={t('settings.menu.label')}
          className={styles.content}
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
          <Segmented
            aria-label={t('appearance.theme.label')}
            options={themeOptions}
            value={theme}
            onValueChange={(nextTheme): void =>
              dispatchSettingsAction('appearance', () =>
                onThemeChange(nextTheme),
              )
            }
          />
          <Segmented
            aria-label={t('appearance.mode.label')}
            options={modeOptions}
            value={mode}
            onValueChange={(nextMode): void =>
              dispatchSettingsAction('appearance', () => onModeChange(nextMode))
            }
          />
          <fieldset className={styles.group}>
            <legend>{t('settings.menu.general')}</legend>
            <span className={styles.settingLabel}>
              {t(getAction('default-open-mode').labelKey)}
            </span>
            {(['reading', 'editor'] as const).map((mode) => (
              <button
                className={styles.item}
                disabled
                key={mode}
                role="menuitem"
                type="button"
              >
                {t(`settings.openMode.${mode}`)}
              </button>
            ))}
          </fieldset>
          <fieldset className={styles.group}>
            <legend>{t('settings.menu.markdown')}</legend>
            <button
              aria-label={t('settings.markdown.standard')}
              className={styles.item}
              disabled
              role="menuitem"
              type="button"
            >
              {t(getAction('markdown-standard').labelKey)}:{' '}
              {markdownStandardOptions.find(
                (option) => option.value === markdownSettings?.standard,
              )?.label ?? t('settings.markdown.gfm')}{' '}
              (
              {markdownStandardOptions
                .map((option) => option.label)
                .join(' · ')}
              )
            </button>
            {markdownSettings === undefined ||
            onMarkdownSettingsChange === undefined ? null : (
              <>
                <label className={styles.selectLabel}>
                  <span>{t('settings.markdown.bullet')}</span>
                  <select
                    aria-label={t('settings.markdown.bullet')}
                    value={markdownSettings.bulletMarker}
                    onChange={(event): void =>
                      dispatchSettingsAction('editor-settings', () =>
                        onMarkdownSettingsChange({
                          bulletMarker: event.target.value,
                        }),
                      )
                    }
                  >
                    <option value="-">-</option>
                    <option value="*">*</option>
                    <option value="+">+</option>
                  </select>
                </label>
                <label className={styles.selectLabel}>
                  <span>{t('settings.markdown.emphasis')}</span>
                  <select
                    aria-label={t('settings.markdown.emphasis')}
                    value={markdownSettings.emphasisMarker}
                    onChange={(event): void =>
                      dispatchSettingsAction('editor-settings', () =>
                        onMarkdownSettingsChange({
                          emphasisMarker: event.target.value,
                        }),
                      )
                    }
                  >
                    <option value="*">*</option>
                    <option value="_">_</option>
                  </select>
                </label>
                <label className={styles.selectLabel}>
                  <span>{t('settings.markdown.heading')}</span>
                  <select
                    aria-label={t('settings.markdown.heading')}
                    value={markdownSettings.headingStyle}
                    onChange={(event): void =>
                      dispatchSettingsAction('editor-settings', () =>
                        onMarkdownSettingsChange({
                          headingStyle: event.target.value,
                        }),
                      )
                    }
                  >
                    <option value="atx">{t('settings.markdown.atx')}</option>
                  </select>
                </label>
              </>
            )}
          </fieldset>
          <fieldset className={styles.group}>
            <legend>{t('settings.menu.save')}</legend>
            {(['autosave', 'format-on-save', 'lint-on-save'] as const).map(
              (id: ActionId) => (
                <button
                  className={styles.item}
                  disabled
                  role="menuitem"
                  key={id}
                  type="button"
                >
                  {t(getAction(id).labelKey)}
                </button>
              ),
            )}
          </fieldset>
          {editorSettings !== undefined &&
          onEditorSettingsChange !== undefined ? (
            <fieldset className={styles.group}>
              <legend>{t('settings.menu.editor')}</legend>
              <label className={styles.checkbox}>
                <input
                  checked={editorSettings.lineNumbers}
                  type="checkbox"
                  onChange={(event): void =>
                    dispatchSettingsAction('editor-settings', () =>
                      onEditorSettingsChange({
                        lineNumbers: event.target.checked,
                      }),
                    )
                  }
                />
                {t('settings.editor.lineNumbers')}
              </label>
              <label className={styles.checkbox}>
                <input
                  checked={editorSettings.wordWrap}
                  type="checkbox"
                  onChange={(event): void =>
                    dispatchSettingsAction('editor-settings', () =>
                      onEditorSettingsChange({
                        wordWrap: event.target.checked,
                      }),
                    )
                  }
                />
                {t('settings.editor.wordWrap')}
              </label>
              <label className={styles.selectLabel}>
                <span>{t('settings.editor.fontSize')}</span>
                <select
                  aria-label={t('settings.editor.fontSize')}
                  value={editorSettings.fontSize}
                  onChange={(event): void =>
                    dispatchSettingsAction('editor-settings', () =>
                      onEditorSettingsChange({
                        fontSize: Number(
                          event.target.value,
                        ) as EditorSettings['fontSize'],
                      }),
                    )
                  }
                >
                  {[13, 14, 16].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          ) : null}
          <button
            className={styles.item}
            disabled
            role="menuitem"
            type="button"
          >
            {t(getAction('all-settings').labelKey)}
          </button>
          <button
            className={styles.item}
            role="menuitem"
            type="button"
            onClick={(): void => {
              const opener = anchorRef?.current ?? triggerRef.current;
              dispatchSettingsAction('appearance', () => {
                setOpen(false);
                onOpenAppearance(opener);
              });
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
          onClick={(event): void => {
            openerRef.current = event.currentTarget;
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
