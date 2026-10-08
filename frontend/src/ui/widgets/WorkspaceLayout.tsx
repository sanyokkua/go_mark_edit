import { useCallback, useEffect, useRef, useState, type CSSProperties, type PropsWithChildren } from 'react';

import { t } from '../../i18n';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import { toggleReadingSidebar } from '../../logic/store/readingSlice';
import { WORKSPACE_BINDING_WIDTH, setWorkspaceWidth } from '../../logic/store/uiLayoutCommands';
import Sidebar from '../components/Sidebar';
import { useMinimumWindow } from './minimumWindow';
import ReadingControls from './ReadingControls/ReadingControls';
import WorkspaceTree, { type WorkspaceTreeProps } from './WorkspaceTree/WorkspaceTree';
import styles from './AppShell.module.css';

export interface WorkspaceLayoutProps extends PropsWithChildren {
    documentState: 'active' | 'empty';
    treeRevealRequest?: WorkspaceTreeProps['revealRequest'];
}

interface PendingWidth {
    acknowledgedWidth: number;
    value: number;
}

const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
    children,
    documentState,
    treeRevealRequest,
}: WorkspaceLayoutProps): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const minimumWindow = useMinimumWindow();
    const reading = useAppSelector((state) => state.reading.active);
    const readingSidebarShown = useAppSelector((state) => state.reading.sidebarShown);
    const workspaceOpen = useAppSelector((state) => state.workspace.snapshot !== null);
    const workspaceVisible = useAppSelector((state) => state.ui.layout.sidebarVisible ?? false);
    const acknowledgedWidth = useAppSelector((state) => state.ui.layout.sidebarWidth ?? WORKSPACE_BINDING_WIDTH);
    const [pendingWidth, setPendingWidth] = useState<PendingWidth | undefined>();
    const pendingWidthRef = useRef<number | undefined>(undefined);
    const workspaceWidth =
        pendingWidth !== undefined &&
        workspaceVisible &&
        (pendingWidth.acknowledgedWidth === acknowledgedWidth || pendingWidth.value === acknowledgedWidth)
            ? pendingWidth.value
            : acknowledgedWidth;

    const requestWidth = useCallback(
        (width: number): void => {
            const nextWidth = Math.max(0, Math.round(width));
            pendingWidthRef.current = nextWidth;
            setPendingWidth({ acknowledgedWidth, value: nextWidth });
            void dispatch(setWorkspaceWidth(nextWidth))
                .unwrap()
                .catch((): void => {
                    if (pendingWidthRef.current !== nextWidth) return;
                    pendingWidthRef.current = undefined;
                    setPendingWidth(undefined);
                });
        },
        [acknowledgedWidth, dispatch],
    );

    const sidebarAvailable = workspaceOpen && !minimumWindow;
    // An overlay that can no longer be shown must not count as open, or Escape would close nothing visible.
    useEffect((): void => {
        if (readingSidebarShown && !sidebarAvailable) dispatch(toggleReadingSidebar());
    }, [dispatch, readingSidebarShown, sidebarAvailable]);
    const shellStyle = {
        '--shell-left-width': `${workspaceWidth}px`,
    } as CSSProperties;

    return (
        <div
            className={styles.shell}
            data-document-state={documentState}
            data-reading={reading || undefined}
            data-testid="application-shell"
            data-workspace-visible={String(workspaceVisible)}
            style={shellStyle}
        >
            {minimumWindow || reading ? null : (
                <Sidebar
                    ariaLabel={t('shell.sidebar')}
                    collapsed={!workspaceVisible}
                    minWidth={0}
                    onResize={requestWidth}
                    onResizeEnd={(): void => undefined}
                    resizeAriaLabel={t('shell.sidebar.resize')}
                    side="left"
                    width={workspaceWidth}
                >
                    <WorkspaceTree revealRequest={treeRevealRequest} />
                </Sidebar>
            )}
            {reading && readingSidebarShown && sidebarAvailable ? (
                <aside
                    aria-label={t('shell.sidebar')}
                    className={styles.readingSidebar}
                    data-reading-overlay="sidebar"
                    style={{ width: `${acknowledgedWidth}px` }}
                >
                    <WorkspaceTree revealRequest={treeRevealRequest} />
                </aside>
            ) : null}
            <main aria-label={t('shell.document')} className={styles.document}>
                {children}
            </main>
            {reading ? <ReadingControls sidebarAvailable={sidebarAvailable} sidebarWidth={acknowledgedWidth} /> : null}
        </div>
    );
};

export default WorkspaceLayout;
