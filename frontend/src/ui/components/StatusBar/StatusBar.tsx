import { useEffect, useState, type ReactNode } from 'react';

import Popup, { PopupTrigger } from '../Popup';
import popupStyles from '../Popup/Popup.module.css';
import { formatNumber, t } from '../../../i18n';
import { readOnlyReason } from '../readOnlyReason';
import styles from './StatusBar.module.css';

export type SaveStatus =
  'not-saved' | 'unsaved-changes' | 'saved' | 'autosaved' | 'read-only';

export type StatusFactPlacement = 'leading' | 'trailing' | 'details';

export interface StatusFact {
  readonly id: string;
  readonly rowLabel: ReactNode;
  readonly detailLabel: ReactNode;
  readonly value: ReactNode;
  readonly dropPriority: number;
  readonly placement?: StatusFactPlacement;
  readonly marker?: 'accent-dot';
  readonly transient?: boolean;
}

export interface StatusBarProps {
  /** The single inventory used by both the row and the Details Popup. */
  readonly facts?: readonly StatusFact[];
  readonly saveIdentity?: ReactNode;
  readonly transient?: ReactNode;
  readonly status?: SaveStatus;

  // Kept as an input-compatible bridge for the existing widget until it is
  // decomposed. AppShell uses the fact inventory above.
  readonly cursor?: { lineNumber: number; column: number };
  readonly encoding?: string;
  readonly lineEnding?: string;
  readonly writeInFlight?: boolean;
  readonly wordCount?: number;
  readonly autosave?: boolean;
  readonly readOnly?: boolean;
  readonly capability?: string;
  readonly markdownStandard?: string;
}

const NARROW_WIDTH = 376;
const NARROW_DROP_PRIORITY = 2;

function translationKey(prefix: string, value: string): string {
  return `status.${prefix}.${value.toLowerCase()}`;
}

function viewportWidth(): number {
  return typeof window === 'undefined'
    ? Number.POSITIVE_INFINITY
    : window.innerWidth;
}

function legacyFacts(props: StatusBarProps): StatusFact[] {
  const encoding = props.encoding ?? 'utf-8';
  const lineEnding = props.lineEnding ?? 'lf';
  const cursor = props.cursor ?? { lineNumber: 1, column: 1 };
  const wordCount = props.wordCount ?? 0;
  const autosave = props.autosave ?? false;
  const markdownStandard = props.markdownStandard ?? 'gfm';
  const markdownLabel = t('status.markdown', {
    standard: t(translationKey('markdownStandard', markdownStandard)),
  });
  const cursorLabel = t('status.cursor', {
    column: cursor.column,
    line: cursor.lineNumber,
  });
  const wordLabel = t('status.words', { count: formatNumber(wordCount) });
  const encodingLabel = t(translationKey('encoding', encoding));
  const lineEndingLabel = t(translationKey('lineEnding', lineEnding));
  const autosaveLabel = t(
    autosave ? 'status.autosave.on' : 'status.autosave.off',
  );

  return [
    {
      id: 'standard-kind',
      rowLabel: markdownLabel,
      detailLabel: markdownLabel,
      value: '',
      dropPriority: 0,
      marker: 'accent-dot',
    },
    {
      id: 'cursor',
      rowLabel: cursorLabel,
      detailLabel: 'Cursor',
      value: cursorLabel,
      dropPriority: 1,
    },
    {
      id: 'count',
      rowLabel: wordLabel,
      detailLabel: wordLabel,
      value: '',
      dropPriority: 2,
    },
    {
      id: 'encoding',
      rowLabel: encodingLabel,
      detailLabel: encodingLabel,
      value: '',
      dropPriority: 3,
      placement: 'trailing',
    },
    {
      id: 'line-ending',
      rowLabel: lineEndingLabel,
      detailLabel: lineEndingLabel,
      value: '',
      dropPriority: 4,
      placement: 'trailing',
    },
    {
      id: 'autosave',
      rowLabel: autosaveLabel,
      detailLabel: autosaveLabel,
      value: '',
      dropPriority: 5,
      placement: 'trailing',
    },
  ];
}

