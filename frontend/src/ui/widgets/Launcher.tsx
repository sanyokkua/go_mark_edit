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
        <h1 id="launcher-title">
          {parityRoute ? 'GoMarkEdit' : t('launcher.title')}
        </h1>
        <p className={styles.message}>
          {parityRoute
            ? "Nothing is open. GoMarkEdit doesn't restore your last session."
            : recentFiles.length === 0
              ? t('launcher.firstRun')
              : t('launcher.chooseRecent')}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={(event): void => invoke(event, onNewDocument)}
          >
            {parityRoute ? 'New file' : t('action.new-file.label')}
          </button>
          <button
            type="button"
            onClick={(event): void => invoke(event, onOpenDocument)}
          >
            {parityRoute ? 'Open file…' : t('action.open-file.label')}
          </button>
          <button disabled title={t('action.unavailable')} type="button">
            {parityRoute ? 'Open folder…' : t('action.open-folder.label')}
          </button>
        </div>
        <div aria-label={t('file.recent.label')} className={styles.recent}>
          <h2>{parityRoute ? 'Recent' : t('file.recent.label')}</h2>
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
                    {parityRoute ? (
                      <small>
                        {path.includes('/archive/')
                          ? '~/Notes/archive'
                          : '~/Notes/projects'}
                      </small>
                    ) : null}
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
