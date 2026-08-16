import type { MouseEvent } from 'react';

import { t } from '../../i18n';
import styles from './Launcher.module.css';

export interface LauncherProps {
  recentFiles?: readonly string[];
  onNewDocument?: () => Promise<unknown> | unknown;
  onOpenDocument?: () => Promise<unknown> | unknown;
  onOpenRecentFile?: (path: string) => Promise<unknown> | unknown;
}

function safeSegment(value: string): string {
  const cleaned = value.replace(/[\p{Cc}\p{Cf}]/gu, '');
  return cleaned.length === 0 ? t('editor.untitled') : cleaned;
}

export function safeRecentLabel(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  return safeSegment(normalized.split('/').pop() ?? normalized);
}

function invoke(
  event: MouseEvent<HTMLButtonElement>,
  callback: (() => Promise<unknown> | unknown) | undefined,
): void {
  event.preventDefault();
  void callback?.();
}

const Launcher: React.FC<LauncherProps> = ({
  recentFiles = [],
  onNewDocument,
  onOpenDocument,
  onOpenRecentFile,
}: LauncherProps): React.JSX.Element => {
  /*
   * The parity route selects the reference-height variant of the panel and
   * nothing else. It used to select a whole second set of strings as well —
   * raw English copied out of the mockup — which FR-FT-047 forbids, because
   * every user-visible string must come from the translation catalogue. Those
   * strings existed for the whole-screen comparison withdrawn on 2026-08-14;
   * the launcher is not one of the 14 pixel-compared component keys, so
   * nothing measured them.
   */
  const parityRoute =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('parity-case');
  return (
    <section
      aria-labelledby="launcher-title"
      className={`${styles.launcher} ${parityRoute ? styles.parityLauncher : ''}`}
      data-testid="document-launcher"
    >
      <div className={styles.panel}>
        <h1 id="launcher-title">{t('launcher.title')}</h1>
        <p className={styles.message}>
          {recentFiles.length === 0
            ? t('launcher.firstRun')
            : t('launcher.chooseRecent')}
        </p>
        <div className={styles.actions}>
          {/*
           * FR-FT-037's focus chain ends here: "…otherwise the tab strip's New
           * control, otherwise the launcher's New control". The tab strip is
           * unmounted by the time that step is reached, so the fallback cannot
           * hold a ref to this button and finds it by attribute instead —
           * mirroring `data-tab-new` on the strip's own New control.
           */}
          <button
            data-launcher-new="true"
            type="button"
            onClick={(event): void => invoke(event, onNewDocument)}
          >
            {t('action.new-file.label')}
          </button>
          <button
            type="button"
            onClick={(event): void => invoke(event, onOpenDocument)}
          >
            {t('action.open-file.label')}
          </button>
          <button disabled title={t('action.unavailable')} type="button">
            {t('action.open-folder.label')}
          </button>
        </div>
        <div aria-label={t('file.recent.label')} className={styles.recent}>
          <h2>{t('file.recent.label')}</h2>
          {recentFiles.length === 0 ? (
            <p className={styles.empty}>{t('launcher.noRecent')}</p>
          ) : (
            <ul>
              {recentFiles.slice(0, 6).map((path) => (
                <li key={path}>
                  <button
                    title={safeRecentLabel(path)}
                    type="button"
                    onClick={(event): void => {
                      event.preventDefault();
                      void onOpenRecentFile?.(path);
                    }}
                  >
                    {safeRecentLabel(path)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default Launcher;
