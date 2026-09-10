import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import Bar from '../Bar';
import type { PopupAnchor } from '../Popup';
import Icon from '../../primitives/Icon';
import styles from './TabBar.module.css';

export interface TabBarLabelParts {
  readonly basename: string;
  readonly suffix: string;
}

export interface TabBarTab {
  readonly active: boolean;
  readonly dirty: boolean;
  readonly id: string;
  readonly label: string;
  readonly readOnly: boolean;
  readonly closeLabel?: string;
  readonly conflictBlocked?: boolean;
  readonly conflictLabel?: string;
  readonly controls?: string;
  readonly labelParts?: TabBarLabelParts;
  readonly modifiedLabel?: string;
  readonly tabId?: string;
  readonly title?: string;
  readonly writeInFlight?: boolean;
}

export interface TabBarProps {
  readonly ariaLabel: string;
  readonly onActivate: (documentId: string) => void;
  readonly onAdd: () => void;
  readonly onClose: (documentId: string) => void;
  readonly onContextMenu: (documentId: string, anchor: PopupAnchor) => void;
  readonly onReorder: (documentId: string, targetIndex: number) => void;
  readonly tabs: readonly TabBarTab[];
  readonly className?: string;
  readonly newTabLabel?: string;
  readonly onTabRef?: (
    documentId: string,
    element: HTMLButtonElement | null,
  ) => void;
}

const TAB_DRAG_THRESHOLD_PX = 4;
const TAB_DRAG_EDGE_SCROLL_MARGIN_PX = 48;
const TAB_DRAG_EDGE_SCROLL_STEP_PX = 12;
const TAB_DRAG_EDGE_SCROLL_INTERVAL_MS = 16;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function targetIndexForSlot(slot: number, fromIndex: number): number {
  return slot > fromIndex ? slot - 1 : slot;
}

function insertionIndicator(slot: number): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={styles.tabInsertionIndicator}
      data-tab-insertion-slot={slot}
      key={`tab-insertion-${slot}`}
    />
  );
}

