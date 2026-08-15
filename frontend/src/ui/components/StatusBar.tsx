import { useState } from 'react';

import type { EditorPosition } from './CodeEditor';
import type { SaveStatus } from '../../logic/store/appModelTypes';
import { formatNumber, t } from '../../i18n';
import { readOnlyReason } from './readOnlyReason';
import styles from './StatusBar.module.css';

export interface StatusBarProps {
  cursor: EditorPosition;
  encoding: string;
  lineEnding: string;
  status?: SaveStatus;
  writeInFlight?: boolean;
  wordCount: number;
  autosave?: boolean;
  readOnly?: boolean;
  /*
   * The backend's read capability, not the save status. `save_status.go:28-31`
   * collapses every non-writable capability onto `read-only`, so the status
   * cannot say *why* a document is read-only and this is the only field that
   * can (T108, FR-FT-005).
   */
  capability?: string;
  markdownStandard?: string;
}

function translationKey(prefix: string, value: string): string {
  return `status.${prefix}.${value.toLowerCase()}`;
}

const StatusBar: React.FC<StatusBarProps> = ({
  cursor,
  encoding,
  lineEnding,
  status = 'not-saved',
  writeInFlight = false,
  wordCount,
  autosave = false,
  readOnly = status === 'read-only',
  capability,
  markdownStandard = 'gfm',
}: StatusBarProps): React.JSX.Element => {
  const readOnlyDetail = readOnlyReason(capability);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const saveStatus = t(translationKey('saveStatus', status));
  const encodingLabel = t(translationKey('encoding', encoding));
  const lineEndingLabel = t(translationKey('lineEnding', lineEnding));
  return (
    <footer
      aria-label={t('status.ariaLabel')}
      className={styles.statusBar}
      data-status-state={status}
      role="status"
    >
      {/* Binding source: mockup.html `.statusbar` (:838) — the row opens with
          the document standard behind an accent dot (`.dotk`, :385), then the
          caret position and the word count. */}
      <span className={styles.responsiveItem} data-status-item="standard-kind">
        <span aria-hidden="true" className={styles.dot} />
        {t('status.markdown', {
          standard: t(translationKey('markdownStandard', markdownStandard)),
        })}
      </span>
      <span className={styles.responsiveItem} data-status-item="cursor">
        {t('status.cursor', {
          column: cursor.column,
          line: cursor.lineNumber,
        })}
      </span>
      <span className={styles.responsiveItem} data-status-item="count">
        {t('status.words', { count: formatNumber(wordCount) })}
      </span>
      <span className={styles.spacer} />
      <span className={styles.responsiveItem} data-status-item="encoding">
        {encodingLabel}
      </span>
      <span className={styles.responsiveItem} data-status-item="line-ending">
        {lineEndingLabel}
      </span>
      {/* The binding draws no save status here: `mockup.html` puts it in the
          title bar instead (`.doc-name` … `· autosaved`, :594), which
          `DocumentIdentity` renders. Only the transient write is reported here,
          and only while it is in flight, so the row at rest carries the same
          items as the binding. */}
      {writeInFlight ? (
        <span
          className={styles.responsiveItem}
          data-status-item="standard"
          data-write-in-flight="true"
        >
          {t('status.writeInFlight')}
        </span>
      ) : null}
      {/* Binding source: mockup.html `.sb-autosave` (:841). */}
      <span className={styles.responsiveItem} data-status-item="autosave">
        {t(autosave ? 'status.autosave.on' : 'status.autosave.off')}
      </span>
      <button
        aria-controls="document-status-details"
        aria-expanded={detailsOpen}
        className={`${styles.detailsTrigger} ${styles.pill}`}
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
          {readOnly ? (
            <span>
              {readOnlyDetail === undefined
                ? t('status.readOnlyWarning')
                : `${t('status.readOnlyWarning')} · ${readOnlyDetail}`}
            </span>
          ) : null}
        </div>
      ) : null}
    </footer>
  );
};

export default StatusBar;
