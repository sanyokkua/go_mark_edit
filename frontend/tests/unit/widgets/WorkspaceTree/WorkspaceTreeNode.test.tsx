import { fireEvent, render, screen } from '@testing-library/react';

import type { WorkspaceNode } from '../../../../src/logic/store/appModelTypes';
import WorkspaceTreeNode from '../../../../src/ui/widgets/WorkspaceTree/WorkspaceTreeNode';

const root: WorkspaceNode = {
    path: '/notes',
    name: 'notes',
    isDir: true,
    children: [
        { path: '/notes/z.md', name: 'z.md', isDir: false },
        { path: '/notes/a.md', name: 'a.md', isDir: false },
    ],
};

function renderNode(overrides: Partial<React.ComponentProps<typeof WorkspaceTreeNode>> = {}) {
    const props: React.ComponentProps<typeof WorkspaceTreeNode> = {
        node: root,
        depth: 0,
        expandedPaths: new Set(['/notes']),
        selectedPath: '/notes/z.md',
        focusedPath: '/notes',
        openPaths: new Set(['/notes/z.md']),
        dirtyPaths: new Set(['/notes/z.md']),
        onToggle: jest.fn(),
        onSelect: jest.fn(),
        onOpenFile: jest.fn(),
        onFocusRow: jest.fn(),
        onKeyDownRow: jest.fn(),
        onContextMenu: jest.fn(),
        registerRow: jest.fn(),
        ...overrides,
    };
    return {
        ...render(
            <ul role="tree" aria-label="Folder files">
                <WorkspaceTreeNode {...props} />
            </ul>,
        ),
        props,
    };
}

it('renders the collapsible root at depth zero and children in their received order', () => {
    const { props } = renderNode();
    expect(screen.getByRole('tree', { name: 'Folder files' })).toBeInTheDocument();
    const group = screen.getByRole('group');
    const rows = screen.getAllByRole('treeitem');
    expect(rows[0]).toContainElement(group);
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['notes', 'z.md', 'a.md']);
    expect(rows[0].querySelector('button')).toHaveClass('rootNode');
    fireEvent.click(rows[0]);
    expect(props.onToggle).toHaveBeenCalledWith('/notes');
});

it('opens a file and keeps selection, open highlight, and unsaved dot independent', () => {
    const { props } = renderNode();
    const row = screen.getByRole('treeitem', { name: 'z.md' });
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveAttribute('aria-description', 'Open in a tab, Unsaved changes');
    expect(row).toHaveAccessibleName('z.md');
    fireEvent.click(row);
    fireEvent.click(row);
    expect(props.onOpenFile).toHaveBeenCalledTimes(2);
    expect(props.onOpenFile).toHaveBeenNthCalledWith(1, '/notes/z.md');
});

it('does not render a child group while a folder is collapsed', () => {
    renderNode({ expandedPaths: new Set() });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
});

it('activates a folder from the chevron and a file from the trailing row space', () => {
    const { props } = renderNode();
    const folder = screen.getByRole('treeitem', { name: 'notes' });
    const chevron = folder.querySelector('svg');
    expect(chevron).not.toBeNull();
    fireEvent.click(chevron!);
    expect(props.onToggle).toHaveBeenCalledWith('/notes');

    const file = screen.getByRole('treeitem', { name: 'z.md' });
    const unsavedMark = file.querySelector('[aria-hidden="true"]');
    expect(unsavedMark).not.toBeNull();
    fireEvent.click(unsavedMark!);
    expect(props.onOpenFile).toHaveBeenCalledWith('/notes/z.md');
    expect(props.onToggle).toHaveBeenCalledTimes(1);
});

it('selects an unreadable folder without expanding and forwards its context point', () => {
    const unreadable: WorkspaceNode = { path: '/notes/broken', name: 'broken', isDir: true, unreadable: true };
    const { props } = renderNode({ node: unreadable });
    const row = screen.getByRole('treeitem', { name: 'broken' });
    fireEvent.click(row);
    expect(props.onSelect).toHaveBeenCalledWith('/notes/broken');
    expect(props.onToggle).not.toHaveBeenCalled();
    expect(row).toHaveAttribute('aria-description', 'Unreadable folder');
    fireEvent.contextMenu(row, { clientX: 12, clientY: 14 });
    expect(props.onContextMenu).toHaveBeenCalledWith(unreadable, { x: 12, y: 14 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
