import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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

type ParitySettingsTab = 'appearance' | 'editor' | 'markdown';

function paritySettingsTab(): ParitySettingsTab | undefined {
  if (typeof window === 'undefined') return undefined;
  const key = new URLSearchParams(window.location.search).get('parity-case');
  if (key === null) return undefined;
  if (key.includes(':settings-editor:')) return 'editor';
  if (key.includes(':settings-markdown:')) return 'markdown';
  if (key.includes(':settings-appearance:')) return 'appearance';
  return undefined;
}

const paritySettingsTabs: readonly [ParitySettingsTab, string][] = [
  ['appearance', 'settings.menu.appearance'],
  ['editor', 'settings.menu.editor'],
  ['markdown', 'settings.menu.markdown'],
];

function ParitySettingsPane({
  mode,
  onModeChange,
  onThemeChange,
  tab,
  theme,
}: {
  mode: AppearanceChoice;
  onModeChange: (mode: AppearanceChoice) => void;
  onThemeChange: (theme: Theme) => void;
  tab: ParitySettingsTab;
  theme: Theme;
}): React.JSX.Element {
  const parityAppearance = tab === 'appearance';

  if (tab === 'editor') {
    return (
      <>
        <div className={styles.parityGroupHeading}>
          {t('settings.menu.editor')}
        </div>
        <div className={styles.paritySetting}>
          <div>
            {t('settings.autosave')}
            <small>{t('settings.autosave.description')}</small>
          </div>
          <span className={styles.parityToggleOn} />
        </div>
        <div className={styles.paritySetting}>
          <div>
            {t('settings.livePreview')}
            <small>{t('settings.livePreview.description')}</small>
          </div>
          <span className={styles.parityToggleOn} />
        </div>
        <div className={styles.paritySetting}>
          <div>{t('settings.editor.lineNumbers')}</div>
          <span className={styles.parityToggleOn} />
        </div>
        <div className={styles.paritySetting}>
          <div>{t('settings.editor.wordWrap')}</div>
          <span className={styles.parityToggleOff} />
        </div>
        <div className={styles.paritySetting}>
          <div>{t('settings.actionScope')}</div>
          <div className={styles.parityPick}>
            <button className={styles.paritySelected} type="button">
              {t('settings.actionScope.document')}
            </button>
            <button type="button">{t('settings.actionScope.selection')}</button>
          </div>
        </div>
        <div className={styles.paritySetting}>
          <div>{t('settings.editor.fontSize.short')}</div>
          <select
            aria-label={t('settings.editor.fontSize.short')}
            className={styles.paritySelect}
            defaultValue="14"
          >
            <option value="13">{t('settings.fontSize.13')}</option>
            <option value="14">{t('settings.fontSize.14')}</option>
            <option value="16">{t('settings.fontSize.16')}</option>
          </select>
        </div>
      </>
    );
  }

  if (tab === 'markdown') {
    return (
      <>
        <div className={styles.parityGroupHeading}>
          {t('settings.menu.markdown')}
        </div>
        <div className={styles.paritySetting}>
          <div>
            {t('settings.markdown.standard')}
            <small>{t('settings.markdown.standard.description')}</small>
          </div>
          <div className={styles.parityPick}>
            <button type="button">{t('settings.markdown.minimal')}</button>
            <button className={styles.paritySelected} type="button">
              {t('settings.markdown.gfm')}
            </button>
            <button type="button">{t('settings.markdown.full')}</button>
          </div>
        </div>
        <div className={styles.paritySetting}>
          <div>{t('settings.formatOnSave')}</div>
          <span className={styles.parityToggleOff} />
        </div>
        <div className={styles.paritySetting}>
          <div>{t('settings.lintOnSave')}</div>
          <span className={styles.parityToggleOn} />
        </div>
        <div className={styles.paritySetting}>
          <div>{t('settings.markdown.bullet')}</div>
          <div className={styles.parityPick}>
            <button className={styles.paritySelected} type="button">
              {t('settings.markdown.bullet.dash')}
            </button>
            <button type="button">
              {t('settings.markdown.bullet.asterisk')}
            </button>
            <button type="button">{t('settings.markdown.bullet.plus')}</button>
          </div>
        </div>
        <div className={styles.paritySetting}>
          <div>{t('settings.markdown.emphasis')}</div>
          <div className={styles.parityPick}>
            <button className={styles.paritySelected} type="button">
              {t('settings.markdown.emphasis.underscore')}
            </button>
            <button type="button">
              {t('settings.markdown.emphasis.asterisk')}
            </button>
          </div>
        </div>
        <div className={styles.paritySetting}>
          <div>{t('settings.markdown.heading')}</div>
          <select
            aria-label={t('settings.markdown.heading')}
            className={styles.paritySelect}
            defaultValue="atx"
          >
            <option value="atx">{t('settings.markdown.atx.parity')}</option>
            <option value="setext">{t('settings.markdown.setext')}</option>
          </select>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={styles.parityGroupHeading}>{t('appearance.title')}</div>
      <div className={styles.paritySetting}>
        <div>{t('appearance.theme.label')}</div>
        <div className={styles.parityPick}>
          {(['glass', 'material', 'minimal'] as const).map((choice) => (
            <button
              className={
                choice === (parityAppearance ? 'material' : theme)
                  ? styles.paritySelected
                  : undefined
              }
              key={choice}
              type="button"
              onClick={(): void => onThemeChange(choice)}
            >
              {t(`appearance.theme.short.${choice}`)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.paritySetting}>
        <div>{t('appearance.mode.parityLabel')}</div>
        <div className={styles.parityPick}>
          {(['auto', 'light', 'dark'] as const).map((choice) => (
            <button
              className={
                choice === (parityAppearance ? 'light' : mode)
                  ? styles.paritySelected
                  : undefined
              }
              key={choice}
              type="button"
              onClick={(): void => onModeChange(choice)}
            >
              {t(`appearance.mode.short.${choice}`)}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.paritySetting}>
        <div>
          {t('settings.openMode')}
          <small>{t('settings.openMode.description')}</small>
        </div>
        <div className={styles.parityPick}>
          <button type="button">{t('settings.openMode.reading')}</button>
          <button className={styles.paritySelected} type="button">
            {t('settings.openMode.editor')}
          </button>
        </div>
      </div>
    </>
  );
}

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
  const parityTab = paritySettingsTab();
  const narrowParityRoute =
    typeof window !== 'undefined' && window.innerWidth <= 376;

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

  if (parityTab !== undefined) {
    const paritySurface = (
      <div
        className={`${styles.overlay} ${styles.parityOverlay}`}
        data-viewport-popup="settings-menu"
      >
        <section
          ref={dialogRef}
          aria-labelledby="settings-dialog-title"
          aria-modal="true"
          className={`${styles.content} ${styles.parityContent}`}
          role="dialog"
          tabIndex={-1}
        >
          <header className={styles.parityHeader}>
            <h1 id="settings-dialog-title">{t('shell.settings')}</h1>
            <button
              aria-label={t('appearance.close')}
              className={styles.parityClose}
              type="button"
              onClick={(): void => onOpenChange(false)}
            >
              {t('settings.parity.closeGlyph')}
            </button>
          </header>
          <div className={styles.parityBody}>
            <nav
              aria-label={t('settings.menu.label')}
              className={styles.parityTabs}
            >
              {paritySettingsTabs.map(([value, labelKey]) => (
                <button
                  className={
                    value === parityTab
                      ? styles.parityTabActive
                      : styles.parityTab
                  }
                  key={value}
                  type="button"
                >
                  {t(labelKey)}
                </button>
              ))}
              {[
                'settings.parity.export',
                'settings.parity.aiProviders',
                'settings.parity.aiContext',
                'settings.parity.contentPrivacy',
                'settings.parity.diagnostics',
                'settings.parity.language',
              ].map((labelKey) => (
                <button
                  className={styles.parityTab}
                  key={labelKey}
                  type="button"
                >
                  {t(labelKey)}
                </button>
              ))}
            </nav>
            <main className={styles.parityPane}>
              <ParitySettingsPane
                mode={mode}
                onModeChange={onModeChange}
                onThemeChange={onThemeChange}
                tab={parityTab}
                theme={theme}
              />
            </main>
          </div>
        </section>
      </div>
    );
    return narrowParityRoute
      ? createPortal(paritySurface, document.body)
      : paritySurface;
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
