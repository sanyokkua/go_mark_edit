import { act, fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';

import type { WorkspaceNode, WorkspaceSnapshot } from '../../../../src/logic/store/appModelTypes';
import { store } from '../../../../src/logic/store';
import {
    applyStatePatch,
    hydrateProjection,
    resetProjection,
} from '../../../../src/logic/store/appModelProjectionActions';
import { setWorkspaceReading } from '../../../../src/logic/store/workspaceSlice';
import WorkspaceTree from '../../../../src/ui/widgets/WorkspaceTree/WorkspaceTree';
import {
    WorkspaceTreeCommandsContext,
    type WorkspaceTreeCommands,
} from '../../../../src/ui/widgets/WorkspaceTree/workspaceTreeCommands';
import { documentFixture } from '../../../support/appFixtures';

const rootPath = '/notes';
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

function node(name: string, isDir: boolean, children?: WorkspaceNode[]): WorkspaceNode {
    return {
        path: `${rootPath}/${name}`,
        name,
        isDir,
        ...(children === undefined ? {} : { children }),
    };
}

function snapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
    return {
        rootPath,
        rootName: 'notes',
        root: {
            path: rootPath,
            name: 'notes',
            isDir: true,
            children: [
                node('Folder', true, [node('inside.md', false)]),
                node('readme.md', false),
                node('other.md', false),
            ],
        },
        totalEntries: 4,
        truncated: false,
        unavailable: false,
        filterSuffixes: ['.md', '.markdown', '.mdown', '.txt'],
        showHiddenFolders: false,
        ...overrides,
    };
}

function hydrate(workspace: WorkspaceSnapshot | undefined, activePath?: string): void {
    const active = activePath === undefined ? undefined : { ...documentFixture('active'), path: activePath };
    store.dispatch(
        hydrateProjection({
            revision: 1,
            tabSetRevision: 1,
            activeDocumentId: active === undefined ? null : 'active',
            orderedDocumentIds: active === undefined ? [] : ['active'],
            documents: active === undefined ? {} : { active },
            workspace,
            ui: {},
        }),
    );
}

const commands: WorkspaceTreeCommands = {
    onOpenFolder: jest.fn(),
    onCloseFolder: jest.fn(),
    onRefreshWorkspace: jest.fn(),
    onSetWorkspaceHiddenFolders: jest.fn(),
    onOpenTreeFile: jest.fn(),
};

function renderTree(
    revealRequest?: React.ComponentProps<typeof WorkspaceTree>['revealRequest'],
): ReturnType<typeof rtlRender> {
    return renderTreeWithCommands(commands, revealRequest);
}

function renderTreeWithCommands(
    value: WorkspaceTreeCommands,
    revealRequest?: React.ComponentProps<typeof WorkspaceTree>['revealRequest'],
): ReturnType<typeof rtlRender> {
    return rtlRender(
        <Provider store={store}>
            <WorkspaceTreeCommandsContext.Provider value={value}>
                <WorkspaceTree revealRequest={revealRequest} />
            </WorkspaceTreeCommandsContext.Provider>
        </Provider>,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    store.dispatch(resetProjection());
});

afterEach(() => {
    if (scrollIntoViewDescriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDescriptor);
});

