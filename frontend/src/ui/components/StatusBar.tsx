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
}: StatusBarProps): React.JSX.Element => (
  <footer aria-label={t('status.ariaLabel')} className={styles.statusBar}>
    <span>
      {t('status.cursor', {
        column: cursor.column,
        line: cursor.lineNumber,
      })}
    </span>
    <span>{t('status.words', { count: formatNumber(wordCount) })}</span>
    <span className={styles.spacer} />
    <span>{t(translationKey('encoding', encoding))}</span>
    <span>{t(translationKey('lineEnding', lineEnding))}</span>
    <span data-write-in-flight={writeInFlight || undefined}>
      {t(translationKey('saveStatus', status))}
      {writeInFlight ? ` · ${t('status.writeInFlight')}` : ''}
    </span>
    <span>{t(translationKey('arrangement', arrangement))}</span>
  </footer>
);

export default StatusBar;
