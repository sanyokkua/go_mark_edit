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

export interface BarProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'aria-label' | 'role'
> {
  readonly ariaLabel: string;
  readonly leading?: React.ReactNode;
  readonly main?: React.ReactNode;
  readonly overflow: BarOverflow;
  readonly overflowBreakpoint?: number;
  readonly overflowContent?: React.ReactNode;
  readonly overflowLabel?: string;
  readonly overflowPopupLabel?: string;
  readonly overflowPopupProps?: HTMLAttributes<HTMLDivElement> &
    Record<string, string | undefined>;
  readonly overflowPopupClassName?: string;
  readonly overflowTriggerClassName?: string;
  readonly role: BarRole;
  readonly trailing?: React.ReactNode;
}

interface MeasuredItem {
  index: number;
  never: boolean;
  priority: number;
  width: number;
}

function slotItems(content: React.ReactNode): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  Children.forEach(content, (item) => {
    if (isValidElement(item) && item.type === Fragment) {
      const fragment = item as ReactElement<{ children?: React.ReactNode }>;
      items.push(...slotItems(fragment.props.children));
      return;
    }
    items.push(item);
  });

  return items.map((item, index) => {
    if (!isValidElement(item)) {
      return (
        <span data-bar-item={index} key={`bar-item-${index}`}>
          {item}
        </span>
      );
    }

    return cloneElement(item as ReactElement<Record<string, unknown>>, {
      'data-bar-item': index,
      key: item.key ?? `bar-item-${index}`,
    });
  });
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

function sameIndexes(
  left: ReadonlySet<number>,
  right: ReadonlySet<number>,
): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
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
  const [overflowIndexes, setOverflowIndexes] = useState<ReadonlySet<number>>(
    new Set(),
  );

  const mainItems = useMemo(() => slotItems(main), [main]);
  const isMenuOverflow = overflow === 'menu';
  const isOverflowing = overflowIndexes.size > 0;

  const measure = useCallback((): void => {
    const bar = barRef.current;
    const mainElement = mainRef.current;
    if (bar === null || mainElement === null) return;

    const itemElements = Array.from(
      mainElement.querySelectorAll<HTMLElement>(':scope > [data-bar-item]'),
    );
    const measured = itemElements.map((element, index) => ({
      index,
      never: itemNeverOverflows(element),
      priority: itemPriority(element),
      width: element.getBoundingClientRect().width,
    }));
    if (measured.some((item) => item.width > 0)) {
      measuredItemsRef.current = measured;
    }

    if (overflow === 'scroll') {
      const next =
        mainElement.scrollWidth > mainElement.clientWidth + 1
          ? new Set(mainItems.map((_, index) => index))
          : new Set<number>();
      setOverflowIndexes((current) =>
        sameIndexes(current, next) ? current : next,
      );
      return;
    }

    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const breakpointReached =
      overflowBreakpoint !== undefined &&
      viewportWidth > 0 &&
      viewportWidth <= overflowBreakpoint;
    const barWidth = bar.clientWidth || bar.getBoundingClientRect().width;
    const mainWidth = mainElement.clientWidth || barWidth;
    const measuredItems =
      measuredItemsRef.current.length === mainItems.length
        ? measuredItemsRef.current
        : measured;
    const totalWidth = measuredItems.reduce(
      (total, item) => total + item.width,
      0,
    );
    const needsMenu =
      breakpointReached ||
      mainElement.scrollWidth > mainElement.clientWidth + 1 ||
      (totalWidth > 0 && totalWidth > mainWidth + 1);

    if (!needsMenu || mainItems.length === 0) {
      setOverflowIndexes((current) =>
        current.size === 0 ? current : new Set<number>(),
      );
      setOverflowOpen(false);
      return;
    }

    const available = Math.max(
      0,
      mainWidth - (triggerRef.current?.getBoundingClientRect().width ?? 0) - 1,
    );
    const items =
      measuredItems.length === mainItems.length
        ? measuredItems
        : mainItems.map((_, index) => ({
            index,
            never: false,
            priority: 0,
            width: 0,
          }));
    let remaining = items.reduce((total, item) => total + item.width, 0);
    const next = new Set<number>();
    const candidates = items
      .filter((item) => !item.never)
      .sort(
        (left, right) =>
          right.priority - left.priority || right.index - left.index,
      );

    for (const item of candidates) {
      if (
        remaining <= available + 1 &&
        measuredItems.some((candidate) => candidate.width > 0)
      ) {
        break;
      }
      next.add(item.index);
      remaining -= item.width;
    }

    if (next.size === 0 && items.some((item) => !item.never)) {
      const first = candidates[0];
      if (first !== undefined) next.add(first.index);
    }

    setOverflowIndexes((current) =>
      sameIndexes(current, next) ? current : next,
    );
  }, [mainItems, overflow, overflowBreakpoint]);

  useLayoutEffect((): void => {
    measure();
  }, [measure]);

  useEffect((): (() => void) => {
    const bar = barRef.current;
    const mainElement = mainRef.current;
    if (bar === null || mainElement === null) return (): void => undefined;

    const onResize = (): void => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(onResize);
    observer?.observe(bar);
    observer?.observe(mainElement);
    return (): void => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      observer?.disconnect();
    };
  }, [measure]);

  useEffect((): void => {
    if (isOverflowing) return;
    setOverflowOpen(false);
  }, [isOverflowing]);

  const overflowItems = mainItems.filter((_, index) =>
    overflowIndexes.has(index),
  );
  const popupItems =
    overflowItems.length > 0 ? overflowItems : overflowOpen ? mainItems : [];
  const visibleItems = mainItems.map((item, index) => {
    const hidden =
      overflowIndexes.has(index) ||
      (overflowOpen && isMenuOverflow && overflowIndexes.size === 0);
    if (isValidElement(item)) {
      return cloneElement(item as ReactElement<Record<string, unknown>>, {
        'aria-hidden': hidden ? true : undefined,
        hidden,
        key: `visible-${index}`,
      });
    }
    return (
      <span
        aria-hidden={hidden ? true : undefined}
        className={styles.itemSlot}
        hidden={hidden}
        key={`visible-${index}`}
      >
        {item}
      </span>
    );
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
          className={`${styles.overflowTrigger} ${
            overflowTriggerClassName ?? ''
          }`.trim()}
          expanded={overflowOpen}
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
          anchor={{ trigger: triggerRef.current }}
          aria-label={overflowPopupLabel}
          className={overflowPopupClassName}
          data-bar-overflow-popup="true"
          initialFocus="first"
          open={overflowOpen}
          returnFocusTo={triggerRef.current}
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
