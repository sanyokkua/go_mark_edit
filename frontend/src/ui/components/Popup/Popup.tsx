import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  forwardRef,
} from 'react';

import styles from './Popup.module.css';

export type PopupSize = 'menu' | 'wide' | 'details';
export type PopupRole = 'menu' | 'dialog-less region';

export type PopupAnchor =
  | { trigger: HTMLElement | null | RefObject<HTMLElement | null> }
  | { point: { x: number; y: number } }
  | { bounds: DOMRect };

export type PopupInitialFocus =
  | 'first'
  | 'last'
  | 'popup'
  | string
  | HTMLElement
  | (() => HTMLElement | null);

export interface PopupProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'role'
> {
  readonly anchor: PopupAnchor;
  readonly children: React.ReactNode;
  readonly initialFocus?: PopupInitialFocus;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly returnFocusTo?: HTMLElement | null | RefObject<HTMLElement | null>;
  readonly role: PopupRole;
  readonly size: PopupSize;
}

export interface PopupTriggerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-expanded' | 'aria-haspopup' | 'type'
> {
  readonly expanded: boolean;
  readonly onOpen?: (trigger: HTMLButtonElement) => void;
}

interface Placement {
  left: number;
  top: number;
  maxBlockSize?: number;
}

function applicationFrame(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('.application-frame');
}

function resolveTrigger(
  trigger: HTMLElement | null | RefObject<HTMLElement | null>,
): HTMLElement | null {
  if (trigger === null) return null;
  if ('current' in trigger) return trigger.current;
  return trigger;
}

function viewportSize(): { width: number; height: number } {
  return {
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  };
}

function frameMetrics(frame: HTMLElement | null): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const viewport = viewportSize();
  if (frame === null) {
    return { height: viewport.height, left: 0, top: 0, width: viewport.width };
  }
  const bounds = frame.getBoundingClientRect();
  return {
    height: bounds.height || viewport.height,
    left: bounds.left,
    top: bounds.top,
    width: bounds.width || viewport.width,
  };
}

function anchorMetrics(
  anchor: PopupAnchor,
  frame: { left: number; top: number },
): { left: number; top: number; anchorTop: number } {
  if ('point' in anchor) {
    return {
      anchorTop: anchor.point.y - frame.top,
      left: anchor.point.x - frame.left,
      top: anchor.point.y - frame.top,
    };
  }
  const bounds =
    'bounds' in anchor
      ? anchor.bounds
      : (resolveTrigger(anchor.trigger)?.getBoundingClientRect() ??
        new DOMRect());
  return {
    anchorTop: bounds.top - frame.top,
    left: bounds.left - frame.left,
    top: bounds.bottom - frame.top,
  };
}

