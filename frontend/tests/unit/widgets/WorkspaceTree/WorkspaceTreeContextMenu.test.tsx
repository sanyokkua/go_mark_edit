import { render, screen } from '@testing-library/react';
import { actionsForSurface, getActionAvailability } from '../../../../src/logic/actions/actionRegistry';
import type { WorkspaceNode } from '../../../../src/logic/store/appModelTypes';
import WorkspaceTreeContextMenu from '../../../../src/ui/widgets/WorkspaceTree/WorkspaceTreeContextMenu';

const folder: WorkspaceNode = { path: '/notes', name: 'notes', isDir: true };

it('exposes exactly the four tree actions from the registry', () => {
    expect(actionsForSurface('tree-context').map((entry) => entry.id)).toEqual([
        'new-file-here',
        'new-folder-here',
        'reveal-in-file-manager',
        'copy-path',
    ]);
});

it.each([
    [folder, ['new-file-here', 'new-folder-here', 'reveal-in-file-manager', 'copy-path']],
    [{ ...folder, path: '/notes/sub' }, ['new-file-here', 'new-folder-here', 'reveal-in-file-manager', 'copy-path']],
    [{ ...folder, unreadable: true }, ['reveal-in-file-manager', 'copy-path']],
    [{ path: '/notes/file.md', name: 'file.md', isDir: false }, ['reveal-in-file-manager', 'copy-path']],
] as const)('offers only valid actions for %j', (node, expected) => {
    render(
        <WorkspaceTreeContextMenu
            node={node}
            anchor={{ point: { x: 5, y: 5 } }}
            open
            onOpenChange={jest.fn()}
            onAction={jest.fn()}
            onClose={jest.fn()}
        />,
    );
    expect(screen.getAllByRole('menuitem').map((item) => item.getAttribute('data-action-id'))).toEqual(expected);
    expect(screen.queryByText(/rename|move|delete/i)).toBeNull();
    for (const action of expected) {
        expect(
            getActionAvailability(action, {
                workspaceOpen: true,
                targetPath: node.path,
                targetNodeIsDir: node.isDir,
                targetNodeUnreadable: 'unreadable' in node && node.unreadable === true,
            }).kind,
        ).toBe('available');
    }
});
