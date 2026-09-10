import { useState } from 'react';

import type { EditorPosition } from './CodeEditor';
import Popup, { PopupTrigger } from './Popup';
import popupStyles from './Popup/Popup.module.css';
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
  const [detailsTrigger, setDetailsTrigger] =
    useState<HTMLButtonElement | null>(null);
  const saveStatus = t(translationKey('saveStatus', status));
  const encodingLabel = t(translationKey('encoding', encoding));
  const lineEndingLabel = t(translationKey('lineEnding', lineEnding));
  return (
    /*
     * The dock is the row's positioning context, and it is the reason the
     * disclosure below can be seen at all (T113). The row itself must keep
     * `overflow: hidden` — that clip is what makes it shed status items instead
     * of wrapping, which `narrow-width.test.ts` T084 measures — and an
     * absolutely positioned child of a clipping containing block is clipped by
     * it in every engine. So the panel is a sibling of the row rather than a
     * child of it, anchored to the dock, which spans exactly the row.
     */
    <div className={styles.dock} data-status-dock="true">
      <footer
        aria-label={t('status.ariaLabel')}
        className={styles.statusBar}
        data-status-state={status}
        role="status"
      >
        {/* Binding source: mockup.html `.statusbar` (:838) — the row opens with
            the document standard behind an accent dot (`.dotk`, :385), then the
            caret position and the word count. */}
        <span
          className={styles.responsiveItem}
          data-status-item="standard-kind"
        >
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
            `DocumentIdentity` renders. Only the transient write is reported
            here, and only while it is in flight, so the row at rest carries the
            same items as the binding. */}
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
        <PopupTrigger
          aria-controls="document-status-details"
          aria-expanded={detailsOpen}
          className={`${styles.detailsTrigger} ${styles.pill}`}
          expanded={detailsOpen}
          ref={setDetailsTrigger}
          onOpen={(): void => setDetailsOpen(true)}
          onClick={(): void => setDetailsOpen((open) => !open)}
        >
          {t('status.details')}
        </PopupTrigger>
      </footer>
      <Popup
        anchor={{ trigger: detailsTrigger }}
        aria-label={t('status.details')}
        className={popupStyles.details}
        id="document-status-details"
        initialFocus="popup"
        open={detailsOpen}
        returnFocusTo={detailsTrigger}
        role="dialog-less region"
        size="details"
        onOpenChange={setDetailsOpen}
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
      </Popup>
    </div>
  );
};

export default StatusBar;
