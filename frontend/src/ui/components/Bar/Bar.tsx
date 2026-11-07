import {
    Children,
    Fragment,
    cloneElement,
    isValidElement,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type HTMLAttributes,
    type ReactElement,
} from 'react';

import Popup, { PopupTrigger } from '../Popup';
import { OverflowMenuContext } from '../../primitives/overflowMenuContext';
import styles from './Bar.module.css';

export type BarOverflow = 'scroll' | 'menu';
export type BarRole = 'menubar' | 'tablist-host' | 'toolbar';

export interface BarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'aria-label' | 'role'> {
    readonly ariaLabel: string;
    readonly leading?: React.ReactNode;
    readonly main?: React.ReactNode;
    readonly overflow: BarOverflow;
    readonly overflowBreakpoint?: number;
    readonly overflowContent?: React.ReactNode;
    readonly overflowLabel?: string;
    readonly overflowPopupLabel?: string;
    readonly overflowPopupProps?: HTMLAttributes<HTMLDivElement> & Record<string, string | undefined>;
    readonly overflowPopupClassName?: string;
    readonly overflowTriggerClassName?: string;
    readonly role: BarRole;
    readonly trailing?: React.ReactNode;
}

interface MeasuredItem {
    index: number;
    key: string;
    never: boolean;
    priority: number;
    width: number;
}

function flattenSlotItems(content: React.ReactNode): React.ReactNode[] {
    return (
        Children.map(content, (item) => {
            if (isValidElement(item) && item.type === Fragment) {
                const fragment = item as ReactElement<{ children?: React.ReactNode }>;
                return flattenSlotItems(fragment.props.children);
            }
            return isValidElement(item) ? item : <span>{item}</span>;
        }) ?? []
    );
}

function slotItems(content: React.ReactNode): React.ReactElement[] {
    return (
        Children.map(flattenSlotItems(content), (item, index) =>
            cloneElement(item as ReactElement<Record<string, unknown>>, { 'data-bar-item': index }),
        ) ?? []
    );
}

function itemPriority(item: HTMLElement): number {
    const value = Number(item.dataset.barOverflowPriority);
    return Number.isFinite(value) ? value : 0;
}

function itemNeverOverflows(item: HTMLElement): boolean {
    return item.dataset.barOverflow === 'never';
}

function roleValue(role: BarRole): 'group' | 'menubar' | 'toolbar' {
    return role === 'tablist-host' ? 'group' : role;
}

function sameIndexes(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
    if (left.size !== right.size) return false;
    for (const value of left) {
        if (!right.has(value)) return false;
    }
    return true;
}

function selectOverflowItems(measuredItems: MeasuredItem[], itemCount: number, available: number): Set<number> {
    const items =
        measuredItems.length === itemCount
            ? measuredItems
            : Array.from({ length: itemCount }, (_, index) => ({ index, never: false, priority: 0, width: 0 }));
    let remaining = items.reduce((total, item) => total + item.width, 0);
    const next = new Set<number>();
    const candidates = items
        .filter((item) => !item.never)
        .sort((left, right) => right.priority - left.priority || right.index - left.index);
    const hasMeasurements = measuredItems.some((item) => item.width > 0);
    for (const item of candidates) {
        if (remaining <= available + 1 && hasMeasurements) break;
        next.add(item.index);
        remaining -= item.width;
    }
    if (next.size === 0 && candidates[0] !== undefined) next.add(candidates[0].index);
    return next;
}

