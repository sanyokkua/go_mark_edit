import { fireEvent, render, screen, within } from '@testing-library/react';

import Launcher from '../../../src/ui/widgets/Launcher';

// automatically", which is proved by App.test.tsx because this file renders the
// launcher rather than driving startup)
it('Launcher first-run and six recent files', () => {
  const onNewDocument = jest.fn();
  const onOpenDocument = jest.fn();
  const onOpenRecentFile = jest.fn();
  const { rerender } = render(
    <Launcher
      onNewDocument={onNewDocument}
      onOpenDocument={onOpenDocument}
      onOpenRecentFile={onOpenRecentFile}
    />,
  );

  expect(
    screen.getByText('Create a new Markdown file or open one from disk.'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open Folder' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'New File' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open File' }));
  expect(onNewDocument).toHaveBeenCalledTimes(1);
  expect(onOpenDocument).toHaveBeenCalledTimes(1);

  const recentFiles = Array.from(
    { length: 7 },
    (_, index) => `/tmp/file-${index}.md`,
  );
  rerender(
    <Launcher recentFiles={recentFiles} onOpenRecentFile={onOpenRecentFile} />,
  );
  const recent = within(screen.getByLabelText('Recent files'));
  expect(recent.getAllByRole('button')).toHaveLength(6);
  fireEvent.click(recent.getByRole('button', { name: 'file-0.md' }));
  expect(onOpenRecentFile).toHaveBeenCalledWith('/tmp/file-0.md');
});

it('renders translated launcher strings without invented path labels', () => {
  render(<Launcher recentFiles={['/tmp/archive/one.md', '/tmp/two.md']} />);

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Start a document',
  );
  expect(
    screen.getByText('Continue with a recent file or choose an action.'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'New File' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open File' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open Folder' })).toBeDisabled();
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
    'Recent files',
  );
  expect(screen.queryByText('~/Notes/archive')).toBeNull();
  expect(screen.queryByText('~/Notes/projects')).toBeNull();
});
