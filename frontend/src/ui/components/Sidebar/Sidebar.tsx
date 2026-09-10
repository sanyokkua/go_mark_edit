import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import styles from './Sidebar.module.css';

export type SidebarSide = 'left' | 'right';

export interface SidebarProps {
  ariaLabel?: string;
  children?: ReactNode;
  collapsed: boolean;
  minWidth: number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
  resizeAriaLabel?: string;
  side: SidebarSide;
  width: number;
}

interface DragState {
  pointerId: number;
  startWidth: number;
  startX: number;
}

function clampWidth(width: number, minWidth: number): number {
  return Math.max(minWidth, Math.round(width));
}

const Sidebar: React.FC<SidebarProps> = ({
  ariaLabel,
  children,
  collapsed,
  minWidth,
  onResize,
  onResizeEnd,
  resizeAriaLabel,
  side,
  width,
}: SidebarProps): React.JSX.Element => {
  const dragRef = useRef<DragState | null>(null);
  const latestWidthRef = useRef(width);

  useEffect((): void => {
    latestWidthRef.current = width;
  }, [width]);

  useEffect((): (() => void) => {
    const onPointerMove = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (
        drag === null ||
        (event.pointerId !== 0 && event.pointerId !== drag.pointerId)
      ) {
        return;
      }

      const direction = side === 'left' ? 1 : -1;
      const nextWidth = clampWidth(
        drag.startWidth + direction * (event.clientX - drag.startX),
        minWidth,
      );
      latestWidthRef.current = nextWidth;
      onResize(nextWidth);
    };

    const onPointerUp = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (
        drag === null ||
        (event.pointerId !== 0 && event.pointerId !== drag.pointerId)
      ) {
        return;
      }
      dragRef.current = null;
      onResizeEnd(latestWidthRef.current);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return (): void => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [minWidth, onResize, onResizeEnd, side]);

  useEffect((): void => {
    if (collapsed) {
      dragRef.current = null;
    }
  }, [collapsed]);

  const sidebarStyle = {
    '--sidebar-min-width': `${minWidth}px`,
    '--sidebar-width': `${width}px`,
  } as CSSProperties;
  const resolvedAriaLabel =
    ariaLabel ?? (side === 'left' ? 'Workspace' : 'Sidebar');

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const decrement = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
    const increment = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key !== decrement && event.key !== increment) return;
    event.preventDefault();
    const currentWidth = latestWidthRef.current;
    const nextWidth = clampWidth(
      currentWidth + (event.key === increment ? 16 : -16),
      minWidth,
    );
    latestWidthRef.current = nextWidth;
    onResize(nextWidth);
    onResizeEnd(nextWidth);
  };

  return (
    <>
      <aside
        aria-hidden={collapsed || undefined}
        aria-label={resolvedAriaLabel}
        className={styles.sidebar}
        data-sidebar-side={side}
        hidden={collapsed}
        style={sidebarStyle}
      >
        {children}
      </aside>
      {collapsed ? null : (
        <div
          aria-label={resizeAriaLabel ?? `Resize ${resolvedAriaLabel}`}
          aria-orientation="vertical"
          aria-valuemin={minWidth}
          aria-valuenow={width}
          className={styles.divider}
          data-sidebar-resize="true"
          role="separator"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={(event): void => {
            dragRef.current = {
              pointerId: event.pointerId,
              startWidth: width,
              startX: event.clientX,
            };
            latestWidthRef.current = width;
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
        />
      )}
    </>
  );
};

export default Sidebar;
