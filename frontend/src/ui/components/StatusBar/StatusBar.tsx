import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import Popup, { PopupTrigger } from '../Popup';
import Button from '../../primitives/Button';
import popupStyles from '../Popup/Popup.module.css';
import { formatNumber, t } from '../../../i18n';
import { readOnlyReason } from '../readOnlyReason';
import styles from './StatusBar.module.css';

export type SaveStatus = 'not-saved' | 'unsaved-changes' | 'saved' | 'autosaved' | 'read-only';

export type StatusFactPlacement = 'leading' | 'trailing' | 'details';

export interface StatusFact {
    readonly id: string;
    readonly rowLabel: ReactNode;
    readonly rowAriaLabel?: string;
    readonly detailLabel: ReactNode;
    readonly value: ReactNode;
    readonly dropPriority: number;
    readonly placement?: StatusFactPlacement;
    readonly marker?: 'accent-dot';
    readonly transient?: boolean;
    readonly onActivate?: () => void;
    readonly pressed?: boolean;
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
const DETAILS_ID = 'document-status-details';

interface StatusLayout {
    readonly compact: boolean;
    readonly droppedIds: ReadonlySet<string>;
}

interface MeasuredFact {
    readonly id: string | undefined;
    readonly width: number;
    readonly priority: number;
    readonly fixed: boolean;
}

function translationKey(prefix: string, value: string): string {
    return `status.${prefix}.${value.toLowerCase()}`;
}

function viewportWidth(): number {
    const browserWindow = globalThis.window;
    return browserWindow === undefined ? Number.POSITIVE_INFINITY : browserWindow.innerWidth;
}

function rowSpacing(row: HTMLElement, compact: boolean): { inset: number; gap: number } {
    const wasCompact = row.dataset.statusCompact !== undefined;
    row.toggleAttribute('data-status-compact', compact);
    const style = getComputedStyle(row);
    const pixels = (value: string): number => Number.parseFloat(value) || 0;
    const inset =
        pixels(style.paddingInlineStart) +
        pixels(style.paddingInlineEnd) +
        pixels(style.borderInlineStartWidth) +
        pixels(style.borderInlineEndWidth);
    const gap = pixels(style.columnGap);
    row.toggleAttribute('data-status-compact', wasCompact);
    return { inset, gap };
}

function fitStatus(row: HTMLElement, items: readonly HTMLElement[], details: HTMLButtonElement): StatusLayout {
    const narrow = viewportWidth() <= NARROW_WIDTH;
    const droppedIds = new Set<string>();
    const measured: MeasuredFact[] = [];
    let compact = narrow && items.some((item) => item.dataset.writeInFlight === 'true');
    let totalWidth = details.getBoundingClientRect().width;

    for (const item of items) {
        const id = item.dataset.statusMeasureId;
        const priority = Number(item.dataset.statusDropPriority);
        const fixed = id === undefined || id === 'problems' || item.dataset.writeInFlight === 'true';
        if (!fixed && narrow && priority >= NARROW_DROP_PRIORITY && id !== 'standard-kind') {
            droppedIds.add(id);
            continue;
        }
        const width = item.getBoundingClientRect().width;
        totalWidth += width;
        measured.push({ id, width, priority, fixed });
    }

    const rowWidth = row.getBoundingClientRect().width;
    if (rowWidth === 0) return { compact, droppedIds };

    // The spacer contributes one additional gap and has no minimum width.
    let { inset, gap } = rowSpacing(row, compact);
    let usedWidth = totalWidth + inset + gap * (measured.length + 1);
    if (usedWidth <= rowWidth) return { compact, droppedIds };

    if (!compact) {
        compact = true;
        ({ inset, gap } = rowSpacing(row, compact));
        usedWidth = totalWidth + inset + gap * (measured.length + 1);
    }
    const candidates = measured
        .filter((fact) => !fact.fixed)
        .reverse()
        .sort((left, right) => {
            const standardLast = Number(left.id === 'standard-kind') - Number(right.id === 'standard-kind');
            return standardLast || right.priority - left.priority;
        });
    for (const candidate of candidates) {
        if (usedWidth <= rowWidth) break;
        if (candidate.id === undefined) continue;
        droppedIds.add(candidate.id);
        usedWidth -= candidate.width + gap;
    }
    return { compact, droppedIds };
}

function legacyFacts(props: StatusBarProps): StatusFact[] {
    const encoding = props.encoding ?? 'utf-8';
    const lineEnding = props.lineEnding ?? 'lf';
    const cursor = props.cursor ?? { lineNumber: 1, column: 1 };
    const wordCount = props.wordCount ?? 0;
    const autosave = props.autosave ?? false;
    const markdownLabel =
        props.markdownStandard === undefined
            ? undefined
            : t('status.markdown', {
                  standard: t(translationKey('markdownStandard', props.markdownStandard)),
              });
    const cursorLabel = t('status.cursor', {
        column: cursor.column,
        line: cursor.lineNumber,
    });
    const wordLabel = t('status.words', { count: formatNumber(wordCount) });
    const encodingLabel = t(translationKey('encoding', encoding));
    const lineEndingLabel = t(translationKey('lineEnding', lineEnding));
    const autosaveLabel = t(autosave ? 'status.autosave.on' : 'status.autosave.off');

    return [
        ...(markdownLabel === undefined
            ? []
            : [
                  {
                      id: 'standard-kind',
                      rowLabel: markdownLabel,
                      detailLabel: markdownLabel,
                      value: '',
                      dropPriority: 0,
                      marker: 'accent-dot',
                  } as StatusFact,
              ]),
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
    const hasValue = fact.value !== '' && fact.value !== null && fact.value !== undefined;
    const content = (
        <>
            {fact.detailLabel}
            {hasValue ? <>: {fact.value}</> : null}
        </>
    );
    return (
        <span data-status-detail={fact.id} data-status-detail-dropped={dropped ? 'true' : undefined} key={fact.id}>
            {fact.onActivate === undefined ? (
                content
            ) : (
                <Button
                    aria-pressed={fact.pressed}
                    className={styles.factButton}
                    variant="quiet"
                    onClick={fact.onActivate}
                >
                    {content}
                </Button>
            )}
        </span>
    );
}

interface RowFactProps {
    readonly fact: StatusFact;
    readonly ref: React.RefCallback<HTMLSpanElement>;
    readonly dropped?: boolean;
    readonly synthetic?: boolean;
}

function RowFact({ fact, ref, dropped = false, synthetic = false }: RowFactProps): React.JSX.Element {
    return (
        <span
            aria-hidden={dropped || undefined}
            className={dropped ? `${styles.responsiveItem} ${styles.dropped}` : styles.responsiveItem}
            data-status-drop-priority={fact.dropPriority}
            data-status-item={dropped ? undefined : fact.id}
            data-status-measure-id={synthetic ? undefined : fact.id}
            data-write-in-flight={fact.transient ? 'true' : undefined}
            inert={dropped || undefined}
            ref={ref}
        >
            {fact.marker === 'accent-dot' ? <span aria-hidden="true" className={styles.dot} /> : null}
            {fact.onActivate === undefined ? (
                fact.rowLabel
            ) : (
                <Button
                    aria-label={fact.rowAriaLabel}
                    aria-pressed={fact.pressed}
                    className={styles.factButton}
                    variant="quiet"
                    onClick={fact.onActivate}
                >
                    {fact.rowLabel}
                </Button>
            )}
        </span>
    );
}

const StatusBar: React.FC<StatusBarProps> = (props: StatusBarProps): React.JSX.Element => {
    const { capability, facts, readOnly, saveIdentity, status = 'not-saved', transient, writeInFlight = false } = props;
    const inventory = facts ?? legacyFacts(props);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [detailsTrigger, setDetailsTrigger] = useState<HTMLButtonElement | null>(null);
    const [layout, setLayout] = useState<StatusLayout>({ compact: false, droppedIds: new Set() });
    const rowRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<ResizeObserver | null>(null);
    const resolvedReadOnly = readOnly ?? status === 'read-only';
    const resolvedSaveIdentity = saveIdentity ?? t(translationKey('saveStatus', status));
    const resolvedTransient = transient ?? (writeInFlight ? t('status.writeInFlight') : undefined);
    const orderedFacts = [...inventory].sort((left, right) => left.dropPriority - right.dropPriority);
    const rowFacts = orderedFacts.filter((fact) => fact.placement !== 'details');
    const leadingFacts = rowFacts.filter((fact) => fact.placement !== 'trailing');
    const trailingFacts = rowFacts.filter((fact) => fact.placement === 'trailing');
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
    const detailsFacts = orderedFacts.map((fact) => factDetail(fact, layout.droppedIds.has(fact.id)));
    const readOnlyDetail = readOnlyReason(capability);
    const hasReadOnlyFact = orderedFacts.some((fact) => fact.id === 'read-only');

    const measure = useCallback((): void => {
        const row = rowRef.current;
        const details = row?.querySelector<HTMLButtonElement>(`:scope > [aria-controls="${DETAILS_ID}"]`);
        if (row === null || details == null) return;
        const items = Array.from(row.querySelectorAll<HTMLElement>(':scope > [data-status-drop-priority]'));
        const next = fitStatus(row, items, details);
        const focused = row.ownerDocument.activeElement;
        if (
            items.some((item) => {
                const id = item.dataset.statusMeasureId;
                return id !== undefined && next.droppedIds.has(id) && item.contains(focused);
            })
        ) {
            details.focus({ preventScroll: true });
        }
        setLayout((current) =>
            current.compact === next.compact &&
            current.droppedIds.size === next.droppedIds.size &&
            [...next.droppedIds].every((id) => current.droppedIds.has(id))
                ? current
                : next,
        );
    }, []);

    const observeFact = useCallback<React.RefCallback<HTMLSpanElement>>((item) => {
        if (item === null) return;
        observerRef.current?.observe(item);
        return (): void => observerRef.current?.unobserve(item);
    }, []);

    useLayoutEffect((): (() => void) | undefined => {
        const row = rowRef.current;
        if (row === null) return;
        globalThis.addEventListener('resize', measure);
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observerRef.current = observer;
        observer?.observe(row);
        for (const item of row.querySelectorAll(':scope > [data-status-drop-priority], :scope > button')) {
            observer?.observe(item);
        }
        return (): void => {
            observerRef.current = null;
            observer?.disconnect();
            globalThis.removeEventListener('resize', measure);
        };
    }, [measure]);

    useLayoutEffect(() => {
        measure();
    });

    return (
        <div className={styles.dock} data-status-dock="true">
            <div
                aria-label={t('status.ariaLabel')}
                className={styles.statusBar}
                data-status-compact={layout.compact ? '' : undefined}
                data-status-state={status}
                ref={rowRef}
                role="status"
            >
                {leadingFacts.map((fact) => (
                    <RowFact key={fact.id} dropped={layout.droppedIds.has(fact.id)} fact={fact} ref={observeFact} />
                ))}
                <span className={styles.spacer} />
                {transientFact !== undefined ? <RowFact synthetic fact={transientFact} ref={observeFact} /> : null}
                {trailingFacts.map((fact) => (
                    <RowFact key={fact.id} dropped={layout.droppedIds.has(fact.id)} fact={fact} ref={observeFact} />
                ))}
                <PopupTrigger
                    aria-controls={DETAILS_ID}
                    aria-expanded={detailsOpen}
                    className={`${styles.detailsTrigger} ${styles.pill}`}
                    expanded={detailsOpen}
                    ref={setDetailsTrigger}
                    onOpen={(): void => setDetailsOpen(true)}
                    onClick={(): void => setDetailsOpen((open) => !open)}
                >
                    {t('status.details')}
                </PopupTrigger>
            </div>
            <Popup
                anchor={{ trigger: detailsTrigger }}
                aria-label={t('status.details')}
                className={popupStyles.details}
                id={DETAILS_ID}
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