const TabBar: React.FC<TabBarProps> = ({
  ariaLabel,
  className,
  newTabLabel = 'New tab',
  onActivate,
  onAdd,
  onClose,
  onContextMenu,
  onReorder,
  onTabRef,
  tabs,
}: TabBarProps): React.JSX.Element => {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [tabsOverflowing, setTabsOverflowing] = useState(false);
  const [insertionSlot, setInsertionSlot] = useState<number | null>(null);
  const [draggingDocumentId, setDraggingDocumentId] = useState<string | null>(
    null,
  );
  const pendingGrab = useRef<{
    documentId: string;
    fromIndex: number;
    startX: number;
  } | null>(null);
  const activeDrag = useRef<{ documentId: string; fromIndex: number } | null>(
    null,
  );
  const dragTeardown = useRef<(() => void) | null>(null);
  const edgeScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const suppressActivationClick = useRef(false);

  const focusDocument = useCallback((documentId: string): void => {
    tabRefs.current.get(documentId)?.focus();
  }, []);

  const registerTabRef = useCallback(
    (documentId: string, element: HTMLButtonElement | null): void => {
      if (element === null) tabRefs.current.delete(documentId);
      else tabRefs.current.set(documentId, element);
      onTabRef?.(documentId, element);
    },
    [onTabRef],
  );

  const endDrag = useCallback((): void => {
    if (edgeScrollTimer.current !== null) {
      clearInterval(edgeScrollTimer.current);
      edgeScrollTimer.current = null;
    }
    dragTeardown.current?.();
    dragTeardown.current = null;
    pendingGrab.current = null;
    activeDrag.current = null;
    setInsertionSlot(null);
    setDraggingDocumentId(null);
  }, []);

  useEffect((): (() => void) => endDrag, [endDrag]);

  useLayoutEffect((): void => {
    const strip = stripRef.current;
    if (strip === null) return;
    setTabsOverflowing(strip.scrollWidth > strip.clientWidth);
  }, [tabs]);

  useEffect((): (() => void) | undefined => {
    const strip = stripRef.current;
    if (strip === null) return undefined;
    const measure = (): void => {
      setTabsOverflowing(strip.scrollWidth > strip.clientWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(strip);
    return (): void => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [tabs]);

  const edgeScrollDirectionAt = useCallback((clientX: number): number => {
    const strip = stripRef.current;
    if (strip === null || strip.scrollWidth <= strip.clientWidth) return 0;
    const box = strip.getBoundingClientRect();
    if (clientX >= box.right - TAB_DRAG_EDGE_SCROLL_MARGIN_PX) return 1;
    if (clientX <= box.left + TAB_DRAG_EDGE_SCROLL_MARGIN_PX) return -1;
    return 0;
  }, []);

  const stepEdgeScroll = useCallback((direction: number): void => {
    const strip = stripRef.current;
    if (strip === null || direction === 0) return;
    strip.scrollLeft += direction * TAB_DRAG_EDGE_SCROLL_STEP_PX;
  }, []);

  const updateEdgeScroll = useCallback(
    (clientX: number): void => {
      const direction = edgeScrollDirectionAt(clientX);
      if (direction === 0) {
        if (edgeScrollTimer.current !== null) {
          clearInterval(edgeScrollTimer.current);
          edgeScrollTimer.current = null;
        }
        return;
      }
      if (prefersReducedMotion()) {
        stepEdgeScroll(direction);
        return;
      }
      if (edgeScrollTimer.current !== null) return;
      edgeScrollTimer.current = setInterval((): void => {
        stepEdgeScroll(direction);
      }, TAB_DRAG_EDGE_SCROLL_INTERVAL_MS);
    },
    [edgeScrollDirectionAt, stepEdgeScroll],
  );

  const insertionSlotAt = useCallback((clientX: number): number => {
    const strip = stripRef.current;
    if (strip === null) return 0;
    const items = [...strip.querySelectorAll<HTMLElement>('[data-tab-item]')];
    for (const [index, item] of items.entries()) {
      const rect = item.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return index;
    }
    return items.length;
  }, []);

  const dropDraggedTab = useCallback(
    (documentId: string, fromIndex: number, slot: number): void => {
      const targetIndex = targetIndexForSlot(slot, fromIndex);
      if (targetIndex === fromIndex) return;
      onReorder(documentId, targetIndex);
    },
    [onReorder],
  );

  const beginGrab = useCallback(
    (documentId: string, fromIndex: number, startX: number): void => {
      endDrag();
      suppressActivationClick.current = false;
      pendingGrab.current = { documentId, fromIndex, startX };

      const move = (event: MouseEvent): void => {
        const pending = pendingGrab.current;
        if (
          activeDrag.current === null &&
          pending !== null &&
          Math.abs(event.clientX - pending.startX) >= TAB_DRAG_THRESHOLD_PX
        ) {
          activeDrag.current = {
            documentId: pending.documentId,
            fromIndex: pending.fromIndex,
          };
          setDraggingDocumentId(pending.documentId);
          suppressActivationClick.current = true;
        }
        if (activeDrag.current === null) return;
        event.preventDefault();
        setInsertionSlot(insertionSlotAt(event.clientX));
        updateEdgeScroll(event.clientX);
      };
      const up = (event: MouseEvent): void => {
        const drag = activeDrag.current;
        const slot = drag === null ? null : insertionSlotAt(event.clientX);
        endDrag();
        if (drag === null || slot === null) return;
        dropDraggedTab(drag.documentId, drag.fromIndex, slot);
      };
      const cancelKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        if (activeDrag.current === null && pendingGrab.current === null) return;
        event.preventDefault();
        endDrag();
      };
      const cancelPointer = (): void => endDrag();

      const target = globalThis.document;
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', cancelPointer);
      target.addEventListener('keydown', cancelKey, true);
      dragTeardown.current = (): void => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', cancelPointer);
        target.removeEventListener('keydown', cancelKey, true);
      };
    },
    [dropDraggedTab, endDrag, insertionSlotAt, updateEdgeScroll],
  );

  const handleTabListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const target = event.key === 'Home' ? tabs[0] : tabs.at(-1);
        if (target !== undefined) focusDocument(target.id);
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const current = tabs.findIndex((tab) => tab.active);
      if (current < 0) return;
      event.preventDefault();
      const next =
        event.key === 'ArrowLeft'
          ? Math.max(0, current - 1)
          : Math.min(tabs.length - 1, current + 1);
      const target = tabs[next];
      if (target === undefined) return;
      focusDocument(target.id);
      onActivate(target.id);
    },
    [focusDocument, onActivate, tabs],
  );

  return (
    <Bar
      ariaLabel={ariaLabel}
      className={`${styles.tabBar} ${className ?? ''}`.trim()}
      main={
        <div
          ref={stripRef}
          aria-label={ariaLabel}
          className={styles.tabStrip}
          data-tabs-overflowing={tabsOverflowing ? 'true' : undefined}
          role="tablist"
          onKeyDown={handleTabListKeyDown}
        >
          {tabs.flatMap((tab, index) => {
            const labelParts = tab.labelParts;
            const item = (
              <div
                className={styles.tabItem}
                data-tab-dragging={
                  tab.id === draggingDocumentId ? 'true' : undefined
                }
                data-tab-item=""
                key={tab.id}
                role="presentation"
              >
                <button
                  aria-controls={tab.controls}
                  aria-label={`${tab.label}${tab.conflictBlocked && tab.conflictLabel ? ` · ${tab.conflictLabel}` : ''}`}
                  aria-readonly={tab.readOnly ? true : undefined}
                  aria-selected={tab.active}
                  className={styles.tab}
                  data-document-id={tab.id}
                  id={tab.tabId}
                  ref={(element): void => registerTabRef(tab.id, element)}
                  role="tab"
                  tabIndex={tab.active ? 0 : -1}
                  title={tab.title}
                  type="button"
                  onAuxClick={(event): void => {
                    if (event.button !== 1) return;
                    event.preventDefault();
                    onClose(tab.id);
                  }}
                  onClick={(): void => {
                    if (suppressActivationClick.current) {
                      suppressActivationClick.current = false;
                      return;
                    }
                    onActivate(tab.id);
                  }}
                  onContextMenu={(event): void => {
                    event.preventDefault();
                    onContextMenu(tab.id, {
                      point: { x: event.clientX, y: event.clientY },
                    });
                  }}
                  onKeyDown={(event): void => {
                    if (
                      event.key !== 'ContextMenu' &&
                      !(event.key === 'F10' && event.shiftKey)
                    ) {
                      return;
                    }
                    event.preventDefault();
                    onContextMenu(tab.id, {
                      bounds: event.currentTarget.getBoundingClientRect(),
                    });
                  }}
                  onPointerDown={(event): void => {
                    if (event.button !== 0) return;
                    beginGrab(tab.id, index, event.clientX);
                  }}
                >
                  <span
                    aria-hidden={tab.dirty ? undefined : true}
                    aria-label={
                      tab.dirty ? (tab.modifiedLabel ?? 'Modified') : undefined
                    }
                    className={`${styles.modifiedDot} ${tab.writeInFlight ? styles.modifiedDotMuted : ''}`}
                    data-write-in-flight={tab.writeInFlight || undefined}
                  />
                  {tab.conflictBlocked && tab.conflictLabel ? (
                    <span
                      aria-label={tab.conflictLabel}
                      className={styles.modifiedDot}
                      data-conflict-blocked
                    >
                      {tab.conflictLabel}
                    </span>
                  ) : null}
                  <span aria-hidden="true" className={styles.tabLabel}>
                    {labelParts === undefined || labelParts.suffix === '' ? (
                      (labelParts?.basename ?? tab.label)
                    ) : (
                      <>
                        <span
                          className={styles.tabLabelBasename}
                          data-tab-label-basename
                        >
                          {labelParts.basename}
                        </span>
                        <span
                          className={styles.tabLabelSuffix}
                          data-tab-label-suffix
                        >
                          {labelParts.suffix}
                        </span>
                      </>
                    )}
                  </span>
                </button>
                <button
                  aria-label={tab.closeLabel ?? `Close ${tab.label}`}
                  className={styles.tabClose}
                  type="button"
                  onClick={(): void => onClose(tab.id)}
                >
                  <Icon className={styles.tabCloseGlyph} name="close" />
                </button>
              </div>
            );
            return insertionSlot === index
              ? [insertionIndicator(index), item]
              : [item];
          })}
          {insertionSlot === tabs.length
            ? insertionIndicator(tabs.length)
            : null}
          <button
            aria-label={newTabLabel}
            className={styles.tabAdd}
            data-tab-new="true"
            type="button"
            onClick={onAdd}
          >
            <Icon name="add" />
          </button>
        </div>
      }
      overflow="scroll"
      role="tablist-host"
    />
  );
};

export default TabBar;
