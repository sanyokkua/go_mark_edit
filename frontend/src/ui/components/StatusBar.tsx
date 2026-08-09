import { useState } from 'react';

import type { EditorPosition } from './CodeEditor';
import type {
  SaveStatus,
  ViewArrangement,
} from '../../logic/store/appModelTypes';
import { formatNumber, t } from '../../i18n';
import styles from './StatusBar.module.css';

export interface StatusBarProps {
  arrangement: ViewArrangement;
  cursor: EditorPosition;
  encoding: string;
  lineEnding: string;
  status?: SaveStatus;
  writeInFlight?: boolean;
  wordCount: number;
  autosave?: boolean;
  readOnly?: boolean;
}

function translationKey(prefix: string, value: string): string {
  return `status.${prefix}.${value.toLowerCase()}`;
}

const StatusBar: React.FC<StatusBarProps> = ({
  arrangement,
  cursor,
  encoding,
  lineEnding,
  status = 'not-saved',
  writeInFlight = false,
  wordCount,
  autosave = false,
  readOnly = status === 'read-only',
}: StatusBarProps): React.JSX.Element => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const saveStatus = t(translationKey('saveStatus', status));
  const encodingLabel = t(translationKey('encoding', encoding));
  const lineEndingLabel = t(translationKey('lineEnding', lineEnding));
  return (
    <footer aria-label={t('status.ariaLabel')} className={styles.statusBar}>
      <span className={styles.responsiveItem}>
        {t('status.cursor', {
          column: cursor.column,
          line: cursor.lineNumber,
        })}
      </span>
      <span className={styles.responsiveItem}>
        {t('status.words', { count: formatNumber(wordCount) })}
      </span>
      <span className={styles.spacer} />
      <span className={styles.responsiveItem}>{encodingLabel}</span>
      <span className={styles.responsiveItem}>{lineEndingLabel}</span>
      <span
        className={styles.responsiveItem}
        data-write-in-flight={writeInFlight || undefined}
      >
        {saveStatus}
        {writeInFlight ? ` · ${t('status.writeInFlight')}` : ''}
      </span>
      <span className={styles.responsiveItem}>
        {t(translationKey('arrangement', arrangement))}
      </span>
      <button
        aria-controls="document-status-details"
        aria-expanded={detailsOpen}
        className={styles.detailsTrigger}
        type="button"
        onClick={(): void => setDetailsOpen((open) => !open)}
      >
        {t('status.details')}
      </button>
      {detailsOpen ? (
        <div
          aria-label={t('status.details')}
          className={styles.details}
          id="document-status-details"
          role="region"
        >
          <span>{encodingLabel}</span>
          <span>{lineEndingLabel}</span>
          <span>{saveStatus}</span>
          <span>
            {t(autosave ? 'status.autosave.on' : 'status.autosave.off')}
          </span>
          {readOnly ? <span>{t('status.readOnlyWarning')}</span> : null}
        </div>
      ) : null}
    </footer>
  );
};

export default StatusBar;
