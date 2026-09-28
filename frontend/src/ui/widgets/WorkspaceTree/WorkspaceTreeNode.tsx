import { useRef, type KeyboardEvent } from 'react';

import type { WorkspaceNode } from '../../../logic/store/appModelTypes';
import { t } from '../../../i18n';
import Button from '../../primitives/Button';
import Icon from '../../primitives/Icon';
import styles from './WorkspaceTree.module.css';

interface WorkspaceTreeNodeProps {
    node: WorkspaceNode;
    depth: number;
    expandedPaths: ReadonlySet<string>;
    selectedPath: string | null;
    focusedPath: string;
    openPaths: ReadonlySet<string>;
    dirtyPaths: ReadonlySet<string>;
    onToggle: (path: string) => void;
    onSelect: (path: string) => void;
    onOpenFile: (path: string) => void;
    onFocusRow: (path: string) => void;
    onKeyDownRow: (event: KeyboardEvent<HTMLLIElement>, node: WorkspaceNode) => void;
    onContextMenu?: (node: WorkspaceNode, point: { x: number; y: number }) => void;
    registerRow: (path: string, element: HTMLLIElement | null) => void;
}

export default function WorkspaceTreeNode({
    node,
    depth,
    expandedPaths,
    selectedPath,
    focusedPath,
    openPaths,
    dirtyPaths,
    onToggle,
    onSelect,
    onOpenFile,
    onFocusRow,
    onKeyDownRow,
    onContextMenu,
    registerRow,
}: WorkspaceTreeNodeProps): React.JSX.Element {
    const rowRef = useRef<HTMLLIElement | null>(null);
    const expanded = expandedPaths.has(node.path);
    const hasVisibleChildren = node.isDir && expanded && !node.unreadable && (node.children?.length ?? 0) > 0;
    const activate = (): void => {
        onSelect(node.path);
        onFocusRow(node.path);
        if (node.isDir) {
            if (!node.unreadable) onToggle(node.path);
        } else onOpenFile(node.path);
    };
    return (
        <li
            ref={(element): void => {
                rowRef.current = element;
                registerRow(node.path, element);
            }}
            className={styles.node}
            role="treeitem"
            aria-expanded={node.isDir && !node.unreadable ? expanded : undefined}
            aria-selected={selectedPath === node.path}
            aria-description={
                [
                    ...(node.unreadable ? [t('workspace.tree.unreadable')] : []),
                    ...(openPaths.has(node.path) ? [t('workspace.tree.openInTab')] : []),
                    ...(dirtyPaths.has(node.path) ? [t('workspace.tree.unsaved')] : []),
                ].join(', ') || undefined
            }
            aria-label={node.name}
            tabIndex={focusedPath === node.path ? 0 : -1}
            onClick={(event): void => {
                if (event.target instanceof Element && event.target.closest('li') !== event.currentTarget) return;
                rowRef.current?.focus();
                activate();
            }}
            onContextMenu={(event): void => {
                if (event.target instanceof Element && event.target.closest('li') !== event.currentTarget) return;
                event.preventDefault();
                onSelect(node.path);
                onContextMenu?.(node, { x: event.clientX, y: event.clientY });
            }}
            onFocus={(event): void => {
                if (event.target === event.currentTarget) onFocusRow(node.path);
            }}
            onKeyDown={(event): void => {
                if (event.target === event.currentTarget) onKeyDownRow(event, node);
            }}
        >
            <div className={styles.nodeRow}>
                <Button
                    variant="quiet"
                    className={`${styles.nodeButton} ${openPaths.has(node.path) ? styles.openNode : ''} ${depth === 0 ? styles.rootNode : ''}`}
                    aria-label={node.name}
                    tabIndex={-1}
                >
                    {node.isDir ? (
                        <Icon name="chevron" className={expanded ? styles.chevronExpanded : undefined} />
                    ) : (
                        <span className={styles.chevronSpacer} />
                    )}
                    <Icon name={node.isDir ? 'folder' : 'file'} />
                    <span className={styles.nodeLabel} title={node.name}>
                        {node.name}
                    </span>
                    {node.unreadable ? <Icon name="warning" className={styles.trailingMark} /> : null}
                    {dirtyPaths.has(node.path) ? <span aria-hidden="true" className={styles.dirtyDot} /> : null}
                </Button>
            </div>
            {hasVisibleChildren ? (
                <ul className={styles.children} role="group">
                    {node.children?.map((child) => (
                        <WorkspaceTreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            expandedPaths={expandedPaths}
                            selectedPath={selectedPath}
                            focusedPath={focusedPath}
                            openPaths={openPaths}
                            dirtyPaths={dirtyPaths}
                            onToggle={onToggle}
                            onSelect={onSelect}
                            onOpenFile={onOpenFile}
                            onFocusRow={onFocusRow}
                            onKeyDownRow={onKeyDownRow}
                            onContextMenu={onContextMenu}
                            registerRow={registerRow}
                        />
                    ))}
                </ul>
            ) : null}
        </li>
    );
}
