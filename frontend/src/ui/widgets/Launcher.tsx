import type { MouseEvent } from 'react';

import { t } from '../../i18n';
import Button from '../primitives/Button';
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
  return (
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
          {/*
           * The focus chain ends here: "…otherwise the tab strip's New
           * control, otherwise the launcher's New control". The tab strip is
           * unmounted by the time that step is reached, so the fallback cannot
           * hold a ref to this button and finds it by attribute instead —
           * mirroring `data-tab-new` on the strip's own New control.
           */}
          <Button
            data-launcher-new="true"
            variant="primary"
            onClick={(event): void => invoke(event, onNewDocument)}
          >
            {t('action.new-file.label')}
          </Button>
          <Button
            variant="secondary"
            onClick={(event): void => invoke(event, onOpenDocument)}
          >
            {t('action.open-file.label')}
          </Button>
          <Button disabled title={t('action.unavailable')} variant="secondary">
            {t('action.open-folder.label')}
          </Button>
        </div>
        <div aria-label={t('file.recent.label')} className={styles.recent}>
          <h2>{t('file.recent.label')}</h2>
          {recentFiles.length === 0 ? (
            <p className={styles.empty}>{t('launcher.noRecent')}</p>
          ) : (
            <ul>
              {recentFiles.slice(0, 6).map((path) => (
                <li key={path}>
                  <Button
                    title={safeRecentLabel(path)}
                    variant="quiet"
                    onClick={(event): void => {
                      event.preventDefault();
                      void onOpenRecentFile?.(path);
                    }}
                  >
                    {safeRecentLabel(path)}
                  </Button>
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
