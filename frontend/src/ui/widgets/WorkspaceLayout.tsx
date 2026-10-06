import { useCallback, useRef, useState, type CSSProperties, type PropsWithChildren } from 'react';

import { t } from '../../i18n';
import { useAppDispatch, useAppSelector } from '../../logic/store';
import { WORKSPACE_BINDING_WIDTH, setWorkspaceWidth } from '../../logic/store/uiLayoutCommands';
import Sidebar from '../components/Sidebar';
import { useMinimumWindow } from './minimumWindow';
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
    const workspaceVisible = useAppSelector((state) => state.ui.layout.sidebarVisible ?? true);
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
            <main aria-label={t('shell.document')} className={styles.document}>
                {children}
            </main>
        </div>
    );
};

export default WorkspaceLayout;
