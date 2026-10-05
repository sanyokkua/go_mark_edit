import { formatNumber, t } from '../../../i18n';
import type { ProblemsSummary } from '../../../logic/operations/problemsSummary';
import type { LintFinding } from '../../../logic/tidy/protocol';
import Pane from '../../components/Pane';
import Banner from '../../primitives/Banner';
import Button from '../../primitives/Button';
import Icon from '../../primitives/Icon';
import styles from './ProblemsPanel.module.css';

export interface ProblemsPanelProps {
    summary: ProblemsSummary | null;
    onActivate: (finding: LintFinding) => void;
    onClose: () => void;
}

const MAX_ROWS = 10000;

export default function ProblemsPanel({ summary, onActivate, onClose }: ProblemsPanelProps): React.JSX.Element {
    const findings =
        summary?.findings
            .slice()
            .sort((a, b) => a.startLine - b.startLine || a.startColumn - b.startColumn)
            .slice(0, MAX_ROWS) ?? [];
    const overflow = Math.max(0, (summary?.total ?? 0) - MAX_ROWS);
    const title = t('problems.title');

    return (
        <Pane
            ariaLabel={title}
            identity="problems"
            header={{
                leading: title,
                trailing: (
                    <Button aria-label={t('problems.close')} variant="quiet" onClick={onClose}>
                        <Icon name="close" />
                    </Button>
                ),
            }}
            accessory={
                summary?.stale ? (
                    <Banner
                        notification={{
                            id: 0,
                            kind: 'warning',
                            title: t('problems.staleTitle'),
                            message: t('problems.stale'),
                            actions: [],
                        }}
                    />
                ) : undefined
            }
            body={
                <div className={styles.body}>
                    {summary === null ? (
                        <p>{t('problems.notRun')}</p>
                    ) : summary.total === 0 ? (
                        <p>{t('problems.empty')}</p>
                    ) : (
                        <>
                            <div className={styles.list}>
                                {findings.map((finding, index) => {
                                    const position = t('problems.position', {
                                        line: finding.startLine,
                                        column: finding.startColumn,
                                    });
                                    return (
                                        <Button
                                            className={styles.row}
                                            data-problem-row="true"
                                            key={`${finding.rule}-${finding.startLine}-${finding.startColumn}-${index}`}
                                            variant="quiet"
                                            onClick={(): void => onActivate(finding)}
                                            onKeyDown={(event): void => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    onActivate(finding);
                                                }
                                            }}
                                        >
                                            <Icon name={finding.severity === 'error' ? 'caution' : 'warning'} />
                                            <span className={styles.severity}>
                                                {t(`problems.severity.${finding.severity}`)}
                                            </span>
                                            <span>{position}</span>
                                            <span className={styles.message}>
                                                {t(finding.message.key, finding.message.args)}
                                            </span>
                                            <span className={styles.rule}>{t(`lint.rule.${finding.rule}.label`)}</span>
                                        </Button>
                                    );
                                })}
                            </div>
                            {overflow > 0 ? (
                                <p>{t('problems.moreNotShown', { count: formatNumber(overflow) })}</p>
                            ) : null}
                        </>
                    )}
                </div>
            }
        />
    );
}