describe('WorkspaceTree', () => {
    it('opens a file through the tree command and keeps one keyboard tab stop', () => {
        hydrate(snapshot());
        renderTree();
        fireEvent.click(screen.getByRole('treeitem', { name: 'readme.md' }));
        expect(commands.onOpenTreeFile).toHaveBeenCalledWith(`${rootPath}/readme.md`, 1);
        expect(screen.getByRole('treeitem', { name: 'notes' })).toHaveAttribute('tabindex', '-1');
        expect(screen.getByRole('treeitem', { name: 'readme.md' })).toHaveAttribute('tabindex', '0');
    });

    it('renders the root at depth zero and keeps the backend child order', () => {
        hydrate(
            snapshot({
                root: {
                    path: rootPath,
                    name: 'notes',
                    isDir: true,
                    children: [node('z.md', false), node('a.md', false)],
                },
            }),
        );
        renderTree();
        const rows = screen
            .getAllByRole('treeitem')
            .filter((button) => ['notes', 'z.md', 'a.md'].includes(button.getAttribute('aria-label') ?? ''));
        expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['notes', 'z.md', 'a.md']);
        expect(rows[0].querySelector('button')).toHaveClass('rootNode');
        expect(rows[0]).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(rows[0]);
        expect(screen.queryByRole('button', { name: 'z.md' })).not.toBeInTheDocument();
    });

    it('passes a right click row and point to the context callback and opens its action menu', () => {
        hydrate(snapshot());
        const onTreeContextMenu = jest.fn();
        renderTreeWithCommands({ ...commands, onTreeContextMenu });
        fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'notes' }), { clientX: 30, clientY: 40 });
        expect(onTreeContextMenu).toHaveBeenCalledWith(snapshot().root, { x: 30, y: 40 });
        expect(screen.getByRole('menu', { name: 'Workspace item actions' })).toBeInTheDocument();
    });

    it('moves keyboard focus over visible rows and ignores collapsed children', () => {
        hydrate(snapshot());
        renderTree();
        const root = screen.getByRole('treeitem', { name: 'notes' });
        root.focus();
        fireEvent.keyDown(root, { key: 'ArrowDown' });
        expect(screen.getByRole('treeitem', { name: 'Folder' })).toHaveFocus();
        fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Folder' }), { key: 'ArrowDown' });
        expect(screen.getByRole('treeitem', { name: 'readme.md' })).toHaveFocus();
    });

    it('keeps selection, open highlight, and unsaved mark independent', () => {
        const dirty = { ...documentFixture('active'), path: `${rootPath}/readme.md`, dirty: true };
        store.dispatch(
            hydrateProjection({
                revision: 1,
                tabSetRevision: 1,
                activeDocumentId: 'active',
                orderedDocumentIds: ['active'],
                documents: { active: dirty },
                workspace: snapshot(),
                ui: {},
            }),
        );
        renderTree();
        const row = screen.getByRole('treeitem', { name: 'readme.md' });
        expect(row).toHaveAttribute('aria-selected', 'true');
        expect(row).toHaveAttribute('aria-description', 'Open in a tab, Unsaved changes');
        expect(row).toHaveAccessibleName('readme.md');
        fireEvent.click(screen.getByRole('treeitem', { name: 'Folder' }));
        expect(row).toHaveAttribute('aria-selected', 'false');
        expect(row).toHaveAttribute('aria-description', 'Open in a tab, Unsaved changes');
        expect(row).toHaveAccessibleName('readme.md');
    });

    it('selects an unreadable folder without expanding it and exposes its warning', () => {
        hydrate(
            snapshot({
                root: {
                    path: rootPath,
                    name: 'notes',
                    isDir: true,
                    children: [{ ...node('Unreadable', true, [node('inside.md', false)]), unreadable: true }],
                },
            }),
        );
        renderTree();
        const row = screen.getByRole('treeitem', { name: 'Unreadable' });
        fireEvent.click(row);
        expect(row).toHaveAttribute('aria-selected', 'true');
        expect(row).not.toHaveAttribute('aria-expanded', 'true');
        expect(row).toHaveAttribute('aria-description', 'Unreadable folder');
        expect(screen.queryByRole('button', { name: 'inside.md' })).not.toBeInTheDocument();
    });

    it('uses Enter to open a focused file and leaves Left and Right inert', () => {
        hydrate(snapshot());
        renderTree();
        const root = screen.getByRole('treeitem', { name: 'notes' });
        root.focus();
        fireEvent.keyDown(root, { key: 'ArrowRight' });
        expect(screen.getByRole('treeitem', { name: 'Folder' })).toHaveAttribute('aria-expanded', 'false');
        fireEvent.keyDown(root, { key: 'ArrowDown' });
        const folder = screen.getByRole('treeitem', { name: 'Folder' });
        fireEvent.keyDown(folder, { key: 'Enter' });
        expect(folder).toHaveAttribute('aria-expanded', 'true');
        const file = screen.getByRole('treeitem', { name: 'inside.md' });
        fireEvent.keyDown(file, { key: 'Enter' });
        expect(commands.onOpenTreeFile).toHaveBeenCalledWith(`${rootPath}/inside.md`, 1);
    });

    it('moves focus to a folder before collapsing its focused descendant', () => {
        hydrate(snapshot());
        renderTree();
        const folder = screen.getByRole('treeitem', { name: 'Folder' });
        fireEvent.click(folder);
        const child = screen.getByRole('treeitem', { name: 'inside.md' });
        child.focus();
        fireEvent.click(folder);
        expect(screen.queryByRole('button', { name: 'inside.md' })).not.toBeInTheDocument();
        expect(folder).toHaveFocus();
        expect(folder).toHaveAttribute('tabindex', '0');
    });

    it('restores tree focus to the root when a refresh removes the focused file', () => {
        hydrate(snapshot());
        renderTree();
        const file = screen.getByRole('treeitem', { name: 'readme.md' });
        file.focus();
        act(() => {
            void store.dispatch(
                applyStatePatch({
                    revision: 2,
                    workspace: snapshot({
                        root: {
                            path: rootPath,
                            name: 'notes',
                            isDir: true,
                            children: [node('other.md', false)],
                        },
                    }),
                }),
            );
        });
        expect(screen.queryByRole('button', { name: 'readme.md' })).not.toBeInTheDocument();
        expect(screen.getByRole('treeitem', { name: 'notes' })).toHaveFocus();
    });

    it('keeps header focus when a refresh removes a previously focused file', () => {
        hydrate(snapshot());
        renderTree();
        screen.getByRole('treeitem', { name: 'readme.md' }).focus();
        const refresh = screen.getByRole('button', { name: 'Refresh' });
        refresh.focus();
        act(() => {
            void store.dispatch(
                applyStatePatch({
                    revision: 2,
                    workspace: snapshot({ root: { path: rootPath, name: 'notes', isDir: true, children: [] } }),
                }),
            );
        });
        expect(refresh).toHaveFocus();
    });

    it('restores a focused row after the reading state temporarily unmounts the tree', () => {
        hydrate(snapshot());
        renderTree();
        screen.getByRole('treeitem', { name: 'readme.md' }).focus();
        act(() => {
            store.dispatch(setWorkspaceReading(true));
        });
        expect(screen.queryByRole('button', { name: 'readme.md' })).not.toBeInTheDocument();
        act(() => {
            store.dispatch(setWorkspaceReading(false));
        });
        expect(screen.getByRole('treeitem', { name: 'readme.md' })).toHaveFocus();
    });
    it('shows the no-folder state and invokes the shared Open Folder command', () => {
        hydrate(undefined);
        renderTree();

        expect(screen.getByText('No folder open')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Show hidden folders' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
        expect(commands.onOpenFolder).toHaveBeenCalledTimes(1);
    });

    it('shows loading during the initial folder read before a snapshot exists', () => {
        hydrate(undefined);
        store.dispatch(setWorkspaceReading(true));
        renderTree();

        expect(screen.getByText(/loading/i)).toBeVisible();
        expect(screen.queryByText('No folder open')).not.toBeInTheDocument();
    });

    it('replaces the tree with a loading state while a folder read is pending', () => {
        hydrate(snapshot());
        store.dispatch(setWorkspaceReading(true));
        renderTree();

        expect(screen.getByText(/loading/i)).toBeVisible();
        expect(screen.queryByText('readme.md')).not.toBeInTheDocument();
    });

    it('shows an unavailable banner with Close and Retry recovery actions', () => {
        hydrate(snapshot({ unavailable: true }));
        renderTree();

        expect(screen.getByRole('alert')).toHaveTextContent('This folder is no longer available');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        const unavailableState = within(screen.getByRole('alert').parentElement!);
        fireEvent.click(unavailableState.getByRole('button', { name: 'Close Folder' }));
        expect(commands.onRefreshWorkspace).toHaveBeenCalledTimes(1);
        expect(commands.onCloseFolder).toHaveBeenCalledTimes(1);
    });

    it('shows the empty-result message when the backend counts the root as its only entry', () => {
        hydrate(
            snapshot({
                totalEntries: 1,
                root: { path: rootPath, name: 'notes', isDir: true, children: [] },
            }),
        );
        renderTree();

        expect(screen.getByText('notes')).toBeVisible();
        expect(screen.getByText('No matching files')).toBeVisible();
    });

    it('shows the empty-result message for empty subfolders without matching files', () => {
        hydrate(
            snapshot({
                totalEntries: 2,
                root: { path: rootPath, name: 'notes', isDir: true, children: [node('Empty', true, [])] },
            }),
        );
        renderTree();

        expect(screen.getByText('notes')).toBeVisible();
        expect(screen.getByText('Empty')).toBeVisible();
        expect(screen.getByText('No matching files')).toBeVisible();
    });

    it('does not show the empty-result message when a complete snapshot contains files', () => {
        hydrate(snapshot());
        renderTree();

        expect(screen.getByText('readme.md')).toBeVisible();
        expect(screen.queryByText('No matching files')).not.toBeInTheDocument();
    });

    it('does not show an empty-result message for a truncated snapshot with no visible file', () => {
        hydrate(
            snapshot({
                totalEntries: 20_000,
                truncated: true,
                root: { path: rootPath, name: 'notes', isDir: true, children: [] },
            }),
        );
        renderTree();

        expect(screen.queryByText('No matching files')).not.toBeInTheDocument();
        expect(screen.getByText('Showing the first 20,000 items — some files are not listed.')).toBeVisible();
    });

    it('does not show an empty-result message for an unreadable-only subtree', () => {
        hydrate(
            snapshot({
                totalEntries: 2,
                root: {
                    path: rootPath,
                    name: 'notes',
                    isDir: true,
                    children: [{ ...node('Unreadable', true), unreadable: true }],
                },
            }),
        );
        renderTree();

        expect(screen.getByText('Unreadable')).toBeVisible();
        expect(screen.queryByText('No matching files')).not.toBeInTheDocument();
    });

    it('keeps the truncation row visible without presenting a computed total', () => {
        hydrate(snapshot({ totalEntries: 20000, truncated: true }));
        const { rerender } = renderTree();

        expect(screen.getByText('Showing the first 20,000 items — some files are not listed.')).toBeVisible();
        expect(screen.queryByText(/20,001|total of/i)).not.toBeInTheDocument();
        act(() => {
            void store.dispatch(applyStatePatch({ revision: 2, workspace: snapshot({ truncated: true }) }));
        });
        rerender(
            <Provider store={store}>
                <WorkspaceTreeCommandsContext.Provider value={commands}>
                    <WorkspaceTree />
                </WorkspaceTreeCommandsContext.Provider>
            </Provider>,
        );
        expect(screen.getByText('Showing the first 20,000 items — some files are not listed.')).toBeVisible();
    });

    it('shows fixed, non-interactive filter suffix chips', () => {
        hydrate(snapshot());
        renderTree();

        for (const suffix of ['.md', '.markdown', '.mdown', '.txt']) {
            expect(screen.getByText(suffix).tagName).toBe('SPAN');
            expect(screen.queryByRole('button', { name: suffix })).not.toBeInTheDocument();
        }
    });

    it('exposes Refresh, hidden-folder toggle, Collapse all, and Close Folder controls', () => {
        hydrate(snapshot());
        renderTree();

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        const hiddenFolders = screen.getByRole('button', { name: 'Show hidden folders' });
        expect(hiddenFolders).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(hiddenFolders);
        expect(commands.onRefreshWorkspace).toHaveBeenCalledTimes(1);
        expect(commands.onSetWorkspaceHiddenFolders).toHaveBeenCalledWith(true);
        expect(screen.getByRole('button', { name: 'Collapse all' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Close Folder' }));
        expect(commands.onCloseFolder).toHaveBeenCalledTimes(1);
    });

    it('starts with the root expanded and Collapse all returns to the initial tree shape', () => {
        hydrate(snapshot());
        renderTree();

        const root = screen.getByRole('treeitem', { name: 'notes' });
        const folder = screen.getByRole('treeitem', { name: 'Folder' });
        expect(root).toHaveAttribute('aria-expanded', 'true');
        expect(folder).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(folder);
        expect(screen.getByText('inside.md')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
        expect(screen.queryByText('inside.md')).not.toBeInTheDocument();
        expect(root).toHaveAttribute('aria-expanded', 'true');
        expect(folder).toHaveAttribute('aria-expanded', 'false');
    });

    it('preserves expanded folders and the selected path when a replacement snapshot arrives', () => {
        hydrate(snapshot(), `${rootPath}/Folder/inside.md`);
        const { rerender } = renderTree();
        fireEvent.click(screen.getByRole('treeitem', { name: 'Folder' }));
        expect(screen.getByText('inside.md')).toBeVisible();
        fireEvent.click(screen.getByRole('treeitem', { name: 'inside.md' }));

        const replacement = snapshot();
        act(() => {
            void store.dispatch(applyStatePatch({ revision: 2, workspace: replacement }));
        });
        rerender(
            <Provider store={store}>
                <WorkspaceTreeCommandsContext.Provider value={commands}>
                    <WorkspaceTree />
                </WorkspaceTreeCommandsContext.Provider>
            </Provider>,
        );

        expect(screen.getByText('inside.md')).toBeVisible();
        expect(screen.getByRole('treeitem', { name: 'inside.md' })).toHaveAttribute('aria-selected', 'true');
    });

    it('resets expansion and selection when the folder closes and the same path reopens', () => {
        hydrate(snapshot());
        renderTree();
        fireEvent.click(screen.getByRole('treeitem', { name: 'Folder' }));
        fireEvent.click(screen.getByRole('treeitem', { name: 'readme.md' }));
        expect(screen.getByRole('treeitem', { name: 'inside.md' })).toBeVisible();

        act(() => {
            void store.dispatch(applyStatePatch({ revision: 2, workspace: null }));
        });
        expect(screen.getByText('No folder open')).toBeVisible();

        act(() => {
            void store.dispatch(applyStatePatch({ revision: 3, workspace: snapshot() }));
        });

        expect(screen.queryByText('inside.md')).not.toBeInTheDocument();
        expect(screen.getByRole('treeitem', { name: 'Folder' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('treeitem', { name: 'readme.md' })).toHaveAttribute('aria-selected', 'false');
    });

    it('follows the active document path when it changes after a local row selection', () => {
        hydrate(snapshot(), `${rootPath}/readme.md`);
        renderTree();
        fireEvent.click(screen.getByRole('treeitem', { name: 'Folder' }));
        fireEvent.click(screen.getByRole('treeitem', { name: 'inside.md' }));
        expect(screen.getByRole('treeitem', { name: 'inside.md' })).toHaveAttribute('aria-selected', 'true');

        const otherDocument = { ...documentFixture('other'), path: `${rootPath}/other.md` };
        act(() => {
            void store.dispatch(
                applyStatePatch({
                    revision: 2,
                    activeDocumentId: 'other',
                    orderedDocumentIds: ['active', 'other'],
                    documents: { upsert: { other: otherDocument } },
                }),
            );
        });

        expect(screen.getByRole('treeitem', { name: 'other.md' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('treeitem', { name: 'inside.md' })).toHaveAttribute('aria-selected', 'false');
    });

    it('reveals a linked row through collapsed ancestors, leaves unrelated folders alone, and scrolls after rendering', () => {
        const nested = node('docs', true, [
            {
                ...node('sub', true),
                path: '/notes/docs/sub',
                children: [{ ...node('b.md', false), path: '/notes/docs/sub/b.md' }],
            },
        ]);
        hydrate(
            snapshot({ root: { path: rootPath, name: 'notes', isDir: true, children: [nested, node('other', true)] } }),
            '/notes/a.md',
        );
        const { rerender } = renderTree({ documentId: 'other', path: '/notes/docs/sub/b.md', seq: 1 });
        expect(screen.queryByRole('treeitem', { name: 'b.md' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('treeitem', { name: 'notes' }));
        const scroll = jest.fn();
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
        const target = { ...documentFixture('other'), path: '/notes/alias/b.md' };
        act(() => {
            store.dispatch(
                applyStatePatch({
                    revision: 2,
                    activeDocumentId: 'other',
                    orderedDocumentIds: ['active', 'other'],
                    documents: { upsert: { other: target } },
                }),
            );
        });
        rerender(
            <Provider store={store}>
                <WorkspaceTreeCommandsContext.Provider value={commands}>
                    <WorkspaceTree revealRequest={{ documentId: 'other', path: '/notes/docs/sub/b.md', seq: 1 }} />
                </WorkspaceTreeCommandsContext.Provider>
            </Provider>,
        );
        expect(screen.getByRole('treeitem', { name: 'notes' })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('treeitem', { name: 'docs' })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('treeitem', { name: 'sub' })).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('treeitem', { name: 'other' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('treeitem', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
        expect(scroll).toHaveBeenCalledTimes(1);
        rerender(
            <Provider store={store}>
                <WorkspaceTreeCommandsContext.Provider value={commands}>
                    <WorkspaceTree revealRequest={{ documentId: 'other', path: '/notes/docs/sub/b.md', seq: 1 }} />
                </WorkspaceTreeCommandsContext.Provider>
            </Provider>,
        );
        expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('replaces a pending reveal and ignores an unknown path', () => {
        hydrate(snapshot(), '/notes/readme.md');
        const tree = (request: React.ComponentProps<typeof WorkspaceTree>['revealRequest']): React.JSX.Element => (
            <Provider store={store}>
                <WorkspaceTreeCommandsContext.Provider value={commands}>
                    <WorkspaceTree revealRequest={request} />
                </WorkspaceTreeCommandsContext.Provider>
            </Provider>
        );
        const { rerender } = rtlRender(tree({ documentId: 'later', path: '/notes/Folder/inside.md', seq: 1 }));
        rerender(tree({ documentId: 'later', path: '/notes/other.md', seq: 2 }));
        const target = { ...documentFixture('later'), path: '/notes/other.md' };
        act(() => {
            store.dispatch(
                applyStatePatch({
                    revision: 2,
                    activeDocumentId: 'later',
                    orderedDocumentIds: ['active', 'later'],
                    documents: { upsert: { later: target } },
                }),
            );
        });
        expect(screen.getByRole('treeitem', { name: 'Folder' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('treeitem', { name: 'other.md' })).toHaveAttribute('aria-selected', 'true');
        rerender(tree({ documentId: 'later', path: '/notes/missing.md', seq: 3 }));
        expect(screen.getByRole('treeitem', { name: 'other.md' })).toHaveAttribute('aria-selected', 'true');
    });

    it('retains the last in-tree selection when an outside document becomes active', () => {
        hydrate(snapshot(), '/notes/readme.md');
        renderTree();
        fireEvent.click(screen.getByRole('treeitem', { name: 'other.md' }));
        const outside = { ...documentFixture('outside'), path: '/elsewhere/outside.md' };
        act(() => {
            store.dispatch(
                applyStatePatch({
                    revision: 2,
                    activeDocumentId: 'outside',
                    orderedDocumentIds: ['active', 'outside'],
                    documents: { upsert: { outside } },
                }),
            );
        });
        expect(screen.getByRole('treeitem', { name: 'other.md' })).toHaveAttribute('aria-selected', 'true');
    });

    it('retains an implicit active row selection when an outside document becomes active', () => {
        hydrate(snapshot(), '/notes/readme.md');
        renderTree();
        const outside = { ...documentFixture('outside'), path: '/elsewhere/outside.md' };
        act(() => {
            store.dispatch(
                applyStatePatch({
                    revision: 2,
                    activeDocumentId: 'outside',
                    orderedDocumentIds: ['active', 'outside'],
                    documents: { upsert: { outside } },
                }),
            );
        });
        expect(screen.getByRole('treeitem', { name: 'readme.md' })).toHaveAttribute('aria-selected', 'true');
    });

    it('retains selection when the new active document has no rendered row', () => {
        hydrate(
            snapshot({
                root: {
                    path: rootPath,
                    name: 'notes',
                    isDir: true,
                    children: [
                        node('readme.md', false),
                        {
                            ...node('blocked', true),
                            unreadable: true,
                            children: [{ ...node('hidden.md', false), path: '/notes/blocked/hidden.md' }],
                        },
                    ],
                },
            }),
            '/notes/readme.md',
        );
        renderTree();
        const hidden = { ...documentFixture('hidden'), path: '/notes/blocked/hidden.md' };
        act(() => {
            store.dispatch(
                applyStatePatch({
                    revision: 2,
                    activeDocumentId: 'hidden',
                    orderedDocumentIds: ['active', 'hidden'],
                    documents: { upsert: { hidden } },
                }),
            );
        });
        expect(screen.getByRole('treeitem', { name: 'readme.md' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('treeitem', { name: 'hidden.md' })).not.toBeInTheDocument();
    });

    it('keeps the existing selection when a request names a row hidden by an unreadable folder', () => {
        hydrate(
            snapshot({
                root: {
                    path: rootPath,
                    name: 'notes',
                    isDir: true,
                    children: [
                        node('readme.md', false),
                        {
                            ...node('blocked', true),
                            unreadable: true,
                            children: [{ ...node('hidden.md', false), path: '/notes/blocked/hidden.md' }],
                        },
                    ],
                },
            }),
            '/notes/readme.md',
        );
        renderTree({ documentId: 'active', path: '/notes/blocked/hidden.md', seq: 1 });
        expect(screen.getByRole('treeitem', { name: 'readme.md' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('treeitem', { name: 'hidden.md' })).not.toBeInTheDocument();
    });
});
