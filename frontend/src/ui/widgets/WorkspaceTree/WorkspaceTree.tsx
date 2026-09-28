import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { t } from '../../../i18n';
import { useAppSelector } from '../../../logic/store';
import type { WorkspaceNode, WorkspaceSnapshot } from '../../../logic/store/appModelTypes';
import type { ActionId } from '../../../logic/actions/actionRegistry';
import Banner from '../../primitives/Banner';
import Button from '../../primitives/Button';
import ToolButton from '../../primitives/ToolButton';
import HiddenFoldersToggle from './HiddenFoldersToggle';
import WorkspaceEmptyState from './WorkspaceEmptyState';
import WorkspaceTreeNode from './WorkspaceTreeNode';
import WorkspaceTreeContextMenu from './WorkspaceTreeContextMenu';
import CreateEntryPrompt from './CreateEntryPrompt';
import { useWorkspaceTreeCommands } from './workspaceTreeCommands';
import styles from './WorkspaceTree.module.css';

function containsFileOrUnreadableFolder(node: WorkspaceNode): boolean {
    if (!node.isDir || node.unreadable === true) return true;
    return node.children?.some(containsFileOrUnreadableFolder) ?? false;
}

function visibleNodes(node: WorkspaceNode, expandedPaths: ReadonlySet<string>): WorkspaceNode[] {
    if (!node.isDir || !expandedPaths.has(node.path) || node.unreadable) return [node];
    return [node, ...(node.children ?? []).flatMap((child) => visibleNodes(child, expandedPaths))];
}

function findNode(node: WorkspaceNode, path: string): WorkspaceNode | undefined {
    if (node.path === path) return node;
    for (const child of node.children ?? []) {
        const found = findNode(child, path);
        if (found !== undefined) return found;
    }
    return undefined;
}

function containsDescendant(node: WorkspaceNode, parentPath: string, childPath: string): boolean {
    if (node.path === parentPath) {
        return (
            node.children?.some(
                (child) => child.path === childPath || containsDescendant(child, child.path, childPath),
            ) ?? false
        );
    }
    return node.children?.some((child) => containsDescendant(child, parentPath, childPath)) ?? false;
}

export default function WorkspaceTree(): React.JSX.Element {
    const { onOpenFolder } = useWorkspaceTreeCommands();
    const workspace = useAppSelector((state) => state.workspace.snapshot);
    const reading = useAppSelector((state) => state.workspace.reading);
    if (reading && workspace === null) return <p className={styles.message}>{t('workspace.tree.loading')}</p>;
    if (workspace === null) return <WorkspaceEmptyState onOpenFolder={onOpenFolder} />;
    return <OpenWorkspaceTree workspace={workspace} reading={reading} />;
}

interface OpenWorkspaceTreeProps {
    workspace: WorkspaceSnapshot;
    reading: boolean;
}

