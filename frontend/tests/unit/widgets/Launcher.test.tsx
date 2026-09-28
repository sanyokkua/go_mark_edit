import { fireEvent, render, screen, within } from '@testing-library/react';

import Launcher from '../../../src/ui/widgets/Launcher';

// automatically", which is proved by App.test.tsx because this file renders the
// launcher rather than driving startup)
it('Launcher first-run and ten recent items route by kind', () => {
    const onNewDocument = jest.fn();
    const onOpenDocument = jest.fn();
    const onOpenRecentItem = jest.fn();
    const { rerender } = render(
        <Launcher onNewDocument={onNewDocument} onOpenDocument={onOpenDocument} onOpenRecentItem={onOpenRecentItem} />,
    );

    expect(screen.getByText('Create a new Markdown file or open one from disk.')).toBeVisible();
    expect(screen.getByText('No recent items yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'New File' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open File' }));
    expect(onNewDocument).toHaveBeenCalledTimes(1);
    expect(onOpenDocument).toHaveBeenCalledTimes(1);

    const recentItems = [
        { path: '/tmp/folder', kind: 'folder' as const },
        ...Array.from({ length: 10 }, (_, index) => ({ path: `/tmp/file-${index}.md`, kind: 'file' as const })),
    ];
    rerender(<Launcher recentItems={recentItems} onOpenRecentItem={onOpenRecentItem} />);
    const recent = within(screen.getByLabelText('Recent items'));
    expect(recent.getAllByRole('button')).toHaveLength(10);
    expect(recent.getByRole('button', { name: 'folder' }).querySelector('[data-icon-name="folder"]')).toBeVisible();
    fireEvent.click(recent.getByRole('button', { name: 'file-0.md' }));
    expect(onOpenRecentItem).toHaveBeenCalledWith({ path: '/tmp/file-0.md', kind: 'file' });
    fireEvent.click(recent.getByRole('button', { name: 'folder' }));
    expect(onOpenRecentItem).toHaveBeenCalledWith({ path: '/tmp/folder', kind: 'folder' });
});

it('renders translated launcher strings without invented path labels', () => {
    render(
        <Launcher
            recentItems={[
                { path: '/tmp/archive/one.md', kind: 'file' },
                { path: '/tmp/two.md', kind: 'file' },
            ]}
        />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Start a document');
    expect(screen.getByText('Continue with a recent file or choose an action.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'New File' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open File' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeEnabled();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Recent items');
    expect(screen.queryByText('~/Notes/archive')).toBeNull();
    expect(screen.queryByText('~/Notes/projects')).toBeNull();
});

it('opens a folder through the supplied action', () => {
    const onOpenFolder = jest.fn();
    render(<Launcher onOpenFolder={onOpenFolder} />);

    const button = screen.getByRole('button', { name: 'Open Folder' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onOpenFolder).toHaveBeenCalledTimes(1);
});