const Bar: React.FC<BarProps> = ({
    ariaLabel,
    className,
    leading,
    main,
    onScroll,
    overflow,
    overflowBreakpoint,
    overflowContent,
    overflowLabel = 'More actions',
    overflowPopupLabel = ariaLabel,
    overflowPopupProps,
    overflowPopupClassName,
    overflowTriggerClassName,
    role,
    trailing,
    ...rest
}: BarProps): React.JSX.Element => {
    const barRef = useRef<HTMLDivElement | null>(null);
    const mainRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const measuredItemsRef = useRef<MeasuredItem[]>([]);
    const [overflowOpen, setOverflowOpen] = useState(false);
    const [overflowIndexes, setOverflowIndexes] = useState<ReadonlySet<number>>(new Set());

    const mainItems = useMemo(() => slotItems(main), [main]);
    const isMenuOverflow = overflow === 'menu';
    const isOverflowing = overflowIndexes.size > 0;

    const measure = useCallback((): void => {
        const bar = barRef.current;
        const mainElement = mainRef.current;
        if (bar === null || mainElement === null) return;

        const itemElements = Array.from(mainElement.querySelectorAll<HTMLElement>(':scope > [data-bar-item]'));
        const measured = itemElements.map((element, index) => {
            const item = mainItems[index];
            const key = String(item.key);
            const width = element.getBoundingClientRect().width;
            const previous = measuredItemsRef.current.find((candidate) => candidate.key === key);
            return {
                index,
                key,
                never: itemNeverOverflows(element),
                priority: itemPriority(element),
                // Hidden items have no layout box. Retain their measured width so
                // repeated resizes do not bring overflowing groups back into view.
                width: element.hidden && width === 0 ? (previous?.width ?? 0) : width,
            };
        });
        if (measured.some((item) => item.width > 0)) {
            measuredItemsRef.current = measured;
        }

        if (overflow === 'scroll') {
            const next =
                mainElement.scrollWidth > mainElement.clientWidth + 1
                    ? new Set(mainItems.map((_, index) => index))
                    : new Set<number>();
            setOverflowIndexes((current) => (sameIndexes(current, next) ? current : next));
            return;
        }

        const browserWindow = globalThis.window;
        const viewportWidth = browserWindow === undefined ? 0 : browserWindow.innerWidth;
        const breakpointReached =
            overflowBreakpoint !== undefined && viewportWidth > 0 && viewportWidth <= overflowBreakpoint;
        const barWidth = bar.clientWidth || bar.getBoundingClientRect().width;
        const mainWidth = mainElement.clientWidth || barWidth;
        const measuredItems =
            measuredItemsRef.current.length === mainItems.length ? measuredItemsRef.current : measured;
        const totalWidth = measuredItems.reduce((total, item) => total + item.width, 0);
        const needsMenu =
            breakpointReached ||
            mainElement.scrollWidth > mainElement.clientWidth + 1 ||
            (totalWidth > 0 && totalWidth > mainWidth + 1);

        if (!needsMenu || mainItems.length === 0) {
            setOverflowIndexes((current) => (current.size === 0 ? current : new Set<number>()));
            setOverflowOpen(false);
            return;
        }

        const available = Math.max(0, mainWidth - (triggerRef.current?.getBoundingClientRect().width ?? 0) - 1);
        const next = selectOverflowItems(measuredItems, mainItems.length, available);

        if (next.size === 0) setOverflowOpen(false);
        setOverflowIndexes((current) => (sameIndexes(current, next) ? current : next));
    }, [mainItems, overflow, overflowBreakpoint]);

    useLayoutEffect((): void => {
        measure();
    }, [measure]);

    useEffect((): (() => void) => {
        const bar = barRef.current;
        const mainElement = mainRef.current;
        if (bar === null || mainElement === null) return (): void => undefined;

        const onResize = (): void => measure();
        globalThis.addEventListener('resize', onResize);
        globalThis.addEventListener('scroll', onResize, true);
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
        observer?.observe(bar);
        observer?.observe(mainElement);
        return (): void => {
            globalThis.removeEventListener('resize', onResize);
            globalThis.removeEventListener('scroll', onResize, true);
            observer?.disconnect();
        };
    }, [measure]);

    const overflowItems = mainItems.filter((_, index) => overflowIndexes.has(index));
    let popupItems = overflowItems;
    if (overflowItems.length === 0 && overflowOpen) popupItems = mainItems;
    const visibleItems = Children.map(mainItems, (item, index) => {
        const hidden = overflowIndexes.has(index) || (overflowOpen && isMenuOverflow && overflowIndexes.size === 0);
        return cloneElement(item as ReactElement<Record<string, unknown>>, {
            'aria-hidden': hidden ? true : undefined,
            hidden,
        });
    });

    return (
        <div
            {...rest}
            ref={barRef}
            aria-label={ariaLabel}
            className={`${styles.bar} ${className ?? ''}`.trim()}
            data-bar-overflow={overflow}
            data-bar-overflowing={isOverflowing ? 'true' : undefined}
            data-bar-role={role}
            role={roleValue(role)}
            onScroll={onScroll}
        >
            <div className={styles.leading} data-bar-slot="leading">
                {leading}
            </div>
            <div
                ref={mainRef}
                className={styles.main}
                data-bar-slot="main"
                data-bar-scrollable={overflow === 'scroll' ? 'true' : undefined}
            >
                {overflow === 'scroll' ? mainItems : visibleItems}
            </div>
            {isMenuOverflow ? (
                <PopupTrigger
                    ref={triggerRef}
                    aria-label={overflowLabel}
                    className={`${styles.overflowTrigger} ${overflowTriggerClassName ?? ''}`.trim()}
                    expanded={overflowOpen}
                    data-bar-overflow-trigger="true"
                    onClick={(): void => setOverflowOpen((open) => !open)}
                    onOpen={(): void => setOverflowOpen(true)}
                >
                    <span aria-hidden="true">»</span>
                </PopupTrigger>
            ) : null}
            <div className={styles.trailing} data-bar-slot="trailing">
                {trailing}
            </div>
            {isMenuOverflow ? (
                <Popup
                    {...overflowPopupProps}
                    anchor={{ trigger: triggerRef }}
                    aria-label={overflowPopupLabel}
                    className={overflowPopupClassName}
                    data-bar-overflow-popup="true"
                    initialFocus="first"
                    open={overflowOpen}
                    returnFocusTo={triggerRef}
                    role="menu"
                    size="menu"
                    onOpenChange={setOverflowOpen}
                >
                    <OverflowMenuContext.Provider value>
                        <div data-bar-popup-items>
                            {popupItems}
                            {overflowContent}
                        </div>
                    </OverflowMenuContext.Provider>
                </Popup>
            ) : null}
        </div>
    );
};

export default Bar;