function factDetail(fact: StatusFact, dropped: boolean): React.JSX.Element {
  const hasValue =
    fact.value !== '' && fact.value !== null && fact.value !== undefined;
  return (
    <span
      data-status-detail={fact.id}
      data-status-detail-dropped={dropped ? 'true' : undefined}
      key={fact.id}
    >
      {fact.detailLabel}
      {hasValue ? <>: {fact.value}</> : null}
    </span>
  );
}

function rowFact(fact: StatusFact): React.JSX.Element {
  return (
    <span
      className={styles.responsiveItem}
      data-status-drop-priority={fact.dropPriority}
      data-status-item={fact.id}
      data-write-in-flight={fact.transient ? 'true' : undefined}
      key={fact.id}
    >
      {fact.marker === 'accent-dot' ? (
        <span aria-hidden="true" className={styles.dot} />
      ) : null}
      {fact.rowLabel}
    </span>
  );
}

const StatusBar: React.FC<StatusBarProps> = (
  props: StatusBarProps,
): React.JSX.Element => {
  const {
    capability,
    facts,
    readOnly,
    saveIdentity,
    status = 'not-saved',
    transient,
    writeInFlight = false,
  } = props;
  const inventory = facts ?? legacyFacts(props);
  const [currentWidth, setCurrentWidth] = useState(viewportWidth);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTrigger, setDetailsTrigger] =
    useState<HTMLButtonElement | null>(null);
  const narrow = currentWidth <= NARROW_WIDTH;
  const resolvedReadOnly = readOnly ?? status === 'read-only';
  const resolvedSaveIdentity =
    saveIdentity ?? t(translationKey('saveStatus', status));
  const resolvedTransient =
    transient ?? (writeInFlight ? t('status.writeInFlight') : undefined);
  const orderedFacts = [...inventory].sort(
    (left, right) => left.dropPriority - right.dropPriority,
  );
  const droppedIds = new Set(
    orderedFacts
      .filter((fact) => narrow && fact.dropPriority >= NARROW_DROP_PRIORITY)
      .map((fact) => fact.id),
  );
  const rowFacts = orderedFacts.filter(
    (fact) => fact.placement !== 'details' && !droppedIds.has(fact.id),
  );
  const leadingFacts = rowFacts.filter((fact) => fact.placement !== 'trailing');
  const trailingFacts = rowFacts.filter(
    (fact) => fact.placement === 'trailing',
  );
  const transientFact: StatusFact | undefined =
    resolvedTransient === undefined
      ? undefined
      : {
          id: 'standard',
          rowLabel: resolvedTransient,
          detailLabel: resolvedTransient,
          value: '',
          dropPriority: Number.MAX_SAFE_INTEGER,
          placement: 'trailing',
          transient: true,
        };
  const detailsFacts = orderedFacts.map((fact) =>
    factDetail(fact, droppedIds.has(fact.id)),
  );
  const readOnlyDetail = readOnlyReason(capability);
  const hasReadOnlyFact = orderedFacts.some((fact) => fact.id === 'read-only');

  useEffect((): (() => void) => {
    const onResize = (): void => setCurrentWidth(viewportWidth());
    window.addEventListener('resize', onResize);
    return (): void => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className={styles.dock} data-status-dock="true">
      <footer
        aria-label={t('status.ariaLabel')}
        className={styles.statusBar}
        data-status-state={status}
        role="status"
      >
        {leadingFacts.map(rowFact)}
        <span className={styles.spacer} />
        {transientFact !== undefined ? rowFact(transientFact) : null}
        {trailingFacts.map(rowFact)}
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
        {detailsFacts}
        <span data-status-detail="save-identity">{resolvedSaveIdentity}</span>
        {resolvedTransient !== undefined ? (
          <span data-status-detail="transient">{resolvedTransient}</span>
        ) : null}
        {resolvedReadOnly && !hasReadOnlyFact ? (
          <span data-status-detail="read-only">
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
