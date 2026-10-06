import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { t } from '../../../i18n';
import { useAppDispatch, useAppSelector } from '../../../logic/store';
import { leaveReading, toggleReadingSidebar, toggleReadingTabs } from '../../../logic/store/readingSlice';
import ToolButton from '../../primitives/ToolButton';
import styles from './ReadingControls.module.css';

export interface ReadingControlsProps {
    /** False while no workspace is open or the window is at the minimum width. */
    sidebarAvailable: boolean;
    /** Width of the sidebar overlay, so its control can stay at the overlay's edge. */
    sidebarWidth: number;
}

interface EdgeHover {
    top: boolean;
    left: boolean;
}

/**
 * Tracks whether the pointer is anywhere along the window's top or left edge, up to the far side of the matching
 * control, so the whole edge is the hover target instead of only the icon. It listens on the window and takes no
 * pointer events, so scrolling and selecting in the document are never blocked.
 */
function useEdgeHover(
    tabsRef: React.RefObject<HTMLElement | null>,
    sidebarRef: React.RefObject<HTMLElement | null>,
): EdgeHover {
    const [edge, setEdge] = useState<EdgeHover>({ top: false, left: false });
    useEffect((): (() => void) => {
        const update = (next: EdgeHover): void =>
            setEdge((previous) => (previous.top === next.top && previous.left === next.left ? previous : next));
        const onMove = (event: MouseEvent): void => {
            const tabs = tabsRef.current?.getBoundingClientRect();
            const sidebar = sidebarRef.current?.getBoundingClientRect();
            update({
                top: tabs !== undefined && event.clientY <= tabs.bottom,
                left: sidebar !== undefined && event.clientX <= sidebar.right,
            });
        };
        const onLeave = (): void => update({ top: false, left: false });
        window.addEventListener('mousemove', onMove);
        document.documentElement.addEventListener('mouseleave', onLeave);
        return (): void => {
            window.removeEventListener('mousemove', onMove);
            document.documentElement.removeEventListener('mouseleave', onLeave);
        };
    }, [sidebarRef, tabsRef]);
    return edge;
}

/**
 * The three controls Reading mode offers: Exit, Show or hide sidebar and Show or hide tab bar. Each is invisible at
 * rest and overlays the window padding, so none takes space from the rendered document.
 */
const ReadingControls: React.FC<ReadingControlsProps> = ({
    sidebarAvailable,
    sidebarWidth,
}: ReadingControlsProps): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const sidebarShown = useAppSelector((state) => state.reading.sidebarShown);
    const tabsShown = useAppSelector((state) => state.reading.tabsShown);
    const tabsRef = useRef<HTMLButtonElement>(null);
    const sidebarRef = useRef<HTMLButtonElement>(null);
    const edge = useEdgeHover(tabsRef, sidebarRef);
    const style = { '--reading-sidebar-offset': `${sidebarWidth}px` } as CSSProperties;

    return (
        <div className={styles.controls} style={style}>
            <ToolButton
                className={`${styles.control} ${styles.exit}`}
                data-reading-control="exit"
                icon="close"
                label={t('reading.exit')}
                variant="icon"
                onActivate={(): void => {
                    dispatch(leaveReading());
                }}
            />
            {sidebarAvailable ? (
                <ToolButton
                    className={`${styles.control} ${styles.sidebar}`}
                    ref={sidebarRef}
                    data-edge-hover={edge.left}
                    data-reading-control="sidebar"
                    data-shown={sidebarShown}
                    icon="sidebar"
                    label={t('reading.sidebar.toggle')}
                    variant="icon"
                    onActivate={(): void => {
                        dispatch(toggleReadingSidebar());
                    }}
                />
            ) : null}
            <ToolButton
                className={`${styles.control} ${styles.tabs}`}
                ref={tabsRef}
                data-edge-hover={edge.top}
                data-reading-control="tabs"
                data-shown={tabsShown}
                icon="tabs"
                label={t('reading.tabs.toggle')}
                variant="icon"
                onActivate={(): void => {
                    dispatch(toggleReadingTabs());
                }}
            />
        </div>
    );
};

export default ReadingControls;