function isVisibleMenuItem(item: HTMLElement): boolean {
  let current: HTMLElement | null = item;
  while (current !== null) {
    const computed = getComputedStyle(current);
    if (
      computed.display === 'none' ||
      computed.visibility === 'hidden' ||
      current.getAttribute('aria-hidden') === 'true'
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function menuItems(popup: HTMLElement | null): HTMLElement[] {
  if (popup === null) return [];
  return Array.from(
    popup.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
    ),
  ).filter(
    (item) =>
      !item.hasAttribute('disabled') &&
      item.getAttribute('aria-disabled') !== 'true' &&
      isVisibleMenuItem(item),
  );
}

function focusTarget(
  popup: HTMLElement,
  initialFocus: PopupInitialFocus | undefined,
): HTMLElement {
  if (typeof HTMLElement !== 'undefined' && initialFocus instanceof HTMLElement)
    return initialFocus;
  if (typeof initialFocus === 'function') {
    const target = initialFocus();
    if (target !== null) return target;
  }
  if (
    typeof initialFocus === 'string' &&
    !['first', 'last', 'popup'].includes(initialFocus)
  ) {
    const target = popup.querySelector<HTMLElement>(initialFocus);
    if (target !== null) return target;
  }
  const items = menuItems(popup);
  if (initialFocus === 'last') return items.at(-1) ?? popup;
  if (initialFocus === 'popup') return popup;
  return items[0] ?? popup;
}

function focusRelative(popup: HTMLElement, offset: number): void {
  const items = menuItems(popup);
  if (items.length === 0) {
    popup.focus();
    return;
  }
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    current < 0 ? 0 : (current + offset + items.length) % items.length;
  items[next]?.focus();
}

/**
 * The single non-modal menu surface. Radix supplies the menu root context and
 * this component owns the portal and virtual-anchor geometry because some
 * consumers open at a pointer point or at a tab's bounds rather than at a DOM
 * trigger.
 */
const Popup = ({
  anchor,
  children,
  className,
  initialFocus,
  onKeyDown,
  onOpenChange,
  open,
  returnFocusTo,
  role,
  size,
  style,
  ...rest
}: PopupProps): React.JSX.Element => {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const typeahead = useRef('');
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [placement, setPlacement] = useState<Placement | null>(null);
  const frame = applicationFrame();

  const handleOpenChange = useCallback(
    (next: boolean): void => {
      if (!next) setPlacement(null);
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const place = useCallback((): void => {
    const popup = popupRef.current;
    if (popup === null) return;
    const metrics = frameMetrics(frame);
    const anchorPosition = anchorMetrics(anchor, metrics);
    const popupBounds = popup.getBoundingClientRect();
    const width = popupBounds.width || popup.offsetWidth;
    const height = popupBounds.height || popup.offsetHeight;
    const margin = 8;
    const maximumLeft = Math.max(margin, metrics.width - width - margin);
    const left = Math.min(Math.max(margin, anchorPosition.left), maximumLeft);
    const availableHeight = Math.max(margin, metrics.height - margin * 2);
    const shouldConstrain = popup.scrollHeight > availableHeight;
    const maxBlockSize = shouldConstrain ? availableHeight : undefined;
    const bottom = anchorPosition.top + height;
    const top =
      bottom <= metrics.height - margin
        ? anchorPosition.top
        : Math.max(margin, anchorPosition.anchorTop - height - margin);
    const boundedTop = Math.min(
      Math.max(margin, top),
      Math.max(margin, metrics.height - height - margin),
    );
    setPlacement((current) =>
      current?.left === left &&
      current.top === boundedTop &&
      current.maxBlockSize === maxBlockSize
        ? current
        : { left, maxBlockSize, top: boundedTop },
    );
  }, [anchor, frame]);

  useLayoutEffect((): (() => void) | undefined => {
    if (!open) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return (): void => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useLayoutEffect((): (() => void) | undefined => {
    if (!open) return undefined;
    wasOpen.current = true;
    if (popupRef.current !== null) {
      focusTarget(popupRef.current, initialFocus).focus({
        preventScroll: true,
      });
    }
    return undefined;
  }, [initialFocus, open, placement]);

  useEffect((): (() => void) | undefined => {
    if (open) return undefined;
    if (!wasOpen.current) return undefined;
    wasOpen.current = false;
    const anchorTrigger =
      'trigger' in anchor ? resolveTrigger(anchor.trigger) : null;
    const target = resolveTrigger(returnFocusTo ?? anchorTrigger) ?? undefined;
    target?.focus();
    return undefined;
  }, [anchor, open, returnFocusTo]);

  useEffect((): (() => void) | undefined => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      const trigger =
        'trigger' in anchor ? resolveTrigger(anchor.trigger) : null;
      if (popupRef.current?.contains(target) || trigger?.contains(target)) {
        return;
      }
      handleOpenChange(false);
    };
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);
    return (): void => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [anchor, handleOpenChange, open]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented || popupRef.current === null) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRelative(popupRef.current, 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRelative(popupRef.current, -1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      menuItems(popupRef.current)[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      menuItems(popupRef.current).at(-1)?.focus();
      return;
    }
    if (
      event.key.length !== 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    typeahead.current += event.key.toLocaleLowerCase();
    if (typeaheadTimer.current !== undefined) {
      clearTimeout(typeaheadTimer.current);
    }
    typeaheadTimer.current = setTimeout((): void => {
      typeahead.current = '';
      typeaheadTimer.current = undefined;
    }, 500);
    const items = menuItems(popupRef.current);
    const search = typeahead.current;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const ordered = [
      ...items.slice(current + 1),
      ...items.slice(0, current + 1),
    ];
    ordered
      .find((item) =>
        item.textContent?.trim().toLocaleLowerCase().startsWith(search),
      )
      ?.focus();
  };

  useEffect(
    () => (): void => {
      if (typeaheadTimer.current !== undefined) {
        clearTimeout(typeaheadTimer.current);
      }
    },
    [],
  );

  const popupStyle: CSSProperties = {
    ...style,
    ...(placement === null
      ? { visibility: 'hidden' as const }
      : {
          left: placement.left,
          top: placement.top,
          ...(placement.maxBlockSize === undefined
            ? {}
            : {
                maxBlockSize: placement.maxBlockSize,
                overflowY: 'auto' as const,
              }),
        }),
  };

  return (
    <DropdownMenu.Root
      modal={false}
      open={open}
      onOpenChange={handleOpenChange}
    >
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              {...rest}
              ref={popupRef}
              className={`${styles.surface} ${styles[size]} ${className ?? ''}`.trim()}
              data-popup-size={size}
              role={role === 'dialog-less region' ? 'region' : 'menu'}
              style={popupStyle}
              tabIndex={-1}
              onKeyDown={handleKeyDown}
            >
              {children}
            </div>,
            frame ?? document.body,
          )
        : null}
    </DropdownMenu.Root>
  );
};

export const PopupTrigger = forwardRef<HTMLButtonElement, PopupTriggerProps>(
  function PopupTrigger(
    {
      children,
      className,
      expanded,
      onKeyDown,
      onOpen,
      ...rest
    }: PopupTriggerProps,
    ref,
  ): React.JSX.Element {
    return (
      <button
        {...rest}
        ref={ref}
        aria-expanded={expanded}
        aria-haspopup="menu"
        className={`${styles.trigger} ${className ?? ''}`.trim()}
        type="button"
        onKeyDown={(event): void => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (
            event.key !== 'ArrowDown' &&
            event.key !== 'Enter' &&
            event.key !== ' '
          ) {
            return;
          }
          event.preventDefault();
          onOpen?.(event.currentTarget);
        }}
      >
        {children}
      </button>
    );
  },
);

export const ForwardedPopupTrigger = PopupTrigger;

export const PopupSeparator: React.FC = (): React.JSX.Element => (
  <div aria-hidden="true" className={styles.separator} />
);

export const PopupGroupLabel: React.FC<React.PropsWithChildren> = ({
  children,
}: React.PropsWithChildren): React.JSX.Element => (
  <div className={styles.groupLabel}>{children}</div>
);

export default Popup;