function OpenWorkspaceTree({ workspace, reading }: OpenWorkspaceTreeProps): React.JSX.Element {
    const {
        onCloseFolder,
        onRefreshWorkspace,
        onSetWorkspaceHiddenFolders,
        onOpenTreeFile,
        onCreateWorkspaceEntry,
        onRevealWorkspacePath,
        onCopyWorkspacePath,
        onFocusCreatedFile,
        onTreeContextMenu,
    } = useWorkspaceTreeCommands();
    const [contextMenu, setContextMenu] = useState<{ node: WorkspaceNode; point: { x: number; y: number } } | null>(
        null,
    );
    const [createPrompt, setCreatePrompt] = useState<{ kind: 'file' | 'folder'; parentPath: string } | null>(null);
    const activeDocumentId = useAppSelector((state) => state.documents.activeDocumentId);
    const activePath = useAppSelector((state) =>
        activeDocumentId === null ? null : (state.documents.byId[activeDocumentId]?.path ?? null),
    );
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
    const [focusedPath, setFocusedPath] = useState(workspace.rootPath);
    const rowElements = useRef(new Map<string, HTMLLIElement>());
    const focusOwnedByTree = useRef(false);
    useEffect(() => {
        const observeFocus = (event: FocusEvent): void => {
            if (![...rowElements.current.values()].some((row) => row.contains(event.target as Node))) {
                focusOwnedByTree.current = false;
            }
        };
        document.addEventListener('focusin', observeFocus);
        return () => document.removeEventListener('focusin', observeFocus);
    }, []);
    const documents = useAppSelector((state) => state.documents.byId);
    const tabSetRevision = useAppSelector((state) => state.documents.tabSetRevision);
    const openPaths = new Set(
        Object.values(documents)
            .map((document) => document.path)
            .filter((path) => path !== ''),
    );
    const dirtyPaths = new Set(
        Object.values(documents)
            .filter((document) => document.dirty)
            .map((document) => document.path),
    );
    const [collapsedRootPaths, setCollapsedRootPaths] = useState<Set<string>>(() => new Set());
    const [selection, setSelection] = useState<{ activePath: string | null; localPath: string | null }>(() => ({
        activePath,
        localPath: null,
    }));
    if (selection.activePath !== activePath) setSelection({ activePath, localPath: null });
    const selectedPath = selection.activePath === activePath ? (selection.localPath ?? activePath) : activePath;
    const selectedNode = selectedPath === null ? undefined : findNode(workspace.root, selectedPath);
    const headerTarget = selectedNode?.isDir && !selectedNode.unreadable ? selectedNode : workspace.root;
    const emptyResult = !workspace.truncated && !containsFileOrUnreadableFolder(workspace.root);
    const visibleExpandedPaths = useMemo(() => {
        const paths = new Set(expandedPaths);
        if (!collapsedRootPaths.has(workspace.rootPath)) paths.add(workspace.rootPath);
        return paths;
    }, [expandedPaths, collapsedRootPaths, workspace.rootPath]);
    const rows = visibleNodes(workspace.root, visibleExpandedPaths);
    const visibleFocusedPath = rows.some((row) => row.path === focusedPath) ? focusedPath : workspace.rootPath;
    useLayoutEffect(() => {
        if (reading || !focusOwnedByTree.current) return;
        if ([...rowElements.current.values()].some((row) => row === document.activeElement)) return;
        rowElements.current.get(visibleFocusedPath)?.focus();
    }, [reading, visibleFocusedPath, workspace]);

    const onKeyDownRow = (event: KeyboardEvent<HTMLLIElement>, node: WorkspaceNode): void => {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (node.isDir) {
                setSelection({ activePath, localPath: node.path });
                if (!node.unreadable) toggle(node.path);
            } else {
                setSelection({ activePath, localPath: node.path });
                void onOpenTreeFile(node.path, tabSetRevision);
            }
            return;
        }
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const current = rows.findIndex((row) => row.path === node.path);
        const next = Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
        const nextPath = rows[next]?.path;
        if (nextPath !== undefined) {
            setFocusedPath(nextPath);
            rowElements.current.get(nextPath)?.focus();
        }
    };

    const toggle = useCallback(
        (path: string): void => {
            if (
                visibleExpandedPaths.has(path) &&
                containsDescendant(workspace.root, path, focusedPath) &&
                rowElements.current.get(focusedPath) === document.activeElement
            ) {
                rowElements.current.get(path)?.focus();
                setFocusedPath(path);
            }
            if (path === workspace.rootPath) {
                setCollapsedRootPaths((paths) => {
                    const next = new Set(paths);
                    if (next.has(path)) next.delete(path);
                    else next.add(path);
                    return next;
                });
                return;
            }
            setExpandedPaths((paths) => {
                const next = new Set(paths);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
            });
        },
        [workspace.root, workspace.rootPath, focusedPath, visibleExpandedPaths],
    );
    return (
        <div className={styles.tree}>
            <div className={styles.header}>
                <ToolButton
                    icon="add"
                    label={t('workspace.tree.newEntry')}
                    disabled={reading || workspace.unavailable}
                    onActivate={(event): void => {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setContextMenu({ node: headerTarget, point: { x: bounds.left, y: bounds.bottom } });
                    }}
                    variant="icon"
                />
                <ToolButton
                    icon="refresh"
                    label={t('workspace.tree.refresh')}
                    onActivate={(): void => {
                        void onRefreshWorkspace();
                    }}
                    variant="icon"
                />
                <HiddenFoldersToggle pressed={workspace.showHiddenFolders} onChange={onSetWorkspaceHiddenFolders} />
                <ToolButton
                    label={t('workspace.tree.collapseAll')}
                    onActivate={(): void => {
                        setExpandedPaths(new Set());
                        setCollapsedRootPaths(new Set());
                    }}
                    variant="text"
                />
                <ToolButton
                    icon="close"
                    label={t('workspace.tree.closeFolder')}
                    onActivate={(): void => {
                        void onCloseFolder();
                    }}
                    variant="icon"
                />
            </div>
            {reading ? (
                <p className={styles.message}>{t('workspace.tree.loading')}</p>
            ) : workspace.unavailable ? (
                <div className={styles.unavailable}>
                    <Banner
                        notification={{
                            id: 0,
                            kind: 'error',
                            title: t('workspace.tree.unavailable'),
                            message: '',
                            actions: [],
                        }}
                    />
                    <div className={styles.actions}>
                        <Button
                            variant="secondary"
                            onClick={(): void => {
                                void onCloseFolder();
                            }}
                        >
                            {t('workspace.tree.closeFolder')}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={(): void => {
                                void onRefreshWorkspace();
                            }}
                        >
                            {t('workspace.tree.retry')}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className={styles.body}>
                    <ul className={styles.nodes} role="tree" aria-label={t('workspace.tree.label')}>
                        <WorkspaceTreeNode
                            node={workspace.root}
                            depth={0}
                            expandedPaths={visibleExpandedPaths}
                            selectedPath={selectedPath}
                            focusedPath={visibleFocusedPath}
                            openPaths={openPaths}
                            dirtyPaths={dirtyPaths}
                            onToggle={toggle}
                            onSelect={(path): void => setSelection({ activePath, localPath: path })}
                            onOpenFile={(path): void => {
                                void onOpenTreeFile(path, tabSetRevision);
                            }}
                            onFocusRow={(path): void => {
                                focusOwnedByTree.current = true;
                                setFocusedPath(path);
                            }}
                            onKeyDownRow={onKeyDownRow}
                            onContextMenu={(node, point): void => {
                                onTreeContextMenu?.(node, point);
                                setContextMenu({ node, point });
                            }}
                            registerRow={(path, element): void => {
                                if (element === null) rowElements.current.delete(path);
                                else rowElements.current.set(path, element);
                            }}
                        />
                    </ul>
                    {emptyResult ? <p className={styles.message}>{t('workspace.tree.empty')}</p> : null}
                </div>
            )}
            {workspace.truncated ? <p className={styles.message}>{t('workspace.tree.truncated')}</p> : null}
            <div className={styles.chips}>
                {workspace.filterSuffixes.map((suffix) => (
                    <span className={styles.chip} key={suffix}>
                        {suffix}
                    </span>
                ))}
            </div>
            <WorkspaceTreeContextMenu
                node={contextMenu?.node}
                anchor={{ point: contextMenu?.point ?? { x: 0, y: 0 } }}
                open={contextMenu !== null}
                onOpenChange={(open): void => {
                    if (!open) setContextMenu(null);
                }}
                onAction={async (actionId: ActionId, node: WorkspaceNode): Promise<unknown> => {
                    if (actionId === 'new-file-here' || actionId === 'new-folder-here') {
                        setCreatePrompt({
                            kind: actionId === 'new-file-here' ? 'file' : 'folder',
                            parentPath: node.path,
                        });
                        return undefined;
                    }
                    if (actionId === 'reveal-in-file-manager') return onRevealWorkspacePath?.(node.path);
                    if (actionId === 'copy-path') return onCopyWorkspacePath?.(node.path);
                    return undefined;
                }}
                onClose={(): void => setContextMenu(null)}
            />
            {createPrompt !== null ? (
                <CreateEntryPrompt
                    open
                    parentPath={createPrompt.parentPath}
                    kind={createPrompt.kind}
                    supportedSuffixes={workspace.filterSuffixes}
                    onCreate={async (name) => {
                        const result = await onCreateWorkspaceEntry?.(createPrompt.kind, createPrompt.parentPath, name);
                        if (result?.status === 'opened') {
                            setExpandedPaths((paths) => new Set(paths).add(createPrompt.parentPath));
                            if (createPrompt.parentPath === workspace.rootPath) {
                                setCollapsedRootPaths((paths) => {
                                    const next = new Set(paths);
                                    next.delete(workspace.rootPath);
                                    return next;
                                });
                            }
                            setCreatePrompt(null);
                            if (
                                createPrompt.kind === 'file' &&
                                result.openResult?.documentId !== undefined &&
                                (result.openResult.status === 'opened' || result.openResult.status === 'focused')
                            ) {
                                onFocusCreatedFile?.(result.openResult.documentId);
                            }
                        }
                        return result;
                    }}
                    onCancel={(): void => setCreatePrompt(null)}
                />
            ) : null}
        </div>
    );
}
