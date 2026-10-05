import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import styles from './Sidebar.module.css';
import { useHorizontalResize } from '../useHorizontalResize';

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
    const latestWidthRef = useRef(width);

    useEffect((): void => {
        latestWidthRef.current = width;
    }, [width]);

    const onPointerDown = useHorizontalResize({
        value: width,
        disabled: collapsed,
        identity: side,
        unitsPerPixel: () => (side === 'left' ? 1 : -1),
        constrain: (value) => clampWidth(value, minWidth),
        onResize: (value): void => {
            latestWidthRef.current = value;
            onResize(value);
        },
        onCommit: onResizeEnd,
    });

    const sidebarStyle = {
        '--sidebar-min-width': `${minWidth}px`,
        '--sidebar-width': `${width}px`,
    } as CSSProperties;
    const resolvedAriaLabel = ariaLabel ?? (side === 'left' ? 'Workspace' : 'Sidebar');

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        const decrement = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
        const increment = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
        if (event.key !== decrement && event.key !== increment) return;
        event.preventDefault();
        const currentWidth = latestWidthRef.current;
        const nextWidth = clampWidth(currentWidth + (event.key === increment ? 16 : -16), minWidth);
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
                    onPointerDown={onPointerDown}
                />
            )}
        </>
    );
};

export default Sidebar;
