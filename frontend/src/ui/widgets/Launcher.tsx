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
}: LauncherProps): React.JSX.Element => (
  <section
    aria-labelledby="launcher-title"
    className={styles.launcher}
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
        <button
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

export default Launcher;
