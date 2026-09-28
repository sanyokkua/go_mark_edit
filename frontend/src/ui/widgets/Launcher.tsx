import type { MouseEvent } from 'react';

import { t } from '../../i18n';
import { dispatchAction } from '../../logic/actions/actionDispatcher';
import type { RecentItem } from '../../logic/store/appModelTypes';
import Button from '../primitives/Button';
import Icon from '../primitives/Icon';
import styles from './Launcher.module.css';

export interface LauncherProps {
    recentItems?: readonly RecentItem[];
    onNewDocument?: () => Promise<unknown> | unknown;
    onOpenDocument?: () => Promise<unknown> | unknown;
    onOpenFolder?: () => Promise<unknown> | unknown;
    onOpenRecentItem?: (item: RecentItem) => Promise<unknown> | unknown;
}

function safeSegment(value: string): string {
    const cleaned = value.replace(/[\p{Cc}\p{Cf}]/gu, '');
    return cleaned.length === 0 ? t('editor.untitled') : cleaned;
}

export function safeRecentLabel(path: string): string {
    const normalized = path.replaceAll('\\', '/');
    return safeSegment(normalized.split('/').pop() ?? normalized);
}

function invoke(event: MouseEvent<HTMLButtonElement>, callback: (() => Promise<unknown> | unknown) | undefined): void {
    event.preventDefault();
    void callback?.();
}

const Launcher: React.FC<LauncherProps> = ({
    recentItems = [],
    onNewDocument,
    onOpenDocument,
    onOpenFolder,
    onOpenRecentItem,
}: LauncherProps): React.JSX.Element => {
    return (
        <section aria-labelledby="launcher-title" className={styles.launcher} data-testid="document-launcher">
            <div className={styles.panel}>
                <h1 id="launcher-title">{t('launcher.title')}</h1>
                <p className={styles.message}>
                    {recentItems.length === 0 ? t('launcher.firstRun') : t('launcher.chooseRecent')}
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
                    <Button variant="secondary" onClick={(event): void => invoke(event, onOpenDocument)}>
                        {t('action.open-file.label')}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={(event): void => {
                            event.preventDefault();
                            void dispatchAction('open-folder', { applicationFocused: true, invoke: onOpenFolder });
                        }}
                    >
                        {t('action.open-folder.label')}
                    </Button>
                </div>
                <div aria-label={t('file.recent.label')} className={styles.recent}>
                    <h2>{t('file.recent.label')}</h2>
                    {recentItems.length === 0 ? (
                        <p className={styles.empty}>{t('launcher.noRecent')}</p>
                    ) : (
                        <ul>
                            {recentItems.slice(0, 10).map((item) => (
                                <li key={item.path}>
                                    <Button
                                        title={item.path}
                                        variant="quiet"
                                        onClick={(event): void => {
                                            event.preventDefault();
                                            void onOpenRecentItem?.(item);
                                        }}
                                    >
                                        <Icon aria-hidden="true" name={item.kind} />
                                        {safeRecentLabel(item.path)}
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
